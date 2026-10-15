// Painel de auditoria do Kill Squad — filtra pacing_action_log (action_type='kill_squad')
// por killed_by, região, batch_id e data.
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Filter, RefreshCw, Skull, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface Row {
  id: string;
  campaign_id: string;
  campaign_name: string;
  account_id: string;
  reason: string;
  spend_at_action: number | null;
  success: boolean | null;
  batch_id: string | null;
  killed_by: string | null;
  region: string | null;
  triggered_at: string;
  meta_response: any;
}

interface ProfileRow {
  user_id: string;
  email: string | null;
  display_name?: string | null;
}

export function KillSquadLogPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileRow>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [killedBy, setKilledBy] = useState<string>("all");
  const [region, setRegion] = useState<string>("all");
  const [batchId, setBatchId] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d;
  });
  const [dateTo, setDateTo] = useState<Date | undefined>(new Date());
  const [undoingKey, setUndoingKey] = useState<string | null>(null);

  const canUndo = (r: Row) => {
    if (!r.success) return false;
    const ageMs = Date.now() - new Date(r.triggered_at).getTime();
    return ageMs < 24 * 60 * 60 * 1000;
  };

  const runUndo = async (payload: { log_id?: string; batch_id?: string }, key: string, label: string) => {
    if (undoingKey) return;
    if (!confirm(`Reverter ${label}? Vai renomear [xxx]→[top] e ATIVAR no Meta.`)) return;
    setUndoingKey(key);
    try {
      const { data, error } = await supabase.functions.invoke("kill-squad-undo", { body: payload });
      if (error) throw error;
      const restored = (data as any)?.restored ?? 0;
      const failed = (data as any)?.failed ?? 0;
      if (failed > 0) {
        toast.warning(`Revertidas ${restored} · ${failed} falha(s)`);
      } else {
        toast.success(`↩️ ${restored} campanha(s) reativada(s)`);
      }
      await load();
    } catch (e) {
      toast.error(`Falha ao reverter: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setUndoingKey(null);
    }
  };

  const undoOne = (r: Row) => runUndo({ log_id: r.id }, `log:${r.id}`, r.campaign_name);
  const undoBatch = (bid: string) => runUndo({ batch_id: bid }, `batch:${bid}`, `batch ${bid.slice(0, 8)}`);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      let q = supabase
        .from("pacing_action_log")
        .select(
          "id,campaign_id,campaign_name,account_id,reason,spend_at_action,success,batch_id,killed_by,region,triggered_at,meta_response"
        )
        .eq("action_type", "kill_squad")
        .order("triggered_at", { ascending: false })
        .limit(1000);

      if (killedBy !== "all") q = q.eq("killed_by", killedBy);
      if (region !== "all") q = q.eq("region", region);
      if (batchId.trim()) q = q.eq("batch_id", batchId.trim());
      if (dateFrom) {
        const f = new Date(dateFrom);
        f.setHours(0, 0, 0, 0);
        q = q.gte("triggered_at", f.toISOString());
      }
      if (dateTo) {
        const t = new Date(dateTo);
        t.setHours(23, 59, 59, 999);
        q = q.lte("triggered_at", t.toISOString());
      }

      const { data, error } = await q;
      if (error) throw error;
      const list = (data ?? []) as Row[];
      setRows(list);

      // Resolve profiles
      const ids = Array.from(new Set(list.map((r) => r.killed_by).filter(Boolean))) as string[];
      const missing = ids.filter((id) => !profiles[id]);
      if (missing.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id,email,display_name")
          .in("id", missing);
        if (profs) {
          setProfiles((p) => {
            const next = { ...p };
            for (const pr of profs as ProfileRow[]) next[pr.user_id] = pr;
            return next;
          });
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [killedBy, region, batchId, dateFrom, dateTo]);

  // Opções de killed_by (usuários que já mataram)
  const [killers, setKillers] = useState<ProfileRow[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("pacing_action_log")
        .select("killed_by")
        .eq("action_type", "kill_squad")
        .not("killed_by", "is", null)
        .limit(2000);
      const ids = Array.from(new Set(((data ?? []) as any[]).map((r) => r.killed_by))) as string[];
      if (!ids.length) return;
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id,email,display_name")
        .in("id", ids);
      setKillers((profs ?? []) as ProfileRow[]);
      setProfiles((p) => {
        const next = { ...p };
        for (const pr of (profs ?? []) as ProfileRow[]) next[pr.user_id] = pr;
        return next;
      });
    })();
  }, []);

  const totals = useMemo(() => {
    const total = rows.length;
    const ok = rows.filter((r) => r.success).length;
    const fail = total - ok;
    const spend = rows.reduce((s, r) => s + Number(r.spend_at_action || 0), 0);
    const batches = new Set(rows.map((r) => r.batch_id).filter(Boolean)).size;
    return { total, ok, fail, spend, batches };
  }, [rows]);

  const nameFor = (id: string | null) => {
    if (!id) return "—";
    const p = profiles[id];
    return p?.display_name || p?.email || id.slice(0, 8);
  };

  return (
    <div className="rounded-lg border border-border/60 bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skull className="h-4 w-4 text-destructive" />
          <h2 className="text-sm font-semibold uppercase tracking-wider">
            Kill Squad — Auditoria
          </h2>
          <Badge variant="outline" className="text-[10px]">
            pacing_action_log
          </Badge>
        </div>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading} className="h-7 text-xs">
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1", loading && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div className="flex items-center gap-1 text-muted-foreground">
          <Filter className="h-3.5 w-3.5" /> Filtros:
        </div>

        <Select value={region} onValueChange={setRegion}>
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue placeholder="Região" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas regiões</SelectItem>
            <SelectItem value="eu">🇪🇺 Europa (COD)</SelectItem>
            <SelectItem value="us">🇺🇸 EUA (Nutra)</SelectItem>
          </SelectContent>
        </Select>

        <Select value={killedBy} onValueChange={setKilledBy}>
          <SelectTrigger className="h-8 w-[180px] text-xs">
            <SelectValue placeholder="Executado por" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos usuários</SelectItem>
            {killers.map((k) => (
              <SelectItem key={k.user_id} value={k.user_id}>
                {k.display_name || k.email || k.user_id.slice(0, 8)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          value={batchId}
          onChange={(e) => setBatchId(e.target.value)}
          placeholder="Batch ID (UUID)"
          className="h-8 w-[240px] text-xs font-mono"
        />

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
              <CalendarIcon className="h-3.5 w-3.5" />
              {dateFrom ? format(dateFrom, "dd/MM") : "De"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className={cn("p-3 pointer-events-auto")} />
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
              <CalendarIcon className="h-3.5 w-3.5" />
              {dateTo ? format(dateTo, "dd/MM") : "Até"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateTo} onSelect={setDateTo} className={cn("p-3 pointer-events-auto")} />
          </PopoverContent>
        </Popover>

        {(killedBy !== "all" || region !== "all" || batchId || !dateFrom || !dateTo) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              setKilledBy("all");
              setRegion("all");
              setBatchId("");
              const d = new Date();
              const from = new Date();
              from.setDate(d.getDate() - 7);
              setDateFrom(from);
              setDateTo(d);
            }}
          >
            Limpar
          </Button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
        <Kpi label="Total" value={totals.total} />
        <Kpi label="OK" value={totals.ok} tone="ok" />
        <Kpi label="Falhas" value={totals.fail} tone={totals.fail ? "fail" : undefined} />
        <Kpi label="Batches" value={totals.batches} />
        <Kpi label="Spend salvo (R$)" value={totals.spend.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} />
      </div>

      {/* Undo batch (só quando filtrado por batch_id específico) */}
      {batchId.trim() && rows.some(canUndo) && (
        <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs flex items-center justify-between">
          <span className="text-amber-500">
            ↩️ Batch <span className="font-mono">{batchId.slice(0, 8)}</span> — {rows.filter(canUndo).length} campanha(s) elegível(is) para reverter (últimas 24h).
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-amber-500/60 text-amber-500 hover:bg-amber-500/10"
            disabled={undoingKey === `batch:${batchId}`}
            onClick={() => undoBatch(batchId.trim())}
          >
            <Undo2 className="h-3.5 w-3.5 mr-1" />
            {undoingKey === `batch:${batchId}` ? "Revertendo…" : "Reverter batch inteiro"}
          </Button>
        </div>
      )}

      {/* Tabela */}
      <div className="rounded border border-border/60 overflow-hidden">
        <div className="max-h-[520px] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead className="text-xs">Data/Hora</TableHead>
                <TableHead className="text-xs">Campanha</TableHead>
                <TableHead className="text-xs">Região</TableHead>
                <TableHead className="text-xs">Motivo</TableHead>
                <TableHead className="text-xs text-right">Spend 3d</TableHead>
                <TableHead className="text-xs">Executado por</TableHead>
                <TableHead className="text-xs">Batch</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={9} className="text-center text-xs text-muted-foreground py-6">Carregando…</TableCell></TableRow>
              ) : error ? (
                <TableRow><TableCell colSpan={9} className="text-center text-xs text-destructive py-6">{error}</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center text-xs text-muted-foreground py-6">Nenhuma execução do Kill Squad no período/filtros.</TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r.id} className="text-xs">
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {format(new Date(r.triggered_at), "dd/MM HH:mm")}
                  </TableCell>
                  <TableCell className="max-w-[320px] truncate" title={r.campaign_name}>
                    {r.campaign_name}
                  </TableCell>
                  <TableCell>
                    {r.region === "eu" ? "🇪🇺" : r.region === "us" ? "🇺🇸" : "—"}
                  </TableCell>
                  <TableCell className="max-w-[260px] truncate" title={r.reason}>
                    {r.reason}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.spend_at_action != null
                      ? `R$ ${Number(r.spend_at_action).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`
                      : "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{nameFor(r.killed_by)}</TableCell>
                  <TableCell>
                    {r.batch_id ? (
                      <button
                        onClick={() => setBatchId(r.batch_id!)}
                        className="font-mono text-[10px] text-muted-foreground hover:text-primary underline-offset-2 hover:underline"
                        title="Filtrar por este batch"
                      >
                        {r.batch_id.slice(0, 8)}
                      </button>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    {r.success ? (
                      <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-500">OK</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive">FALHA</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {canUndo(r) ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-amber-500 hover:text-amber-400 hover:bg-amber-500/10"
                        disabled={undoingKey === `log:${r.id}`}
                        onClick={() => undoOne(r)}
                        title="Reverter: [xxx]→[top] + ACTIVE"
                      >
                        <Undo2 className="h-3.5 w-3.5 mr-1" />
                        {undoingKey === `log:${r.id}` ? "…" : "Desfazer"}
                      </Button>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/60">
                        {r.success ? ">24h" : "—"}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number | string; tone?: "ok" | "fail" }) {
  return (
    <div className="rounded border border-border/60 bg-background/50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn(
        "text-lg font-semibold tabular-nums",
        tone === "ok" && "text-emerald-500",
        tone === "fail" && "text-destructive",
      )}>{value}</div>
    </div>
  );
}
