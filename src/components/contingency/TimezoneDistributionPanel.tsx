import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRealSales } from "@/hooks/useRealSales";
import { useRedTrackSales } from "@/hooks/useRedTrackSales";
import { mergeAllSales } from "@/lib/salesMerge";
import { Globe, Zap, Download, AlertTriangle, X, ChevronDown, ChevronUp } from "lucide-react";
import { useOperationId } from "@/contexts/OperationContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import TimezoneHeatmap from "./TimezoneHeatmap";

function fmtCur(v: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(v);
}

function tzLabel(tz: string): string {
  const map: Record<string, string> = {
    "America/Sao_Paulo": "🇧🇷 São Paulo (BRT)",
    "America/Los_Angeles": "🇺🇸 Los Angeles (PST)",
    "America/Chicago": "🇺🇸 Chicago (CST)",
    "America/New_York": "🇺🇸 New York (EST)",
    "America/Denver": "🇺🇸 Denver (MST)",
    "Europe/Kiev": "🇺🇦 Kiev (EET)",
    "Europe/London": "🇬🇧 Londres (GMT)",
    "Europe/Berlin": "🇩🇪 Berlim (CET)",
    "Europe/Paris": "🇫🇷 Paris (CET)",
    "Europe/Madrid": "🇪🇸 Madrid (CET)",
    "Europe/Rome": "🇮🇹 Roma (CET)",
    "Europe/Amsterdam": "🇳🇱 Amsterdam (CET)",
    "Europe/Belgrade": "🇷🇸 Belgrade (CET)",
    "Asia/Kolkata": "🇮🇳 Índia (IST)",
    "Asia/Tokyo": "🇯🇵 Tóquio (JST)",
    "Pacific/Auckland": "🇳🇿 Auckland (NZST)",
  };
  return map[tz] || tz.replace(/_/g, " ");
}

function tzShort(tz: string): string {
  return tzLabel(tz).split("(")[0].trim();
}

function getUtcOffset(tz: string): number {
  try {
    const now = new Date();
    const utcStr = now.toLocaleString("en-US", { timeZone: "UTC" });
    const tzStr = now.toLocaleString("en-US", { timeZone: tz });
    return (new Date(tzStr).getTime() - new Date(utcStr).getTime()) / 3600000;
  } catch { return 0; }
}

function tzRegion(tz: string): "brasil" | "americas" | "europa" | "asia-pacific" | "outros" {
  if (tz.startsWith("America/Sao_Paulo") || tz.startsWith("America/Bahia") || tz.startsWith("America/Fortaleza")) return "brasil";
  if (tz.startsWith("America/")) return "americas";
  if (tz.startsWith("Europe/")) return "europa";
  if (tz.startsWith("Asia/") || tz.startsWith("Pacific/")) return "asia-pacific";
  return "outros";
}

type RoasTone = "neutral" | "warn" | "danger";
function roasTone(roas: number, hasSpend: boolean): RoasTone {
  if (!hasSpend) return "neutral";
  if (roas < 0.5) return "danger";
  if (roas < 1.0) return "warn";
  return "neutral";
}


type FilterKey = "all" | "brasil" | "international" | "profitable" | "unprofitable";

interface TzGroup {
  timezone: string;
  label: string;
  utcOffset: number;
  region: ReturnType<typeof tzRegion>;
  accountCount: number;
  totalSpend: number;
  totalRevenue: number;
  roas: number;
  profit: number;
  shareOfSpend: number;
  hourlySpend: Map<number, number>;
  hourlySales: Map<number, number>;
  hasOrphanAccounts: boolean;
  accountIds: Set<string>;
}

export interface TimezoneDistributionPanelProps {
  selectedTimezone?: string | null;
  onSelectTimezone?: (tz: string | null, accountIds: Set<string>, label: string) => void;
}

