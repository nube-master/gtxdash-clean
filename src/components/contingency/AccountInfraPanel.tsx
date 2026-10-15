import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperationId } from "@/contexts/OperationContext";
import { useTrafficData } from "@/hooks/useTrafficData";
import { useRealSales } from "@/hooks/useRealSales";
import { useRedTrackSales } from "@/hooks/useRedTrackSales";
import { mergeAllSales } from "@/lib/salesMerge";
import { useCampaignStatuses } from "@/hooks/useCampaignStatuses";
import { ChevronDown, ChevronUp, Zap, Home, Key, Sprout, CircleCheck, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { format, subDays } from "date-fns";

function fmtCur(v: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);
}

type InfraCategory = "own" | "rented" | "farm" | "available";

interface AccountInfo {
  accountId: string;
  accountName: string;
  currency: string;
  category: string;
  accountStatus: number;
  spend: number;
  revenue: number;
  roas: number;
  isWarming: boolean;
  recentSpend: number;
  daysIdle: number;
}

export default function AccountInfraPanel() {
  const [expanded, setExpanded] = useState<InfraCategory | null>(null);
  const opId = useOperationId();

  const { data: accounts } = useQuery({
    queryKey: ["meta-ad-accounts-infra", opId],
    enabled: !!opId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meta_ad_accounts")
        .select("*")
        .eq("is_active", true)
        .eq("operation_id", opId!);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: trafficData } = useTrafficData();
  const { data: salesDataRaw } = useRealSales();
  const { data: redTrackSalesRaw } = useRedTrackSales();
  const { data: campaignStatuses } = useCampaignStatuses();
  const { data: utmAliases } = useQuery({
    queryKey: ["account-utm-aliases", opId],
    enabled: !!opId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_utm_aliases")
        .select("account_id, utm_aliases")
        .eq("operation_id", opId!);
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch last 30 days spend per account to detect idle accounts + last active date
  const thirtyDaysAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");
  const { data: recentTraffic } = useQuery({
    queryKey: ["traffic-last-30d", thirtyDaysAgo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mv_traffic_spend_by_account")
        .select("account_id, total_spend, date")
        .gte("date", thirtyDaysAgo);
      if (error) throw error;
      return data || [];
    },
  });

  const { ownAccounts, rentedAccounts, farmAccounts, availableAccounts, totals } = useMemo(() => {
    const accs = accounts || [];
    const traffic = trafficData || [];
    const campaigns = campaignStatuses || [];
    const sales = mergeAllSales(salesDataRaw || [], redTrackSalesRaw || []);

    // Spend per account
    const spendByAccount = new Map<string, number>();
    for (const t of traffic) {
      spendByAccount.set(t.account_id, (spendByAccount.get(t.account_id) || 0) + Number(t.spend));
    }

    // Revenue per account — AUTHORITATIVE mapping
    // Priority 1: account_utm_aliases (manual, 1:1 reliable)
    // Priority 2: campaign_name → account_id from traffic_data (most spend wins for tag collisions)
    const revenueByAccount = new Map<string, number>();

    // Build alias → account_id from authoritative aliases table
    const aliasToAccount = new Map<string, string>();
    for (const alias of utmAliases || []) {
      for (const utm of alias.utm_aliases || []) {
        // Clean brackets if present (e.g. "[BMGTX-C/A-DB-03-RENTAL]" → "BMGTX-C/A-DB-03-RENTAL")
        const clean = utm.replace(/^\[|\]$/g, "").toLowerCase().trim();
        if (clean) aliasToAccount.set(clean, alias.account_id);
      }
    }

    // Build campaign_name → account_id from traffic (SPEND-WEIGHTED to resolve collisions)
    // When the same campaign_name appears in multiple accounts, the account with the most spend wins
    const campaignSpendByAccount = new Map<string, Map<string, number>>();
    for (const t of traffic) {
      const cn = (t.campaign_name || "").toLowerCase().trim();
      if (!cn) continue;
      if (!campaignSpendByAccount.has(cn)) campaignSpendByAccount.set(cn, new Map());
      const inner = campaignSpendByAccount.get(cn)!;
      inner.set(t.account_id, (inner.get(t.account_id) || 0) + Number(t.spend));
    }
    const campaignNameToAccount = new Map<string, string>();
    for (const [cn, accSpend] of campaignSpendByAccount) {
      let bestAcc = "";
      let bestSpend = -1;
      for (const [accId, sp] of accSpend) {
        if (sp > bestSpend) { bestSpend = sp; bestAcc = accId; }
      }
      if (bestAcc) campaignNameToAccount.set(cn, bestAcc);
    }

    // Attribute sales to accounts
    function resolveAccountForSale(utmCampaign: string | null | undefined): string | null {
      if (!utmCampaign) return null;
      const utm = String(utmCampaign);
      // 1) Exact campaign_name match in traffic (most reliable)
      const exactMatch = campaignNameToAccount.get(utm.toLowerCase().trim());
      if (exactMatch) return exactMatch;
      // 2) First bracket tag → alias table
      const tagMatch = utm.match(/\[([^\]]+)\]/);
      if (tagMatch) {
        const tag = tagMatch[1].toLowerCase().trim();
        const aliasMatch = aliasToAccount.get(tag);
        if (aliasMatch) return aliasMatch;
      }
      return null;
    }

    let unattributed = 0;
    const salesCountByAccount = new Map<string, number>();
    for (const sale of sales) {
      const accId = resolveAccountForSale(sale.utm_campaign);
      if (accId) {
        revenueByAccount.set(accId, (revenueByAccount.get(accId) || 0) + Number(sale.revenue));
        salesCountByAccount.set(accId, (salesCountByAccount.get(accId) || 0) + 1);
      } else {
        unattributed += Number(sale.revenue);
      }
    }
    // Distribute unattributed proportionally by spend (only to accounts with attributed sales)
    if (unattributed > 0) {
      const accountsWithSales = Array.from(salesCountByAccount.entries()).filter(([, c]) => c > 0);
      const spendOfAttributed = accountsWithSales.reduce((s, [accId]) => s + (spendByAccount.get(accId) || 0), 0);
      if (spendOfAttributed > 0) {
        for (const [accId] of accountsWithSales) {
          const spend = spendByAccount.get(accId) || 0;
          revenueByAccount.set(accId, (revenueByAccount.get(accId) || 0) + unattributed * (spend / spendOfAttributed));
        }
      }
    }

    // Farm accounts are now defined by category === "farm" (managed in AccountFarmPipeline).
    // Keep "isWarming" flag for backward compat in row badge — derived from category.
    const farmCategoryIds = new Set<string>();
    for (const a of accs) {
      if ((a as any).category === "farm") farmCategoryIds.add(a.account_id);
    }

    // Detect idle/available accounts: compute last spend date + recent 3-day spend
    const recentSpendByAccount = new Map<string, number>();
    const lastSpendDateByAccount = new Map<string, string>();
    const threeDaysAgoStr = format(subDays(new Date(), 3), "yyyy-MM-dd");
    for (const t of recentTraffic || []) {
      const s = Number(t.total_spend);
      if (s > 0) {
        const prev = lastSpendDateByAccount.get(t.account_id);
        if (!prev || t.date > prev) lastSpendDateByAccount.set(t.account_id, t.date);
      }
      if (t.date >= threeDaysAgoStr) {
        recentSpendByAccount.set(t.account_id, (recentSpendByAccount.get(t.account_id) || 0) + s);
      }
    }

    const today = new Date();
    const allAccounts: AccountInfo[] = accs.map((a: any) => {
      const spend = spendByAccount.get(a.account_id) || 0;
      const revenue = revenueByAccount.get(a.account_id) || 0;
      const recentSpend = recentSpendByAccount.get(a.account_id) || 0;
      const lastDate = lastSpendDateByAccount.get(a.account_id);
      const daysIdle = lastDate
        ? Math.floor((today.getTime() - new Date(lastDate + "T12:00:00").getTime()) / (1000 * 60 * 60 * 24))
        : 30; // no record in 30 days = at least 30 days idle
      return {
        accountId: a.account_id,
        accountName: a.account_name || a.account_id,
        currency: a.currency || "BRL",
        category: a.category || "own",
        accountStatus: a.account_status || 1,
        spend,
        revenue,
        roas: spend > 0 ? revenue / spend : 0,
        isWarming: farmCategoryIds.has(a.account_id),
        recentSpend,
        daysIdle,
      };
    });

    const own = allAccounts.filter((a) => a.category === "own").sort((a, b) => b.spend - a.spend);
    const rented = allAccounts.filter((a) => a.category === "rented").sort((a, b) => b.spend - a.spend);
    const farm = allAccounts.filter((a) => a.category === "farm").sort((a, b) => b.spend - a.spend);
    // Available: TRULY ready to advertise — must be:
    // - account_status === 1 (ACTIVE on Meta, no restrictions/blocks/disable)
    // - is_active === true (already filtered in query)
    // - NOT a farm account (farm is in warming pipeline, not production-ready)
    // - NOT spending right now (recentSpend === 0 in last 3 days)
    // - has spend history OR is recent (excludes orphan/zombie accounts that never advertised)
    const available = allAccounts
      .filter((a) => {
        if (a.accountStatus !== 1) return false; // blocked / disabled / restricted
        if (a.category === "farm") return false; // farm is not "available" — it's being warmed
        if (a.recentSpend > 0) return false; // currently spending
        return true;
      })
      .sort((a, b) => b.daysIdle - a.daysIdle);

    return {
      ownAccounts: own,
      rentedAccounts: rented,
      farmAccounts: farm,
      availableAccounts: available,
      totals: {
        own: own.length,
        rented: rented.length,
        farm: farm.length,
        available: available.length,
        total: allAccounts.length,
        ownSpend: own.reduce((s, a) => s + a.spend, 0),
        rentedSpend: rented.reduce((s, a) => s + a.spend, 0),
        farmSpend: farm.reduce((s, a) => s + a.spend, 0),
        ownRevenue: own.reduce((s, a) => s + a.revenue, 0),
        rentedRevenue: rented.reduce((s, a) => s + a.revenue, 0),
        farmRevenue: farm.reduce((s, a) => s + a.revenue, 0),
        ownPct: allAccounts.length > 0 ? (own.length / allAccounts.length) * 100 : 0,
        rentedPct: allAccounts.length > 0 ? (rented.length / allAccounts.length) * 100 : 0,
      },
    };
  }, [accounts, trafficData, salesDataRaw, redTrackSalesRaw, campaignStatuses, recentTraffic, utmAliases]);

  const toggle = (cat: InfraCategory) => setExpanded((prev) => (prev === cat ? null : cat));

  const cards: {
    key: InfraCategory;
    label: string;
    count: number;
    spend: number;
    revenue: number;
    roas: number;
    pct: number;
    icon: React.ElementType;
    color: string;
    glow: string;
    accounts: AccountInfo[];
  }[] = [
    {
      key: "own",
      label: "Contas Próprias",
      count: totals.own,
      spend: totals.ownSpend,
      revenue: totals.ownRevenue,
      roas: totals.ownSpend > 0 ? totals.ownRevenue / totals.ownSpend : 0,
      pct: totals.ownPct,
      icon: Home,
      color: "#00FF88",
      glow: "rgba(0,255,136,0.15)",
      accounts: ownAccounts,
    },
    {
      key: "rented",
      label: "Contas Alugadas",
      count: totals.rented,
      spend: totals.rentedSpend,
      revenue: totals.rentedRevenue,
      roas: totals.rentedSpend > 0 ? totals.rentedRevenue / totals.rentedSpend : 0,
      pct: totals.rentedPct,
      icon: Key,
      color: "#FF9500",
      glow: "rgba(255,149,0,0.15)",
      accounts: rentedAccounts,
    },
    {
      key: "farm",
      label: "Farm (Aquecimento)",
      count: totals.farm,
      spend: totals.farmSpend,
      revenue: totals.farmRevenue,
      roas: totals.farmSpend > 0 ? totals.farmRevenue / totals.farmSpend : 0,
      pct: totals.total > 0 ? (totals.farm / totals.total) * 100 : 0,
      icon: Sprout,
      color: "#A855F7",
      glow: "rgba(168,85,247,0.15)",
      accounts: farmAccounts,
    },
    {
      key: "available",
      label: "Disponíveis",
      count: totals.available,
      spend: 0,
      revenue: 0,
      roas: 0,
      pct: totals.total > 0 ? (totals.available / totals.total) * 100 : 0,
      icon: CircleCheck,
      color: "#3B82F6",
      glow: "rgba(59,130,246,0.15)",
      accounts: availableAccounts,
    },
  ];

  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{
        background: "hsl(var(--card))",
        borderColor: "hsl(var(--border))",
      }}
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-2 border-b" style={{ borderColor: "hsl(var(--border))" }}>
        <Zap className="h-3.5 w-3.5 text-primary" />
        <span
          className="text-[10px] font-black tracking-[0.2em] uppercase text-primary"
          style={{ textShadow: "0 0 12px rgba(255,30,30,0.4)" }}
        >
          Infraestrutura de Contas
        </span>
        <div className="flex-1" />
        <span className="text-[10px] font-mono text-muted-foreground">
          {totals.total} contas ativas
        </span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 divide-x" style={{ borderColor: "hsl(var(--border))" }}>
        {cards.map((card) => {
          const Icon = card.icon;
          const isOpen = expanded === card.key;
          return (
            <button
              key={card.key}
              onClick={() => toggle(card.key)}
              className="text-left px-4 py-4 transition-all hover:bg-secondary/30 relative"
              style={{
                background: isOpen ? card.glow : "transparent",
              }}
            >
              {isOpen && (
                <div
                  className="absolute bottom-0 left-0 right-0 h-[2px]"
                  style={{
                    background: card.color,
                    boxShadow: `0 0 8px ${card.color}60`,
                  }}
                />
              )}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className="h-7 w-7 rounded-md flex items-center justify-center"
                    style={{ background: `${card.color}15`, border: `1px solid ${card.color}25` }}
                  >
                    <Icon className="h-3.5 w-3.5" style={{ color: card.color }} />
                  </div>
                  <span className="text-[10px] font-mono tracking-wider uppercase text-muted-foreground">
                    {card.label}
                  </span>
                </div>
                {isOpen ? (
                  <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono tabular-nums text-foreground">
                  {card.count}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  ({card.pct.toFixed(0)}%)
                </span>
              </div>
              <div className="text-[10px] font-mono text-muted-foreground mt-1 flex items-center gap-3">
                {card.key === "available" ? (
                  <span style={{ color: card.color }}>Aptas, sem gasto há 3+ dias</span>
                ) : card.key === "farm" ? (
                  <>
                    <span style={{ color: card.color }}>Em esteira de aquecimento</span>
                    <span className="text-muted-foreground">{card.count} contas</span>
                  </>
                ) : (
                  <>
                    <span>{fmtCur(card.spend)} invest.</span>
                    <span className="text-emerald-400">{fmtCur(card.revenue)} rec.</span>
                    <span className={card.roas >= 1.2 ? "text-emerald-400" : card.roas >= 1 ? "text-foreground" : card.roas > 0 ? "text-amber-400" : "text-muted-foreground"}>
                      {card.roas > 0 ? `${card.roas.toFixed(2)}x` : "—"}
                    </span>
                  </>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Expandable Account List */}
      {expanded && (
        <>
          <div
            className="h-px"
            style={{
              background: `linear-gradient(90deg, transparent, ${cards.find((c) => c.key === expanded)?.color || "hsl(var(--primary))"}50, transparent)`,
            }}
          />
          <div className="max-h-[320px] overflow-y-auto p-2 space-y-1 scrollbar-thin">
            {cards
              .find((c) => c.key === expanded)
              ?.accounts.map((acc) => (
                <InfraAccountCard key={acc.accountId} account={acc} showDaysIdle={expanded === "available"} />
              ))}
            {cards.find((c) => c.key === expanded)?.accounts.length === 0 && (
              <div className="text-center py-6 text-muted-foreground text-xs font-mono">
                Nenhuma conta nesta categoria
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function InfraAccountCard({ account, showDaysIdle = false }: { account: AccountInfo; showDaysIdle?: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleCopyId = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(account.accountId);
    setCopied(true);
    toast.success("ID copiado!", { description: account.accountId, duration: 2000 });
    setTimeout(() => setCopied(false), 1500);
  };

  const statusConfig: Record<string, { color: string; label: string; glow: string }> = {
    "1": { color: "#00FF88", label: "ATIVA", glow: "0 0 6px rgba(0,255,136,0.5)" },
    "2": { color: "#FF1E1E", label: "DESABILITADA", glow: "0 0 6px rgba(255,30,30,0.5)" },
    default: { color: "#666", label: "RESTRITA", glow: "none" },
  };

  const cfg = statusConfig[String(account.accountStatus)] || statusConfig.default;
  const isUsd = account.currency.toUpperCase() === "USD";

  return (
    <div
      className="rounded-md px-3 py-2.5 transition-all hover:bg-secondary/30"
      style={{
        background: "hsl(var(--secondary) / 0.15)",
        border: "1px solid hsl(var(--border))",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-foreground truncate">
              {account.accountName}
            </span>
            <span
              className="text-[9px] font-mono tracking-wider px-1.5 py-0.5 rounded border"
              style={{
                background: isUsd ? "rgba(255,30,30,0.08)" : "hsl(var(--secondary) / 0.3)",
                borderColor: isUsd ? "rgba(255,30,30,0.2)" : "hsl(var(--border))",
                color: isUsd ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
              }}
            >
              {account.currency}
            </span>
            {account.isWarming && (
              <Badge
                variant="outline"
                className="text-[8px] px-1.5 py-0 border-purple-400/30 text-purple-400 bg-purple-400/5"
              >
                <Sprout className="h-2.5 w-2.5 mr-0.5" />
                FARM
              </Badge>
            )}
            {showDaysIdle && (
              <Badge
                variant="outline"
                className="text-[8px] px-1.5 py-0 border-blue-400/30 text-blue-400 bg-blue-400/5"
              >
                {account.daysIdle >= 30 ? "30+ dias sem gasto" : `${account.daysIdle} dia${account.daysIdle !== 1 ? "s" : ""} sem gasto`}
              </Badge>
            )}
          </div>
          <button
            onClick={handleCopyId}
            className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors group/copy"
            title="Clique para copiar o ID"
          >
            <span className="truncate">act_{account.accountId}</span>
            {copied ? (
              <Check className="h-3 w-3 text-emerald-400 shrink-0" />
            ) : (
              <Copy className="h-3 w-3 opacity-0 group-hover/copy:opacity-100 transition-opacity shrink-0" />
            )}
          </button>
        </div>

        <div className="flex items-end gap-3 shrink-0">
          <div className="text-right">
            <div className="text-[9px] font-mono uppercase text-muted-foreground">Invest.</div>
            <div className="text-xs font-bold font-mono tabular-nums text-foreground">
              {fmtCur(account.spend)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9px] font-mono uppercase text-muted-foreground">Receita</div>
            <div className="text-xs font-bold font-mono tabular-nums text-emerald-400">
              {account.revenue > 0 ? fmtCur(account.revenue) : "—"}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9px] font-mono uppercase text-muted-foreground">ROAS</div>
            <div className={`text-xs font-bold font-mono tabular-nums ${account.roas >= 1.2 ? "text-emerald-400" : account.roas >= 1 ? "text-foreground" : account.roas > 0 ? "text-amber-400" : "text-muted-foreground"}`}>
              {account.roas > 0 ? `${account.roas.toFixed(2)}x` : "—"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <div
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: cfg.color, boxShadow: cfg.glow }}
          />
          <span
            className="text-[9px] font-mono tracking-wider uppercase"
            style={{ color: cfg.color }}
          >
            {cfg.label}
          </span>
        </div>
      </div>
    </div>
  );
}
