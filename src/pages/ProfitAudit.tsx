import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { useProfitAudit, type ProfitAuditDay } from "@/hooks/useProfitAudit";
import {
  AlertTriangle, CheckCircle2, ChevronRight, Copy, DollarSign, FileSearch,
  Info, ShieldCheck, TrendingDown, TrendingUp, XCircle,
} from "lucide-react";

function fmtBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(v || 0);
}

function fmtPct(v: number) {
  return `${(v || 0).toFixed(2)}%`;
}

function SourceBadge({ source }: { source: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    cartpanda: { label: "CartPanda", cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
    redtrack: { label: "RedTrack", cls: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
    clickbank_audit: { label: "ClickBank", cls: "bg-blue-500/15 text-blue-500 border-blue-500/30" },
  };
  const m = map[source] || { label: source, cls: "" };
  return <Badge variant="outline" className={`text-[10px] ${m.cls}`}>{m.label}</Badge>;
}

function DayCard({ day }: { day: ProfitAuditDay }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const finalRevenue = day.snapshot && day.date < new Date().toISOString().slice(0, 10)
    ? Number(day.snapshot.total_revenue)
    : day.revenueIncluded;
  const finalSpend = day.snapshot && day.date < new Date().toISOString().slice(0, 10)
    ? Number(day.snapshot.total_spend)
    : day.spendTotal;

  const filteredRevLines = useMemo(() => {
    if (!search) return day.revenueLines;
    const q = search.toLowerCase();
    return day.revenueLines.filter(
      (l) => l.reference.toLowerCase().includes(q) || l.utm_campaign.toLowerCase().includes(q),
    );
  }, [day.revenueLines, search]);

  const profitColor = day.grossProfit >= 0 ? "text-emerald-500" : "text-destructive";

  return (
    <Card className="border-border/40">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors py-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <ChevronRight className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`} />
                <CardTitle className="text-sm font-mono">{day.date}</CardTitle>
                {day.duplicatesCount > 0 && (
                  <Badge variant="outline" className="bg-amber-500/15 text-amber-500 border-amber-500/30 text-[10px]">
                    <Copy className="h-3 w-3 mr-1" /> {day.duplicatesCount} dup
                  </Badge>
                )}
                {day.snapshot && (
                  <Badge variant="outline" className="bg-blue-500/15 text-blue-500 border-blue-500/30 text-[10px]">
                    <ShieldCheck className="h-3 w-3 mr-1" /> Snapshot
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-6 text-xs">
                <div>
                  <div className="text-muted-foreground text-[10px] uppercase tracking-wider">Receita</div>
                  <div className="font-mono font-semibold text-emerald-500">{fmtBRL(finalRevenue)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-[10px] uppercase tracking-wider">Investimento</div>
                  <div className="font-mono font-semibold text-destructive">{fmtBRL(finalSpend)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-[10px] uppercase tracking-wider">Lucro Bruto</div>
                  <div className={`font-mono font-semibold ${profitColor}`}>{fmtBRL(day.grossProfit)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-[10px] uppercase tracking-wider">Margem</div>
                  <div className={`font-mono font-semibold ${profitColor}`}>{fmtPct(day.profitMarginPct)}</div>
                </div>
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-4 pt-0">
            {/* Snapshot reconciliation */}
            {day.snapshot && (
              <div className="rounded-md border border-blue-500/20 bg-blue-500/5 p-3 text-xs">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldCheck className="h-4 w-4 text-blue-500" />
                  <span className="font-semibold">Snapshot autoritativo (daily_totals_snapshot)</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono">
                  <div>
                    <div className="text-muted-foreground text-[10px]">Snap Receita</div>
                    <div>{fmtBRL(Number(day.snapshot.total_revenue))}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-[10px]">Snap Spend</div>
                    <div>{fmtBRL(Number(day.snapshot.total_spend))}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-[10px]">Vendas</div>
                    <div>{day.snapshot.total_conversions}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-[10px]">Câmbio</div>
                    <div>{day.snapshot.usd_to_brl}</div>
                  </div>
                </div>
                {Math.abs(Number(day.snapshot.total_revenue) - day.revenueIncluded) > 1 && (
                  <div className="mt-2 flex items-center gap-2 text-amber-500">
                    <AlertTriangle className="h-3 w-3" />
                    Divergência: snapshot {fmtBRL(Number(day.snapshot.total_revenue))} vs ao vivo {fmtBRL(day.revenueIncluded)}
                  </div>
                )}
              </div>
            )}

            <Tabs defaultValue="revenue">
              <TabsList>
                <TabsTrigger value="revenue">
                  Receita ({day.revenueLines.length})
                </TabsTrigger>
                <TabsTrigger value="spend">
                  Investimento ({day.spendLines.length})
                </TabsTrigger>
                <TabsTrigger value="rules">Regras & Rounding</TabsTrigger>
              </TabsList>

              <TabsContent value="revenue" className="space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <Input
                    placeholder="Filtrar por receipt / order / utm…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="max-w-xs h-8 text-xs"
                  />
                  <div className="text-xs text-muted-foreground flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      Inclusas: {fmtBRL(day.revenueIncluded)}
                    </span>
                    <span className="flex items-center gap-1">
                      <XCircle className="h-3 w-3 text-destructive" />
                      Excluídas: {fmtBRL(day.revenueExcluded)}
                    </span>
                  </div>
                </div>
                <div className="rounded border border-border/30 max-h-[420px] overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead className="text-[10px]">Fonte</TableHead>
                        <TableHead className="text-[10px]">Referência</TableHead>
                        <TableHead className="text-[10px]">UTM / Campanha</TableHead>
                        <TableHead className="text-[10px]">Status</TableHead>
                        <TableHead className="text-[10px] text-right">Valor (BRL)</TableHead>
                        <TableHead className="text-[10px] text-center">Conta?</TableHead>
                        <TableHead className="text-[10px]">Motivo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRevLines.map((l, i) => (
                        <TableRow key={i} className={!l.included ? "opacity-60" : ""}>
                          <TableCell><SourceBadge source={l.source} /></TableCell>
                          <TableCell className="font-mono text-[10px] max-w-[160px] truncate">{l.reference}</TableCell>
                          <TableCell className="text-[10px] max-w-[200px] truncate">{l.utm_campaign}</TableCell>
                          <TableCell className="text-[10px]">{l.status}</TableCell>
                          <TableCell className="text-right font-mono text-[10px]">
                            {l.currency !== "BRL" && (
                              <span className="text-muted-foreground mr-1">
                                ({l.raw_amount.toFixed(2)} {l.currency})
                              </span>
                            )}
                            {fmtBRL(l.amount_brl)}
                          </TableCell>
                          <TableCell className="text-center">
                            {l.included ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 inline" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5 text-destructive inline" />
                            )}
                          </TableCell>
                          <TableCell className="text-[10px] text-muted-foreground">{l.reason}</TableCell>
                        </TableRow>
                      ))}
                      {filteredRevLines.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-6">
                            Nenhuma linha de receita.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="spend" className="space-y-2">
                <div className="rounded border border-border/30 max-h-[420px] overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead className="text-[10px]">Account ID</TableHead>
                        <TableHead className="text-[10px]">Fonte</TableHead>
                        <TableHead className="text-[10px] text-right">Spend (BRL)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {day.spendLines.map((s, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-[10px]">{s.account_id}</TableCell>
                          <TableCell className="text-[10px]">{s.source}</TableCell>
                          <TableCell className="text-right font-mono text-[10px]">{fmtBRL(s.spend)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="border-t-2 font-semibold">
                        <TableCell colSpan={2} className="text-right text-[10px]">Total</TableCell>
                        <TableCell className="text-right font-mono text-[10px]">{fmtBRL(day.spendTotal)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="rules">
                <div className="space-y-2 text-xs">
                  {day.rules.map((r, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 rounded bg-muted/30">
                      <Info className="h-3.5 w-3.5 mt-0.5 text-blue-500 shrink-0" />
                      <span>{r}</span>
                    </div>
                  ))}
                  <div className="flex items-start gap-2 p-2 rounded border border-amber-500/20 bg-amber-500/5">
                    <DollarSign className="h-3.5 w-3.5 mt-0.5 text-amber-500 shrink-0" />
                    <span>{day.rounding}</span>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export default function ProfitAudit() {
  const { data: days = [], isLoading } = useProfitAudit();

  const totals = useMemo(() => {
    const r = days.reduce((s, d) => s + (d.snapshot ? Number(d.snapshot.total_revenue) : d.revenueIncluded), 0);
    const sp = days.reduce((s, d) => s + (d.snapshot ? Number(d.snapshot.total_spend) : d.spendTotal), 0);
    const dup = days.reduce((s, d) => s + d.duplicatesCount, 0);
    const linesExcluded = days.reduce((s, d) => s + d.revenueLines.filter((l) => !l.included && l.source !== "clickbank_audit").length, 0);
    return { revenue: r, spend: sp, profit: r - sp, dup, linesExcluded };
  }, [days]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <FileSearch className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Auditoria de Lucro</h1>
          <p className="text-xs text-muted-foreground">
            Trilha completa: receita, investimento, regras e checagem de duplicidade por dia.
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Receita Total</div>
            <div className="font-mono font-semibold text-emerald-500 mt-1">{fmtBRL(totals.revenue)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Investimento</div>
            <div className="font-mono font-semibold text-destructive mt-1">{fmtBRL(totals.spend)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Lucro Bruto</div>
            <div className={`font-mono font-semibold mt-1 ${totals.profit >= 0 ? "text-emerald-500" : "text-destructive"}`}>
              {totals.profit >= 0 ? <TrendingUp className="h-3 w-3 inline mr-1" /> : <TrendingDown className="h-3 w-3 inline mr-1" />}
              {fmtBRL(totals.profit)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Duplicadas</div>
            <div className={`font-mono font-semibold mt-1 ${totals.dup > 0 ? "text-amber-500" : "text-emerald-500"}`}>
              <Copy className="h-3 w-3 inline mr-1" />
              {totals.dup}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Linhas Excluídas</div>
            <div className="font-mono font-semibold mt-1">{totals.linesExcluded}</div>
          </CardContent>
        </Card>
      </div>

      {/* Days */}
      {isLoading ? (
        <Card><CardContent className="py-12 text-center text-xs text-muted-foreground">Carregando auditoria…</CardContent></Card>
      ) : days.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-xs text-muted-foreground">Sem dados no período.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {days.map((d) => <DayCard key={d.date} day={d} />)}
        </div>
      )}
    </div>
  );
}
