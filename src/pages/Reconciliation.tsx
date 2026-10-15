import { useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllPaginated";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import {
  Upload, FileText, TrendingUp, TrendingDown, CreditCard,
  Loader2, ShieldAlert, CalendarIcon, Wallet, Activity, History,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { format, startOfWeek, startOfMonth, parseISO, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { UploadHistoryPanel } from "@/components/reconciliation/UploadHistoryPanel";

/* ─────────── helpers ─────────── */
const fmtBRL = (v: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v ?? 0));
const fmtBRLcompact = (v: number) =>
  new Intl.NumberFormat("pt-BR", { notation: "compact", style: "currency", currency: "BRL", maximumFractionDigits: 1 }).format(v);
const fmtDate = (s: string) => format(parseISO(s), "dd/MM", { locale: ptBR });
const todayISO = () => format(new Date(), "yyyy-MM-dd");

type Period = "today" | "week" | "month" | "custom";

function gapSeverity(gapPct: number): { color: string; bg: string; label: string; emoji: string } {
  const abs = Math.abs(gapPct);
  if (abs < 2) return { color: "text-emerald-500", bg: "bg-emerald-500/15 border-emerald-500/30", label: "Excelente", emoji: "🟢" };
  if (abs < 5) return { color: "text-emerald-500", bg: "bg-emerald-500/15 border-emerald-500/30", label: "Normal", emoji: "🟢" };
  if (abs < 10) return { color: "text-amber-500", bg: "bg-amber-500/15 border-amber-500/30", label: "Atenção", emoji: "🟡" };
  return { color: "text-red-500", bg: "bg-red-500/15 border-red-500/30", label: "Anomalia", emoji: "🔴" };
}

/* ─────────── page ─────────── */
export default function Reconciliation() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState<string>(todayISO());
  const [customTo, setCustomTo] = useState<string>(todayISO());
  const [provider, setProvider] = useState<"lot" | "payoneer">("lot");
  const [uploading, setUploading] = useState(false);

  /* ─── range ─── */
  const { from, to } = useMemo(() => {
    const today = new Date();
    if (period === "today") return { from: todayISO(), to: todayISO() };
    if (period === "week") {
      const wkStart = startOfWeek(today, { weekStartsOn: 1 });
      return { from: format(wkStart, "yyyy-MM-dd"), to: todayISO() };
    }
    if (period === "month") {
      return { from: format(startOfMonth(today), "yyyy-MM-dd"), to: todayISO() };
    }
    return { from: customFrom, to: customTo };
  }, [period, customFrom, customTo]);

  /* ─── card charges (BRL) ─── paginated to bypass PostgREST 1000-row cap */
  const { data: cardRows = [], isLoading: loadingCard } = useQuery({
    queryKey: ["recon-card", from, to],
    queryFn: async () => {
      return await fetchAllPaginated<{ charge_date: string; amount_brl: number; ad_account_id: string | null; card_provider: string }>(
        "daily_card_charges",
        "charge_date, amount_brl, ad_account_id, card_provider",
        (q: any) => q.gte("charge_date", from).lte("charge_date", to),
        "charge_date",
        false,
      );
    },
  });

  /* ─── meta spend (BRL normalized) ─── paginated to bypass PostgREST 1000-row cap */
  const { data: metaRows = [], isLoading: loadingMeta } = useQuery({
    queryKey: ["recon-meta", from, to],
    queryFn: async () => {
      return await fetchAllPaginated<{ sp_date: string; spend_brl: number; account_id: string }>(
        "meta_spend_realtime_safe",
        "sp_date, spend_brl, account_id",
        (q: any) => q.gte("sp_date", from).lte("sp_date", to),
        "sp_date",
        false,
      );
    },
  });


  /* ─── account name lookup ─── */
  const { data: accounts = [] } = useQuery({
    queryKey: ["recon-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meta_ad_accounts")
        .select("account_id, account_name")
        .limit(2000);
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60_000,
  });
  const accountNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of accounts) m.set(String(a.account_id), a.account_name || a.account_id);
    return m;
  }, [accounts]);

  /* ─── KPIs ─── */
  const totals = useMemo(() => {
    const cardTotal = cardRows.reduce((s, r) => s + Number(r.amount_brl ?? 0), 0);
    const metaTotal = metaRows.reduce((s, r) => s + Number(r.spend_brl ?? 0), 0);
    const gap = cardTotal - metaTotal;
    const gapPct = metaTotal > 0 ? (gap / metaTotal) * 100 : 0;
    return { cardTotal, metaTotal, gap, gapPct };
  }, [cardRows, metaRows]);

  /* ─── daily breakdown ─── */
  const dailyRows = useMemo(() => {
    const map = new Map<string, { date: string; card: number; meta: number }>();
    // build full date range (so gaps render)
    let cursor = parseISO(from);
    const end = parseISO(to);
    while (cursor <= end) {
      const k = format(cursor, "yyyy-MM-dd");
      map.set(k, { date: k, card: 0, meta: 0 });
      cursor = addDays(cursor, 1);
    }
    for (const r of cardRows) {
      const k = String(r.charge_date);
      const cur = map.get(k) ?? { date: k, card: 0, meta: 0 };
      cur.card += Number(r.amount_brl ?? 0);
      map.set(k, cur);
    }
    for (const r of metaRows) {
      const k = String(r.sp_date);
      const cur = map.get(k) ?? { date: k, card: 0, meta: 0 };
      cur.meta += Number(r.spend_brl ?? 0);
      map.set(k, cur);
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [cardRows, metaRows, from, to]);

  /* ─── per account ─── */
  const accountRows = useMemo(() => {
    const map = new Map<string, { account_id: string; card: number; meta: number }>();
    for (const r of cardRows) {
      const k = String(r.ad_account_id ?? "—");
      const cur = map.get(k) ?? { account_id: k, card: 0, meta: 0 };
      cur.card += Number(r.amount_brl ?? 0);
      map.set(k, cur);
    }
    for (const r of metaRows) {
      const k = String(r.account_id ?? "—");
      const cur = map.get(k) ?? { account_id: k, card: 0, meta: 0 };
      cur.meta += Number(r.spend_brl ?? 0);
      map.set(k, cur);
    }
    return Array.from(map.values())
      .map((r) => {
        const gap = r.card - r.meta;
        const gapPct = r.meta > 0 ? (gap / r.meta) * 100 : (r.card > 0 ? 100 : 0);
        return { ...r, gap, gapPct, name: accountNameById.get(r.account_id) || r.account_id };
      })
      .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  }, [cardRows, metaRows, accountNameById]);

  /* ─── chart cumulative ─── */
  const chartData = useMemo(() => {
    let cardAcc = 0;
    let metaAcc = 0;
    return dailyRows.map((r) => {
      cardAcc += r.card;
      metaAcc += r.meta;
      return {
        date: format(parseISO(r.date), "dd/MM"),
        Cartão: Math.round(cardAcc * 100) / 100,
        Meta: Math.round(metaAcc * 100) / 100,
      };
    });
  }, [dailyRows]);

  /* ─── upload (kept) ─── */
  const handleUpload = useCallback(async (file: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const text = await file.text();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada");

      const res = await fetch(
        `https://taeduxiandktefcwgspx.supabase.co/functions/v1/process-card-extract`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ provider, filename: file.name, csv_text: text }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Falha ao processar CSV");
      toast.success(
        `CSV processado: ${json.inserted ?? 0} novas, ${json.skipped_duplicate ?? 0} duplicadas, ${json.skipped_invalid ?? 0} inválidas`
      );
      qc.invalidateQueries({ queryKey: ["recon-card"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao processar arquivo");
    } finally {
      setUploading(false);
    }
  }, [provider, qc]);

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <ShieldAlert className="w-12 h-12 text-muted-foreground" />
        <p className="text-base font-medium">Acesso restrito</p>
        <p className="text-sm text-muted-foreground">Esta área é exclusiva para administradores.</p>
      </div>
    );
  }

  const sev = gapSeverity(totals.gapPct);
  const loading = loadingCard || loadingMeta;

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-[1600px]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Reconciliação Cartão × Meta</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Comparação de totais agregados — sem matching transação a transação.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={period} onValueChange={(v: Period) => setPeriod(v)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="week">Semana</SelectItem>
              <SelectItem value="month">Mês</SelectItem>
              <SelectItem value="custom">Customizado</SelectItem>
            </SelectContent>
          </Select>
          {period === "custom" && (
            <>
              <DateInput value={customFrom} onChange={setCustomFrom} />
              <span className="text-xs text-muted-foreground">até</span>
              <DateInput value={customTo} onChange={setCustomTo} />
            </>
          )}
          <Badge variant="outline" className="text-xs">
            {format(parseISO(from), "dd/MM/yyyy")} → {format(parseISO(to), "dd/MM/yyyy")}
          </Badge>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiCard
          icon={CreditCard}
          label="Total Cartão (BRL)"
          value={fmtBRL(totals.cardTotal)}
          sub={`${cardRows.length} cobranças no período`}
          accent="text-foreground"
        />
        <KpiCard
          icon={Wallet}
          label="Total Meta (BRL)"
          value={fmtBRL(totals.metaTotal)}
          sub={`${metaRows.length} dias-conta`}
          accent="text-foreground"
        />
        <Card className={`border ${sev.bg}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Gap (Cartão − Meta)</span>
              {totals.gap >= 0
                ? <TrendingUp className={`w-4 h-4 ${sev.color}`} />
                : <TrendingDown className={`w-4 h-4 ${sev.color}`} />}
            </div>
            <div className={`text-xl md:text-2xl font-bold tabular-nums ${sev.color}`}>
              {totals.gap >= 0 ? "+" : ""}{fmtBRL(totals.gap)}
            </div>
            <div className={`text-[11px] mt-1 ${sev.color} font-medium`}>
              {sev.emoji} {sev.label} · {totals.gapPct >= 0 ? "+" : ""}{totals.gapPct.toFixed(2)}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4" /> Evolução acumulada no período
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-[300px] flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tickFormatter={fmtBRLcompact} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
                    formatter={(v: number) => fmtBRL(v)}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="Cartão" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Meta" stroke="hsl(var(--muted-foreground))" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs Daily / Account / Upload */}
      <Tabs defaultValue="daily" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="daily">Por dia</TabsTrigger>
          <TabsTrigger value="account">Por conta</TabsTrigger>
          <TabsTrigger
            value="upload"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground bg-primary/10 text-primary font-semibold gap-2"
          >
            <Upload className="w-4 h-4" /> Upload CSV
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="w-4 h-4" /> Histórico
          </TabsTrigger>
          <TabsTrigger value="howto">📥 Como subir</TabsTrigger>
        </TabsList>

        {/* Daily */}
        <TabsContent value="daily">
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[520px]">
                {loading ? (
                  <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead className="text-right">Cartão (BRL)</TableHead>
                        <TableHead className="text-right">Meta (BRL)</TableHead>
                        <TableHead className="text-right">Gap R$</TableHead>
                        <TableHead className="text-right">Gap %</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dailyRows.slice().reverse().map((r) => {
                        const gap = r.card - r.meta;
                        const gapPct = r.meta > 0 ? (gap / r.meta) * 100 : (r.card > 0 ? 100 : 0);
                        const s = gapSeverity(gapPct);
                        const empty = r.card === 0 && r.meta === 0;
                        return (
                          <TableRow key={r.date}>
                            <TableCell className="text-xs whitespace-nowrap">{fmtDate(r.date)}</TableCell>
                            <TableCell className="text-right text-xs tabular-nums">{fmtBRL(r.card)}</TableCell>
                            <TableCell className="text-right text-xs tabular-nums">{fmtBRL(r.meta)}</TableCell>
                            <TableCell className={`text-right text-xs tabular-nums font-medium ${empty ? "text-muted-foreground" : s.color}`}>
                              {gap >= 0 ? "+" : ""}{fmtBRL(gap)}
                            </TableCell>
                            <TableCell className={`text-right text-xs tabular-nums ${empty ? "text-muted-foreground" : s.color}`}>
                              {empty ? "—" : `${gapPct >= 0 ? "+" : ""}${gapPct.toFixed(2)}%`}
                            </TableCell>
                            <TableCell>
                              {empty
                                ? <Badge variant="outline" className="text-[10px]">Sem dados</Badge>
                                : <Badge className={`text-[10px] border ${s.bg} ${s.color}`}>{s.emoji} {s.label}</Badge>}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Per account */}
        <TabsContent value="account">
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[520px]">
                {loading ? (
                  <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                ) : accountRows.length === 0 ? (
                  <div className="text-center py-16 text-sm text-muted-foreground">Sem dados no período.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Conta</TableHead>
                        <TableHead className="text-right">Cartão (BRL)</TableHead>
                        <TableHead className="text-right">Meta (BRL)</TableHead>
                        <TableHead className="text-right">Gap R$</TableHead>
                        <TableHead className="text-right">Gap %</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {accountRows.map((r) => {
                        const s = gapSeverity(r.gapPct);
                        const empty = r.card === 0 && r.meta === 0;
                        return (
                          <TableRow key={r.account_id}>
                            <TableCell className="text-xs">
                              <div className="font-medium truncate max-w-[260px]">{r.name}</div>
                              <div className="text-muted-foreground text-[10px] font-mono">{r.account_id}</div>
                            </TableCell>
                            <TableCell className="text-right text-xs tabular-nums">{fmtBRL(r.card)}</TableCell>
                            <TableCell className="text-right text-xs tabular-nums">{fmtBRL(r.meta)}</TableCell>
                            <TableCell className={`text-right text-xs tabular-nums font-medium ${empty ? "text-muted-foreground" : s.color}`}>
                              {r.gap >= 0 ? "+" : ""}{fmtBRL(r.gap)}
                            </TableCell>
                            <TableCell className={`text-right text-xs tabular-nums ${empty ? "text-muted-foreground" : s.color}`}>
                              {empty ? "—" : `${r.gapPct >= 0 ? "+" : ""}${r.gapPct.toFixed(2)}%`}
                            </TableCell>
                            <TableCell>
                              <Badge className={`text-[10px] border ${s.bg} ${s.color}`}>{s.emoji} {s.label}</Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Upload */}
        <TabsContent value="upload">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="w-4 h-4" /> Upload de Extrato CSV
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
                <Select value={provider} onValueChange={(v: any) => setProvider(v)}>
                  <SelectTrigger className="md:w-[200px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lot">Lot (BRL)</SelectItem>
                    <SelectItem value="payoneer">Payoneer (USD)</SelectItem>
                  </SelectContent>
                </Select>
                <label className="flex-1">
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    disabled={uploading}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUpload(f);
                      e.target.value = "";
                    }}
                  />
                  <div className={`flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed rounded-md cursor-pointer transition ${uploading ? "opacity-50 cursor-wait" : "hover:bg-accent hover:border-primary"}`}>
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                    <span className="text-sm">{uploading ? "Processando..." : `Selecionar CSV ${provider === "lot" ? "Lot (Settled + On hold)" : "Payoneer (status Completed)"}`}</span>
                  </div>
                </label>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Idempotente por transaction_id. Só linhas Meta (FACEBK / FACEBOOK / METAPAY / META PAY) viram gasto reconciliável.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Histórico de uploads */}
        <TabsContent value="history">
          <UploadHistoryPanel />
        </TabsContent>

        {/* How-to (kept) */}
        <TabsContent value="howto" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" /> Guia — Extrato Lot (BRL)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="font-medium mb-1">📋 Cabeçalho exato esperado:</p>
                <code className="block bg-muted p-2 rounded text-xs overflow-x-auto">
                  transaction id,nickname,card ending,transaction date,posted date,description,status,amount
                </code>
              </div>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>✅ Aceita <code className="text-foreground">status = Settled</code> ou <code className="text-foreground">On hold</code></p>
                <p>✅ Filtro Meta estrito: só descrições com <code className="text-foreground">FACEBK / FACEBOOK / METAPAY / META PAY / META PLATFORMS</code></p>
                <p>✅ Data <code className="text-foreground">YYYY-MM-DD</code> · Valor em <code className="text-foreground">BRL</code></p>
                <p>⚠️ Linhas sem <code className="text-foreground">transaction id</code> são ignoradas</p>
              </div>
              <Separator />
              <p className="text-xs text-muted-foreground">
                Exemplo: <code>TX12345,LOT-CARD-01,1234,2026-04-15,2026-04-15,FACEBK *YJZKCM54E2,Settled,1500.50</code>
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" /> Guia — Extrato Payoneer (USD)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>✅ Todas linhas com Transaction ID vão pra <strong>payoneer_transactions</strong> (categorizadas em 8 tipos)</p>
                <p>✅ Pra entrar em <strong>daily_card_charges</strong> (gasto Meta reconciliável) precisa: <strong>category=card_charge_meta</strong> + <strong>status=Completed</strong> + <strong>currency=USD</strong></p>
                <p>✅ Filtro Meta: <code className="text-foreground">card charge</code> + <code className="text-foreground">FACEBK / METAPAY / META PAY / META PLATFORMS</code></p>
                <p>✅ Data <code className="text-foreground">MM/DD/YYYY</code></p>
                <p>✅ Wire-ins viram top-ups em /treasury</p>
                <p>⚠️ Conversão FX automática via PTAX do dia</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-blue-500/30 bg-blue-500/5">
            <CardHeader>
              <CardTitle className="text-base text-blue-500">Como interpretar o gap</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <p>🟢 <strong>&lt; 2%</strong> — Excelente, mês fechado equilibra</p>
              <p>🟢 <strong>2-5%</strong> — Normal (timing de débito + diferença de cotação)</p>
              <p>🟡 <strong>5-10%</strong> — Atenção, vale investigar</p>
              <p>🔴 <strong>&gt; 10%</strong> — Anomalia, alerta</p>
              <p className="pt-2">
                Foco: ver se <strong>TOTAL bate com TOTAL</strong> — não tentamos identificar transação individual,
                porque o Meta não expõe ID estável que case com o extrato do cartão.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ─────────── small components ─────────── */
function KpiCard({ icon: Icon, label, value, sub, accent }: {
  icon: any; label: string; value: string; sub?: string; accent?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">{label}</span>
          <Icon className={`w-4 h-4 ${accent || "text-muted-foreground"}`} />
        </div>
        <div className={`text-xl md:text-2xl font-bold tabular-nums ${accent || ""}`}>{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="font-normal">
          <CalendarIcon className="w-3.5 h-3.5 mr-2" />
          {format(parseISO(value), "dd/MM/yyyy")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={parseISO(value)}
          onSelect={(d) => d && onChange(format(d, "yyyy-MM-dd"))}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