export default function TimezoneDistributionPanel({
  selectedTimezone = null,
  onSelectTimezone,
}: TimezoneDistributionPanelProps = {}) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [expandedTz, setExpandedTz] = useState<string | null>(null);
  const operationId = useOperationId();
  const { dateRange } = useDateRange();
  const [start, end] = dateRange;

  const { data: accounts } = useQuery({
    queryKey: ["meta-ad-accounts-tz", operationId],
    queryFn: async () => {
      let q = supabase.from("meta_ad_accounts").select("account_id, account_name, timezone, account_status, currency, is_active").eq("is_active", true);
      if (operationId) q = q.eq("operation_id", operationId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: spendByAccData } = useQuery({
    queryKey: ["tz-spend-by-account", start, end, operationId],
    queryFn: async () => {
      const params: any = { p_start_date: start, p_end_date: end };
      if (operationId) params.p_operation_id = operationId;
      const { data, error } = await supabase.rpc("get_traffic_spend_by_account", params);
      if (error) throw error;
      return (data || []) as { account_id: string; date: string; total_spend: number }[];
    },
  });

  const { data: campAccData } = useQuery({
    queryKey: ["tz-camp-acc-map", start, end, operationId],
    queryFn: async () => {
      const params: any = { p_start_date: start, p_end_date: end };
      if (operationId) params.p_operation_id = operationId;
      const { data, error } = await supabase.rpc("get_leaderboard_traffic", params);
      if (error) throw error;
      return (data || []) as { campaign_name: string; account_id: string; total_spend: number; total_impressions: number }[];
    },
  });

  const { data: salesRaw } = useRealSales();
  const { data: rtSalesRaw } = useRedTrackSales();

  const { data: hourlySpendData } = useQuery({
    queryKey: ["hourly-spend-tz-v3", start, end, operationId],
    queryFn: async () => {
      let q = supabase.from("traffic_data_hourly").select("account_id, hour, spend:spend_brl").gte("date", start).lte("date", end);
      if (operationId) q = q.eq("operation_id", operationId);
      const { data, error } = await q.limit(50000);
      if (error) return [];
      return data || [];
    },
  });

  const { data: hourlySalesData } = useQuery({
    queryKey: ["hourly-sales-tz-rpc", start, end, operationId],
    queryFn: async () => {
      const params: any = { p_start_date: start, p_end_date: end };
      if (operationId) params.p_operation_id = operationId;
      const { data, error } = await supabase.rpc("get_hourly_sales_by_account" as any, params);
      if (error) return [];
      return (data || []) as { account_id: string; hour: number; total_revenue: number }[];
    },
  });

  const { data: utmAliases } = useQuery({
    queryKey: ["account-utm-aliases-tz"],
    queryFn: async () => {
      const { data, error } = await supabase.from("account_utm_aliases").select("account_id, utm_aliases");
      if (error) throw error;
      return data || [];
    },
  });

  const tzGroups = useMemo((): TzGroup[] => {
    if (!accounts || !spendByAccData) return [];
    const sales = mergeAllSales(salesRaw || [], rtSalesRaw || []);

    const spendByAcc = new Map<string, number>();
    for (const row of spendByAccData) {
      spendByAcc.set(row.account_id, (spendByAcc.get(row.account_id) || 0) + Number(row.total_spend));
    }

    const aliasToAcc = new Map<string, string>();
    for (const a of utmAliases || []) {
      for (const u of a.utm_aliases || []) {
        aliasToAcc.set(u.replace(/^\[|\]$/g, "").toLowerCase().trim(), a.account_id);
      }
    }

    const campSpendByAcc = new Map<string, Map<string, number>>();
    for (const row of campAccData || []) {
      const cn = (row.campaign_name || "").toLowerCase().trim();
      if (!cn) continue;
      if (!campSpendByAcc.has(cn)) campSpendByAcc.set(cn, new Map());
      campSpendByAcc.get(cn)!.set(row.account_id, (campSpendByAcc.get(cn)!.get(row.account_id) || 0) + Number(row.total_spend));
    }
    const campToAcc = new Map<string, string>();
    for (const [cn, accMap] of campSpendByAcc) {
      let best = "", bestSp = -1;
      for (const [id, sp] of accMap) if (sp > bestSp) { bestSp = sp; best = id; }
      if (best) campToAcc.set(cn, best);
    }

    const revByAcc = new Map<string, number>();
    for (const sale of sales) {
      const utm = String(sale.utm_campaign || "");
      let accId = campToAcc.get(utm.toLowerCase().trim());
      if (!accId) {
        const tag = utm.match(/\[([^\]]+)\]/);
        if (tag) accId = aliasToAcc.get(tag[1].toLowerCase().trim());
      }
      if (accId) revByAcc.set(accId, (revByAcc.get(accId) || 0) + Number(sale.revenue));
    }

    const accToTz = new Map<string, string>();
    for (const acc of accounts) accToTz.set(acc.account_id, acc.timezone || "America/Sao_Paulo");

    const hourlySpendByTz = new Map<string, Map<number, number>>();
    for (const h of hourlySpendData || []) {
      const tz = accToTz.get(h.account_id) || "America/Sao_Paulo";
      if (!hourlySpendByTz.has(tz)) hourlySpendByTz.set(tz, new Map());
      const hm = hourlySpendByTz.get(tz)!;
      hm.set(Number(h.hour), (hm.get(Number(h.hour)) || 0) + Number(h.spend));
    }

    const hourlySalesByTz = new Map<string, Map<number, number>>();
    for (const row of hourlySalesData || []) {
      const tz = accToTz.get(row.account_id) || "America/Sao_Paulo";
      if (!hourlySalesByTz.has(tz)) hourlySalesByTz.set(tz, new Map());
      const hm = hourlySalesByTz.get(tz)!;
      hm.set(Number(row.hour), (hm.get(Number(row.hour)) || 0) + Number(row.total_revenue));
    }

    const grouped = new Map<string, typeof accounts>();
    for (const acc of accounts) {
      const tz = acc.timezone || "America/Sao_Paulo";
      if (!grouped.has(tz)) grouped.set(tz, []);
      grouped.get(tz)!.push(acc);
    }

    const totalSpendAll = Array.from(spendByAcc.values()).reduce((s, v) => s + v, 0);

    return Array.from(grouped.entries()).map(([tz, accs]) => {
      const ids = new Set(accs.map((a) => a.account_id));
      const totalSpend = Array.from(ids).reduce((s, id) => s + (spendByAcc.get(id) || 0), 0);
      const totalRevenue = Array.from(ids).reduce((s, id) => s + (revByAcc.get(id) || 0), 0);
      const profit = totalRevenue - totalSpend;
      const hasOrphan = Array.from(ids).some((id) => (spendByAcc.get(id) || 0) > 100 && (revByAcc.get(id) || 0) === 0);

      return {
        timezone: tz,
        label: tzLabel(tz),
        utcOffset: getUtcOffset(tz),
        region: tzRegion(tz),
        accountCount: accs.length,
        totalSpend,
        totalRevenue,
        roas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
        profit,
        shareOfSpend: totalSpendAll > 0 ? (totalSpend / totalSpendAll) * 100 : 0,
        hourlySpend: hourlySpendByTz.get(tz) || new Map<number, number>(),
        hourlySales: hourlySalesByTz.get(tz) || new Map<number, number>(),
        hasOrphanAccounts: hasOrphan,
        accountIds: ids,
      };
    });
  }, [accounts, spendByAccData, campAccData, salesRaw, rtSalesRaw, utmAliases, hourlySpendData, hourlySalesData]);

  const filteredGroups = useMemo(() => {
    let groups = [...tzGroups];
    switch (filter) {
      case "brasil": groups = groups.filter((g) => g.region === "brasil"); break;
      case "international": groups = groups.filter((g) => g.region !== "brasil"); break;
      case "profitable": groups = groups.filter((g) => g.profit > 0 && g.totalSpend > 0); break;
      case "unprofitable": groups = groups.filter((g) => g.profit <= 0 && g.totalSpend > 0); break;
    }
    groups.sort((a, b) => b.accountCount - a.accountCount);
    return groups;
  }, [tzGroups, filter]);

  const totalAccounts = tzGroups.reduce((s, g) => s + g.accountCount, 0);
  const avgRoas = useMemo(() => {
    const withSpend = tzGroups.filter((g) => g.totalSpend > 0);
    const ts = withSpend.reduce((s, g) => s + g.totalSpend, 0);
    const tr = withSpend.reduce((s, g) => s + g.totalRevenue, 0);
    return ts > 0 ? tr / ts : 0;
  }, [tzGroups]);
  const bestTz = useMemo(() => {
    const ws = tzGroups.filter((g) => g.totalSpend > 0);
    return ws.length ? ws.reduce((b, g) => (g.roas > b.roas ? g : b), ws[0]) : null;
  }, [tzGroups]);

  const handlePillClick = (g: TzGroup) => {
    if (!onSelectTimezone) {
      setExpandedTz(expandedTz === g.timezone ? null : g.timezone);
      return;
    }
    if (selectedTimezone === g.timezone) {
      onSelectTimezone(null, new Set(), "");
      setExpandedTz(null);
    } else {
      onSelectTimezone(g.timezone, g.accountIds, g.label);
      setExpandedTz(g.timezone);
    }
  };

  const exportCsv = useCallback(() => {
    const header = "Fuso Horário,UTC Offset,Contas,Investimento,Receita,Lucro,ROAS,Share Spend %\n";
    const rows = filteredGroups.map((g) =>
      `"${g.label}",UTC${g.utcOffset >= 0 ? "+" : ""}${g.utcOffset},${g.accountCount},${g.totalSpend.toFixed(2)},${g.totalRevenue.toFixed(2)},${g.profit.toFixed(2)},${g.roas.toFixed(2)},${g.shareOfSpend.toFixed(1)}`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `timezone-performance-${start}-${end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredGroups, start, end]);

  const filterOptions: { key: FilterKey; label: string }[] = [
    { key: "all", label: "Todos" },
    { key: "brasil", label: "🇧🇷 BR" },
    { key: "international", label: "🌍 Intl" },
    { key: "profitable", label: "✅ ROAS+" },
    { key: "unprofitable", label: "❌ ROAS-" },
  ];

  const expandedGroup = expandedTz ? tzGroups.find((g) => g.timezone === expandedTz) : null;

  return (
    <div className="rounded-xl border overflow-hidden shadow-sm" style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}>
      {/* Header */}
      <div className="px-4 py-2.5 flex items-center gap-2 border-b" style={{ borderColor: "hsl(var(--border))" }}>
        <Globe className="h-3.5 w-3.5 text-primary" />
        <span className="text-[10px] font-black tracking-[0.2em] uppercase text-primary" style={{ textShadow: "0 0 12px rgba(255,30,30,0.4)" }}>
          Distribuição por Fuso Horário
        </span>
        <div className="flex-1" />
        <span className="text-[10px] font-mono text-muted-foreground">
          {tzGroups.length} fusos · {totalAccounts} contas · ROAS médio {avgRoas.toFixed(2)}x
        </span>
        {bestTz && (
          <span className="text-[10px] font-mono flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Zap className="h-3 w-3" /> {tzShort(bestTz.label)} {bestTz.roas.toFixed(2)}x
          </span>
        )}
        <button onClick={exportCsv} className="text-[10px] font-mono flex items-center gap-1 px-2 py-0.5 rounded hover:bg-secondary/40 text-muted-foreground" title="Exportar CSV">
          <Download className="h-3 w-3" /> CSV
        </button>
        {selectedTimezone && (
          <button
            onClick={() => { onSelectTimezone?.(null, new Set(), ""); setExpandedTz(null); }}
            className="text-[10px] font-mono flex items-center gap-1 px-2 py-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
            title="Limpar seleção"
          >
            <X className="h-3 w-3" /> limpar
          </button>
        )}
      </div>

      {/* Filter pills */}
      <div className="px-4 py-2 border-b flex flex-wrap items-center gap-1.5" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--secondary) / 0.04)" }}>
        {filterOptions.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setFilter(opt.key)}
            className="text-[10px] font-mono px-2 py-0.5 rounded transition-all"
            style={{
              background: filter === opt.key ? "hsl(var(--primary) / 0.12)" : "transparent",
              color: filter === opt.key ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
              border: filter === opt.key ? "1px solid hsl(var(--primary) / 0.3)" : "1px solid transparent",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Compact segmented bar (neutral, primary only when active) */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-[2px] h-2 rounded-full overflow-hidden mb-3 bg-secondary/30">
          {filteredGroups.map((g) => {
            const pct = totalAccounts > 0 ? (g.accountCount / totalAccounts) * 100 : 0;
            const active = selectedTimezone === g.timezone;
            const dim = selectedTimezone && !active;
            const tone = roasTone(g.roas, g.totalSpend > 0);
            const cls = active
              ? "bg-primary"
              : tone === "danger"
              ? "bg-destructive/70"
              : tone === "warn"
              ? "bg-amber-500/60"
              : "bg-muted-foreground/40 hover:bg-muted-foreground/60";
            return (
              <button
                key={g.timezone}
                onClick={() => handlePillClick(g)}
                className={`h-full transition-all first:rounded-l-full last:rounded-r-full ${cls}`}
                style={{ width: `${Math.max(pct, 2)}%`, opacity: dim ? 0.3 : 1 }}
                title={`${g.label}: ${g.accountCount} contas · ROAS ${g.roas.toFixed(2)}x`}
              />
            );
          })}
        </div>

        {/* Pills */}
        <div className="flex flex-wrap gap-1.5">
          {filteredGroups.map((g) => {
            const active = selectedTimezone === g.timezone;
            const dim = selectedTimezone && !active;
            const tone = roasTone(g.roas, g.totalSpend > 0);
            const pillCls = active
              ? "bg-primary/10 border-primary/40 text-primary"
              : "bg-secondary/30 border-border hover:bg-secondary/50 text-foreground";
            const roasCls =
              tone === "danger" ? "text-destructive" : tone === "warn" ? "text-amber-500" : "text-muted-foreground";
            return (
              <button
                key={g.timezone}
                onClick={() => handlePillClick(g)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all text-[11px] font-mono border ${pillCls}`}
                style={{ opacity: dim ? 0.5 : 1 }}
                title={`Filtrar pipeline por ${g.label}`}
              >
                <span className="font-bold">{tzShort(g.label)}</span>
                <span className="text-muted-foreground">{g.accountCount}c</span>
                {g.totalSpend > 0 && (
                  <>
                    <span className="text-muted-foreground/60">·</span>
                    <span className={roasCls}>{g.roas.toFixed(2)}x</span>
                  </>
                )}
                {g.hasOrphanAccounts && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                {expandedTz === g.timezone ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground/50" />}
              </button>
            );
          })}
          {filteredGroups.length === 0 && (
            <span className="text-[11px] font-mono text-muted-foreground">Nenhum fuso encontrado</span>
          )}
        </div>
      </div>


      {/* Expanded: heatmap + KPIs */}
      {expandedGroup && (
        <div className="border-t px-4 py-4" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--secondary) / 0.04)" }}>
          <div className="flex flex-wrap items-center gap-4 mb-3">
            <div>
              <div className="text-xs font-bold text-foreground">{expandedGroup.label}</div>
              <div className="text-[10px] font-mono text-muted-foreground">
                UTC{expandedGroup.utcOffset >= 0 ? "+" : ""}{expandedGroup.utcOffset} · {expandedGroup.accountCount} contas
              </div>
            </div>
            <div className="flex-1" />
            {[
              { label: "Invest.", value: fmtCur(expandedGroup.totalSpend) },
              { label: "Receita", value: expandedGroup.totalRevenue > 0 ? fmtCur(expandedGroup.totalRevenue) : "—" },
              { label: "Lucro", value: expandedGroup.totalSpend > 0 ? fmtCur(expandedGroup.profit) : "—" },
              { label: "ROAS", value: expandedGroup.roas > 0 ? `${expandedGroup.roas.toFixed(2)}x` : "—" },
              { label: "Share", value: `${expandedGroup.shareOfSpend.toFixed(1)}%` },
            ].map((m) => (
              <div key={m.label} className="text-right">
                <div className="text-[10px] font-mono uppercase text-muted-foreground/70">{m.label}</div>
                <div className="text-xs font-bold font-mono tabular-nums text-foreground">{m.value}</div>
              </div>
            ))}
          </div>
          <TimezoneHeatmap
            hourlySpend={expandedGroup.hourlySpend}
            hourlySales={expandedGroup.hourlySales}
            color="hsl(var(--primary))"
          />

        </div>
      )}
    </div>
  );
}
