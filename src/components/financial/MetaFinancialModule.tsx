import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CreditCard, AlertTriangle, Bell, Settings2, Check, ArrowUpDown, ArrowUp, ArrowDown, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useExchangeRate } from "@/hooks/useExchangeRate";
import { useOperationId } from "@/contexts/OperationContext";

function fmtCurrency(v: number, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min atrás`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h atrás`;
  return `${Math.floor(hrs / 24)}d atrás`;
}

type SortDir = "asc" | "desc" | null;

type StatusFilter = "all" | "active" | "disabled";
type SpendFilter = "all" | "today" | "accumulated";
type CardFilter = "all" | "visa" | "mastercard";

export function MetaFinancialModule() {
  const queryClient = useQueryClient();
  const exchangeRate = useExchangeRate();
  const operationId = useOperationId();
  const [editingThreshold, setEditingThreshold] = useState(false);
  const [thresholdInput, setThresholdInput] = useState("");
  const [sortBalance, setSortBalance] = useState<SortDir>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [spendFilter, setSpendFilter] = useState<SpendFilter>("all");
  const [cardFilter, setCardFilter] = useState<CardFilter>("all");

  const today = format(new Date(), "yyyy-MM-dd");

  // Fetch account active status from meta_ad_accounts
  const { data: adAccounts = [] } = useQuery({
    queryKey: ["meta-ad-accounts-status", operationId],
    queryFn: async () => {
      let query = supabase
        .from("meta_ad_accounts")
        .select("account_id, is_active, account_status, disable_reason");
      if (operationId) query = query.eq("operation_id", operationId);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as { account_id: string; is_active: boolean; account_status: number; disable_reason: string | null }[];
    },
    staleTime: 5 * 60_000,
  });

  // Fetch today's spend per account
  const { data: todaySpend = [] } = useQuery({
    queryKey: ["traffic-spend-today", today, operationId],
    queryFn: async () => {
      let query = supabase
        .from("traffic_data")
        .select("account_id, spend:spend_brl")
        .eq("date", today);
      if (operationId) query = query.eq("operation_id", operationId);
      const { data, error } = await query;
      if (error) throw error;
      // Aggregate spend per account
      const map = new Map<string, number>();
      (data || []).forEach((r: any) => {
        map.set(r.account_id, (map.get(r.account_id) || 0) + Number(r.spend || 0));
      });
      return map;
    },
    staleTime: 2 * 60_000,
  });

  const accountInfoMap = useMemo(() => {
    const map = new Map<string, { isActive: boolean; accountStatus: number; disableReason: string | null }>();
    adAccounts.forEach((a) => map.set(a.account_id, {
      isActive: a.is_active,
      accountStatus: a.account_status,
      disableReason: a.disable_reason,
    }));
    return map;
  }, [adAccounts]);

  const { data: financials = [], isLoading } = useQuery({
    queryKey: ["meta-account-financials", operationId],
    queryFn: async () => {
      let query = supabase
        .from("meta_account_financials" as any)
        .select("*")
        .order("account_name");
      if (operationId) query = query.eq("operation_id", operationId);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as any[];
    },
    refetchInterval: 5 * 60_000,
    staleTime: 2 * 60_000,
  });

  const { data: thresholdSetting } = useQuery({
    queryKey: ["app-settings", "meta_balance_alert_threshold"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "meta_balance_alert_threshold")
        .maybeSingle();
      if (error) throw error;
      return data?.value as number | null;
    },
  });

  const alertThreshold = typeof thresholdSetting === "number" ? thresholdSetting : null;

  const saveThreshold = useMutation({
    mutationFn: async (value: number) => {
      const { error } = await supabase
        .from("app_settings")
        .upsert({ key: "meta_balance_alert_threshold", value: value as any, operation_id: operationId! }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["app-settings", "meta_balance_alert_threshold"] });
      setEditingThreshold(false);
      toast.success("Limiar de alerta salvo");
    },
  });

  const rows = useMemo(() => {
    return financials.map((f: any) => {
      const currency = f.currency || "USD";
      const fx = currency !== "BRL" ? exchangeRate : 1;
      const spent = Number(f.amount_spent || 0);
      const balance = Math.abs(Number(f.account_balance || 0));
      const paid = Math.max(0, spent - balance);
      const info = accountInfoMap.get(f.account_id);
      const isActive = info?.isActive ?? true;
      const accountStatus = info?.accountStatus ?? 1;
      const disableReason = info?.disableReason ?? null;
      // account_status: 1=ACTIVE, 2=DISABLED, 3=UNSETTLED, 7=PENDING_RISK_REVIEW, 9=PENDING_SETTLEMENT, 100=PENDING_CLOSURE, 101=CLOSED, 201=ANY_ACTIVE, 202=ANY_CLOSED
      const isBlocked = accountStatus === 2 || accountStatus === 3 || accountStatus === 101;
      const spentToday = todaySpend instanceof Map ? (todaySpend.get(f.account_id) || 0) : 0;
      return {
        account_id: f.account_id,
        account_name: f.account_name || f.account_id,
        spent,
        spentBrl: spent * fx,
        balance,
        balanceBrl: balance * fx,
        paid,
        paidBrl: paid * fx,
        currency,
        fx,
        updated_at: f.updated_at,
        isActive,
        isBlocked,
        disableReason,
        spentToday,
        card_brand: f.card_brand || "",
        card_last4: f.card_last4 || "",
        payment_method_type: f.payment_method_type || "",
      };
    });
  }, [financials, exchangeRate, accountInfoMap, todaySpend]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter === "active" && r.isBlocked) return false;
      if (statusFilter === "disabled" && !r.isBlocked) return false;
      if (spendFilter === "today" && r.spentToday <= 0) return false;
      if (spendFilter === "accumulated" && r.spentToday > 0) return false;
      if (cardFilter === "visa" && r.card_brand.toUpperCase() !== "VISA") return false;
      if (cardFilter === "mastercard" && r.card_brand.toUpperCase() !== "MASTERCARD") return false;
      return true;
    });
  }, [rows, statusFilter, spendFilter, cardFilter]);

  const sortedRows = useMemo(() => {
    if (!sortBalance) return filteredRows;
    return [...filteredRows].sort((a, b) =>
      sortBalance === "asc" ? a.balance - b.balance : b.balance - a.balance
    );
  }, [filteredRows, sortBalance]);

  const totalBalance = useMemo(
    () => filteredRows.reduce((sum, r) => sum + r.balanceBrl, 0),
    [filteredRows]
  );

  const totalSpent = useMemo(
    () => filteredRows.reduce((sum, r) => sum + r.spentBrl, 0),
    [filteredRows]
  );

  const totalPaid = useMemo(
    () => filteredRows.reduce((sum, r) => sum + r.paidBrl, 0),
    [filteredRows]
  );

  const isOverThreshold = alertThreshold !== null && totalBalance > alertThreshold;

  const handleSaveThreshold = () => {
    const val = parseFloat(thresholdInput.replace(/[^\d.,]/g, "").replace(",", "."));
    if (isNaN(val) || val <= 0) {
      toast.error("Valor inválido");
      return;
    }
    saveThreshold.mutate(val);
  };

  if (isLoading) {
    return (
      <Card className="bg-card border border-border">
        <CardContent className="p-6">
          <Skeleton className="h-6 w-64 mb-4" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card className="bg-card border border-border">
        <CardContent className="p-6 text-center text-muted-foreground text-sm">
          <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Nenhum dado financeiro Meta disponível.</p>
          <p className="text-xs mt-1">A sincronização será executada automaticamente a cada 10 minutos.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      <Card className="bg-card border border-border">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  💰 Total Meta em Aberto (BRL)
                </p>
                <p className="text-xl font-bold font-mono text-destructive">
                  {fmtCurrency(totalBalance)}
                </p>
                <p className="text-[9px] font-mono text-muted-foreground/70">
                  Câmbio USD/BRL: {exchangeRate.toFixed(2)}
                </p>
              </div>
            </div>
            <div className="text-right flex items-center gap-2">
              <p className="text-[10px] text-muted-foreground font-mono">
                {filteredRows.length}/{rows.length} conta{rows.length !== 1 ? "s" : ""}
              </p>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => {
                  setThresholdInput(alertThreshold ? String(alertThreshold) : "");
                  setEditingThreshold(!editingThreshold);
                }}
                title="Configurar alerta de saldo"
              >
                <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </div>
          </div>

          {/* Threshold config */}
          {editingThreshold && (
            <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">Alertar quando saldo &gt;</span>
              <Input
                type="text"
                placeholder="Ex: 50000"
                value={thresholdInput}
                onChange={(e) => setThresholdInput(e.target.value)}
                className="h-7 w-32 text-xs font-mono"
              />
              <Button size="sm" className="h-7 px-2" onClick={handleSaveThreshold} disabled={saveThreshold.isPending}>
                <Check className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Alert when over threshold */}
      {isOverThreshold && (
        <Card className="bg-destructive/10 border border-destructive/30">
          <CardContent className="p-4 flex items-center gap-3">
            <Bell className="h-5 w-5 text-destructive shrink-0" />
            <div>
              <p className="text-sm font-semibold text-destructive">
                ⚠️ Saldo em aberto acima do limiar configurado
              </p>
              <p className="text-xs text-muted-foreground font-mono">
                Atual: {fmtCurrency(totalBalance)} — Limiar: {fmtCurrency(alertThreshold!)}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card className="bg-card border border-border">
        <CardHeader className="pb-2 space-y-3">
          <CardTitle className="text-sm font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            💳 Meta Ads — Controle Financeiro
          </CardTitle>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <div className="flex items-center gap-1">
              {(["all", "active", "disabled"] as StatusFilter[]).map((v) => (
                <Badge
                  key={v}
                  variant={statusFilter === v ? "default" : "outline"}
                  className={`cursor-pointer text-[10px] font-mono transition-colors ${
                    statusFilter === v
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                  onClick={() => setStatusFilter(v)}
                >
                  {v === "all" ? "Todas" : v === "active" ? "🟢 Ativas" : "🔴 Bloqueadas"}
                </Badge>
              ))}
            </div>
            <span className="text-muted-foreground/40 text-xs">|</span>
            <div className="flex items-center gap-1">
              {(["all", "today", "accumulated"] as SpendFilter[]).map((v) => (
                <Badge
                  key={v}
                  variant={spendFilter === v ? "default" : "outline"}
                  className={`cursor-pointer text-[10px] font-mono transition-colors ${
                    spendFilter === v
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                  onClick={() => setSpendFilter(v)}
                >
                  {v === "all" ? "Todos" : v === "today" ? "💸 Gasto Hoje" : "📦 Só Acumulado"}
                </Badge>
              ))}
            </div>
            <span className="text-muted-foreground/40 text-xs">|</span>
            <div className="flex items-center gap-1">
              {(["all", "visa", "mastercard"] as CardFilter[]).map((v) => (
                <Badge
                  key={v}
                  variant={cardFilter === v ? "default" : "outline"}
                  className={`cursor-pointer text-[10px] font-mono transition-colors ${
                    cardFilter === v
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                  onClick={() => setCardFilter(v)}
                >
                  {v === "all" ? "Todas" : v === "visa" ? "💳 Visa" : "💳 Mastercard"}
                </Badge>
              ))}
            </div>
            {(statusFilter !== "all" || spendFilter !== "all" || cardFilter !== "all") && (
              <span className="text-[10px] font-mono text-muted-foreground ml-1">
                {filteredRows.length}/{rows.length} contas
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] font-mono uppercase">Conta</TableHead>
                <TableHead className="text-[10px] font-mono uppercase">Pagamento</TableHead>
                <TableHead className="text-[10px] font-mono uppercase text-right">Investido</TableHead>
                <TableHead className="text-[10px] font-mono uppercase text-right">Já Pago</TableHead>
                <TableHead className="text-[10px] font-mono uppercase text-right">
                  <button
                    className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                    onClick={() => setSortBalance(prev => prev === "desc" ? "asc" : prev === "asc" ? null : "desc")}
                  >
                    Saldo em Aberto
                    {sortBalance === "desc" ? <ArrowDown className="h-3 w-3" /> : sortBalance === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                  </button>
                </TableHead>
                <TableHead className="text-[10px] font-mono uppercase text-right">Atualização</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRows.map((r) => (
                <TableRow key={r.account_id} className={r.isBlocked ? "opacity-70" : ""}>
                  <TableCell className="text-xs font-medium">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-block h-2 w-2 rounded-full shrink-0 ${
                          r.isBlocked ? "bg-destructive" : "bg-emerald-500"
                        }`}
                        title={r.isBlocked ? `Bloqueada${r.disableReason ? `: ${r.disableReason}` : ""}` : "Ativa"}
                      />
                      <div>
                        <span className={r.isBlocked ? "text-destructive/80" : "text-foreground"}>{r.account_name}</span>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-muted-foreground font-mono">{r.account_id}</span>
                          {r.isBlocked && (
                            <span className="text-[9px] font-mono text-destructive/70">
                              {r.disableReason || "bloqueada"}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono">
                    {r.card_brand ? (
                      <div className="flex items-center gap-1.5">
                        <CreditCard className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <div>
                          <span className="text-foreground font-medium">{r.card_brand}</span>
                          {r.card_last4 && (
                            <span className="text-muted-foreground ml-1">*{r.card_last4}</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground/50 text-[10px]">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-right text-muted-foreground">
                    {fmtCurrency(r.spent, r.currency)}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-right text-wr-positive">
                    {fmtCurrency(r.paid, r.currency)}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-right">
                    <span className={r.balance > 0 ? "text-destructive font-semibold" : "text-muted-foreground"}>
                      {fmtCurrency(r.balance, r.currency)}
                    </span>
                  </TableCell>
                  <TableCell className="text-[10px] font-mono text-right text-muted-foreground">
                    {r.updated_at ? timeAgo(r.updated_at) : "—"}
                  </TableCell>
                </TableRow>
              ))}

              {/* Totals row */}
              <TableRow className="bg-muted/30 border-t-2 border-border">
                <TableCell className="text-xs font-bold">
                  TOTAL (BRL)
                </TableCell>
                <TableCell />
                <TableCell className="text-xs font-mono text-right font-bold text-muted-foreground">
                  {fmtCurrency(totalSpent)}
                </TableCell>
                <TableCell className="text-xs font-mono text-right font-bold text-wr-positive">
                  {fmtCurrency(totalPaid)}
                </TableCell>
                <TableCell className="text-xs font-mono text-right font-bold text-destructive">
                  {fmtCurrency(totalBalance)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
