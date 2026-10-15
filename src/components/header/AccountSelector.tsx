import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTrafficData } from "@/hooks/useTrafficData";
import { useRealSales } from "@/hooks/useRealSales";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, Zap, Radio } from "lucide-react";

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);
}

type AccountFilter = "all" | "active" | "inactive" | "own" | "rented";

export function AccountSelector() {
  const [selectedId, setSelectedId] = useState("all");
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<AccountFilter>("all");

  const { data: accounts } = useQuery({
    queryKey: ["meta-ad-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meta_ad_accounts")
        .select("*")
        .eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: trafficData } = useTrafficData();
  const { data: salesData } = useRealSales();

  const stats = useMemo(() => {
    const traffic = trafficData || [];
    const sales = (salesData || []).filter((s: any) => s.status === "approved");
    const totalRevenue = sales.reduce((s: number, sale: any) => s + Number(sale.revenue), 0);

    const perAccount = new Map<string, { spend: number; revenue: number }>();
    for (const t of traffic) {
      const id = t.account_id;
      if (!perAccount.has(id)) perAccount.set(id, { spend: 0, revenue: 0 });
      perAccount.get(id)!.spend += Number(t.spend);
    }

    const totalSpend = traffic.reduce((s: number, t: any) => s + Number(t.spend), 0);
    const avgRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
    const activeCount = (accounts || []).filter((a) => a.is_active && a.account_status === 1).length;

    return { perAccount, totalSpend, totalRevenue, avgRoas, activeCount };
  }, [trafficData, salesData, accounts]);

  const filteredAccounts = useMemo(() => {
    const accs = accounts || [];
    return accs
      .filter((a) => {
        if (filter === "active") return a.is_active && a.account_status === 1;
        if (filter === "inactive") return !a.is_active || a.account_status !== 1;
        if (filter === "own") return (a as any).category === "own";
        if (filter === "rented") return (a as any).category === "rented";
        return true;
      })
      .sort((a, b) => {
        const spendA = stats.perAccount.get(a.account_id)?.spend || 0;
        const spendB = stats.perAccount.get(b.account_id)?.spend || 0;
        return spendB - spendA;
      });
  }, [accounts, filter, stats]);

  const selectedName = useMemo(() => {
    if (selectedId === "all") return "Contas Conectadas";
    const acc = (accounts || []).find((a) => a.account_id === selectedId);
    return acc?.account_name || selectedId;
  }, [selectedId, accounts]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setOpen(false);
  };

  const filters: { key: AccountFilter; label: string }[] = [
    { key: "all", label: "Todas" },
    { key: "own", label: "Próprias" },
    { key: "rented", label: "Alugadas" },
    { key: "active", label: "Ativas" },
    { key: "inactive", label: "Inativas" },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="h-8 px-3 rounded-md text-xs flex items-center gap-2 transition-colors border border-primary/10 bg-primary/5 hover:bg-primary/10"
        >
          <Radio className="h-3 w-3 text-primary" />
          <span className="font-mono tracking-wide text-foreground truncate max-w-[200px]">
            {selectedName}
          </span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-[400px] p-0 rounded-lg overflow-hidden border border-border bg-popover shadow-xl"
      >
        {/* Header */}
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-primary" />
            <span className="text-[10px] font-black tracking-[0.2em] uppercase text-primary">
              Traffic OS — Contas Conectadas
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <SummaryItem label="Investimento" value={fmt(stats.totalSpend)} />
            <SummaryItem label="ROAS Médio" value={`${stats.avgRoas.toFixed(2)}x`} />
            <SummaryItem label="Contas Ativas" value={String(stats.activeCount)} />
          </div>
        </div>

        <div className="h-px mx-4 bg-border" />

        {/* Filter toggles */}
        <div className="flex gap-1 px-4 py-2.5">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1 rounded text-[10px] font-mono tracking-wider uppercase transition-all border ${
                filter === f.key
                  ? "bg-primary/10 text-primary border-primary/20"
                  : "bg-transparent text-muted-foreground border-transparent hover:bg-muted/50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="h-px mx-4 bg-border" />

        {/* Account list */}
        <div className="max-h-[320px] overflow-y-auto p-2 space-y-1 scrollbar-thin">
          <AccountCard
            name="Todas as Contas"
            subtitle="Infraestrutura completa"
            spend={stats.totalSpend}
            roas={stats.avgRoas}
            currency="BRL"
            status="active"
            isSelected={selectedId === "all"}
            onClick={() => handleSelect("all")}
          />

          {filteredAccounts.map((acc) => {
            const accSpend = stats.perAccount.get(acc.account_id)?.spend || 0;
            const accRoas = accSpend > 0 ? stats.totalRevenue / stats.totalSpend : 0;
            const status: "active" | "paused" | "blocked" =
              acc.account_status === 1 && acc.is_active
                ? "active"
                : acc.account_status === 2
                ? "blocked"
                : "paused";

            return (
              <AccountCard
                key={acc.account_id}
                name={acc.account_name || acc.account_id}
                subtitle={`act_${acc.account_id}`}
                spend={accSpend}
                roas={accRoas}
                currency={acc.currency || "USD"}
                timezone={acc.timezone || "America/Sao_Paulo"}
                status={status}
                isSelected={selectedId === acc.account_id}
                onClick={() => handleSelect(acc.account_id)}
              />
            );
          })}

          {filteredAccounts.length === 0 && (
            <div className="text-center py-6 text-muted-foreground text-xs font-mono">
              Nenhuma conta neste filtro
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md px-2.5 py-2 text-center bg-muted/50 border border-border">
      <div className="text-[9px] font-mono tracking-wider uppercase text-muted-foreground mb-0.5">
        {label}
      </div>
      <div className="text-xs font-bold text-foreground font-mono tabular-nums">{value}</div>
    </div>
  );
}

function CurrencyBadge({ currency }: { currency: string }) {
  const isUsd = currency.toUpperCase() === "USD";
  return (
    <span
      className={`text-[9px] font-mono tracking-wider px-1.5 py-0.5 rounded border ${
        isUsd
          ? "bg-primary/10 border-primary/20 text-primary"
          : "bg-muted/50 border-border text-muted-foreground"
      }`}
    >
      {currency.toUpperCase()}
    </span>
  );
}

function TimezoneBadge({ timezone }: { timezone: string }) {
  // Convert IANA timezone to UTC offset label
  const tzLabels: Record<string, { label: string; offset: string }> = {
    "America/Sao_Paulo": { label: "BR", offset: "UTC-3" },
    "America/New_York": { label: "US", offset: "UTC-5" },
    "America/Los_Angeles": { label: "US", offset: "UTC-8" },
    "Europe/London": { label: "EU", offset: "UTC+0" },
    "Europe/Paris": { label: "EU", offset: "UTC+1" },
    "Europe/Berlin": { label: "EU", offset: "UTC+1" },
    "Europe/Belgrade": { label: "EU", offset: "UTC+1" },
    "Europe/Amsterdam": { label: "EU", offset: "UTC+1" },
    "Europe/Madrid": { label: "EU", offset: "UTC+1" },
    "Europe/Rome": { label: "EU", offset: "UTC+1" },
    "Europe/Brussels": { label: "EU", offset: "UTC+1" },
    "Europe/Vienna": { label: "EU", offset: "UTC+1" },
    "Europe/Warsaw": { label: "EU", offset: "UTC+1" },
    "Europe/Bucharest": { label: "EU", offset: "UTC+2" },
    "Europe/Athens": { label: "EU", offset: "UTC+2" },
    "Europe/Helsinki": { label: "EU", offset: "UTC+2" },
    "Europe/Lisbon": { label: "EU", offset: "UTC+0" },
    "Asia/Tokyo": { label: "JP", offset: "UTC+9" },
  };

  const tz = tzLabels[timezone] || { label: "??", offset: timezone.includes("/") ? timezone.split("/")[1].substring(0, 6) : timezone };
  const isBrazil = timezone === "America/Sao_Paulo";

  return (
    <span
      className={`text-[9px] font-mono tracking-wider px-1.5 py-0.5 rounded border ${
        isBrazil
          ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
          : "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400"
      }`}
    >
      {tz.offset}
    </span>
  );
}

function StatusIndicator({ status }: { status: "active" | "paused" | "blocked" }) {
  const config = {
    active: { className: "text-emerald-600 dark:text-emerald-400", label: "ATIVA" },
    paused: { className: "text-muted-foreground", label: "PAUSADA" },
    blocked: { className: "text-destructive", label: "BLOQUEADA" },
  }[status];

  return (
    <div className="flex items-center gap-1.5">
      <div className={`h-1.5 w-1.5 rounded-full ${
        status === "active" ? "bg-emerald-500" : status === "blocked" ? "bg-destructive" : "bg-muted-foreground"
      }`} />
      <span className={`text-[9px] font-mono tracking-wider uppercase ${config.className}`}>
        {config.label}
      </span>
    </div>
  );
}

function AccountCard({
  name,
  subtitle,
  spend,
  roas,
  currency,
  timezone,
  status,
  isSelected,
  onClick,
}: {
  name: string;
  subtitle: string;
  spend: number;
  roas: number;
  currency: string;
  timezone?: string;
  status: "active" | "paused" | "blocked";
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-md px-3 py-2.5 transition-all relative overflow-hidden group border ${
        isSelected
          ? "bg-primary/5 border-primary/20"
          : "bg-transparent border-border/50 hover:bg-muted/50"
      }`}
    >
      {isSelected && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-3/5 rounded-full bg-primary" />
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-foreground truncate">{name}</span>
            <CurrencyBadge currency={currency} />
            {timezone && <TimezoneBadge timezone={timezone} />}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground truncate">{subtitle}</div>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[9px] font-mono uppercase text-muted-foreground">Invest.</div>
              <div className="text-xs font-bold font-mono tabular-nums text-foreground">
                {fmt(spend)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[9px] font-mono uppercase text-muted-foreground">ROAS</div>
              <div className="text-xs font-bold font-mono tabular-nums text-foreground">
                {roas.toFixed(1)}x
              </div>
            </div>
          </div>
          <StatusIndicator status={status} />
        </div>
      </div>
    </button>
  );
}
