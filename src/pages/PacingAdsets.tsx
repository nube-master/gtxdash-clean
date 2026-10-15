import { useMemo, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOperationId } from "@/contexts/OperationContext";
import { PacingHeader } from "@/components/pacing/PacingHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, RefreshCw, Zap } from "lucide-react";
import { isMetaCampaignPaused } from "@/lib/metaCampaignStatus";

interface AdsetRow {
  account_id: string;
  adset_id: string;
  campaign_id: string;
  campaign_name: string | null;
  adset_name: string;
  status: string;
  effective_status: string;
  daily_budget: number;
  bid_strategy: string | null;
  bid_amount: number | null;
  optimization_goal: string | null;
  billing_event: string | null;
  updated_at: string;
}

const STRATEGY_LABELS: Record<string, string> = {
  LOWEST_COST_WITHOUT_CAP: "Menor custo (auto)",
  LOWEST_COST_WITH_BID_CAP: "Limite de lance",
  COST_CAP: "Meta por custo",
  LOWEST_COST_WITH_MIN_ROAS: "ROAS mínimo",
};

const STRATEGY_OPTIONS = Object.entries(STRATEGY_LABELS);

const fmtBrl = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

export default function PacingAdsets() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const opId = useOperationId();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [strategyFilter, setStrategyFilter] = useState<string>("ALL");
  const [goalFilter, setGoalFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ACTIVE" | "PAUSED" | "ALL">("ACTIVE");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBid, setBulkBid] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Só adsets com estratégia de teto real aceitam edição de bid cap.
  const CAP_STRATEGIES = new Set(["LOWEST_COST_WITH_BID_CAP", "COST_CAP"]);
  const canEditCap = (r: AdsetRow) => !!r.bid_strategy && CAP_STRATEGIES.has(r.bid_strategy);
  const [editing, setEditing] = useState<Record<string, string>>({});

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["meta-adset-status", opId],
    queryFn: async (): Promise<AdsetRow[]> => {
      const PAGE = 1000;
      const all: AdsetRow[] = [];
      let from = 0;
      while (true) {
        let q = supabase.from("meta_adset_status" as any)
          .select("*")
          .order("updated_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (opId) q = q.eq("operation_id", opId);
        const { data, error } = await q;
        if (error) throw error;
        const rows = (data ?? []) as any as AdsetRow[];
        all.push(...rows);
        if (rows.length < PAGE) break;
        from += PAGE;
      }
      return all;
    },
    refetchInterval: 120_000,
    staleTime: 30_000,
  });

  const syncNow = useCallback(async () => {
    try {
      const res = await supabase.functions.invoke("sync-adset-status", {
        body: opId ? { operation_id: opId } : {},
      });
      if (res.error) throw res.error;
      toast({ title: "Sincronizado", description: `${(res.data as any)?.adsets ?? 0} conjuntos atualizados` });
      qc.invalidateQueries({ queryKey: ["meta-adset-status"] });
    } catch (e: any) {
      toast({ title: "Falha ao sincronizar", description: e.message, variant: "destructive" });
    }
  }, [opId, qc]);

  const goalOptions = useMemo(() => {
    const s = new Set<string>();
    (data ?? []).forEach((r) => r.optimization_goal && s.add(r.optimization_goal));
    return Array.from(s).sort();
  }, [data]);

  const strategyOptionsInData = useMemo(() => {
    const s = new Set<string>();
    (data ?? []).forEach((r) => r.bid_strategy && s.add(r.bid_strategy));
    return Array.from(s).sort();
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((r) => {
      const paused = isMetaCampaignPaused(r.status, r.effective_status);
      if (statusFilter === "ACTIVE" && paused) return false;
      if (statusFilter === "PAUSED" && !paused) return false;
      if (strategyFilter !== "ALL" && r.bid_strategy !== strategyFilter) return false;
      if (goalFilter !== "ALL" && r.optimization_goal !== goalFilter) return false;
      if (q) {
        const hay = `${r.adset_name} ${r.campaign_name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, search, strategyFilter, goalFilter, statusFilter]);

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((r) => r.adset_id)));
  };

  const saveOne = async (row: AdsetRow, newBidStr: string) => {
    const parsed = newBidStr.trim() === "" ? null : Number(newBidStr.replace(",", "."));
    if (parsed !== null && !isFinite(parsed)) {
      toast({ title: "Valor inválido", variant: "destructive" });
      return;
    }
    const prev = row.bid_amount ?? null;
    try {
      setSaving(true);
      const { error, data } = await supabase.functions.invoke("update-adset-bid", {
        body: {
          items: [{
            adset_id: row.adset_id,
            account_id: row.account_id,
            bid_amount_brl: parsed,
          }],
          reason: "inline_bid_edit",
        },
      });
      if (error) throw error;
      const r = (data as any)?.results?.[0];
      if (!r?.ok) throw new Error(r?.error || "update_failed");
      const hora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      toast({
        title: `✅ Lance atualizado — ${fmtBrl(parsed)}`,
        description: `${row.adset_name} · ${fmtBrl(prev)} → ${fmtBrl(parsed)} · ${hora}`,
      });
      setEditing((s) => { const n = { ...s }; delete n[row.adset_id]; return n; });
      qc.invalidateQueries({ queryKey: ["meta-adset-status"] });
    } catch (e: any) {
      toast({ title: "Falha ao atualizar lance", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const applyBulk = async () => {
    if (!selected.size) return;
    const parsed = bulkBid.trim() === "" ? undefined : Number(bulkBid.replace(",", "."));
    if (parsed === undefined || !isFinite(parsed)) {
      toast({ title: "Bid inválido", variant: "destructive" }); return;
    }
    const items = filtered
      .filter((r) => selected.has(r.adset_id) && canEditCap(r))
      .map((r) => ({
        adset_id: r.adset_id,
        account_id: r.account_id,
        bid_amount_brl: parsed,
      }));
    const skipped = selected.size - items.length;
    if (!items.length) {
      toast({ title: "Nenhum adset elegível", description: "Nenhum dos selecionados usa estratégia com bid cap.", variant: "destructive" });
      return;
    }
    try {
      setSaving(true);
      const { error, data } = await supabase.functions.invoke("update-adset-bid", {
        body: { items, reason: "bulk_bid_edit" },
      });
      if (error) throw error;
      const results = (data as any)?.results ?? [];
      const ok = results.filter((r: any) => r.ok).length;
      const fail = results.length - ok;
      const hora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      toast({
        title: `✅ ${ok} lance${ok === 1 ? "" : "s"} atualizado${ok === 1 ? "" : "s"} — ${fmtBrl(parsed)}`,
        description: [`aplicado às ${hora}`, fail && `${fail} falharam`, skipped && `${skipped} ignorados (sem bid cap)`].filter(Boolean).join(" · "),
        variant: fail ? "destructive" : "default",
      });
      setBulkOpen(false); setBulkBid(""); setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["meta-adset-status"] });
    } catch (e: any) {
      toast({ title: "Falha em massa", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <div className="min-h-screen bg-background">
      <PacingHeader />
      <div className="container mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/pacing")}>
            <ArrowLeft className="w-4 h-4 mr-1" />Voltar
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Conjuntos de anúncios · Lance & Meta</h1>
            <p className="text-xs text-muted-foreground">
              Ajuste bid_amount / bid_cap direto no adset. Mudanças vão pra Meta na hora.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={syncNow} disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
            Sincronizar
          </Button>
        </div>

        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border/50 bg-card/40 p-3">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-muted-foreground">Buscar</label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="adset ou campanha..." className="h-9" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Status</label>
            <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
              <SelectTrigger className="h-9 w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Ativos</SelectItem>
                <SelectItem value="PAUSED">Pausados</SelectItem>
                <SelectItem value="ALL">Todos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Estratégia</label>
            <Select value={strategyFilter} onValueChange={setStrategyFilter}>
              <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas</SelectItem>
                {strategyOptionsInData.map((s) => (
                  <SelectItem key={s} value={s}>{STRATEGY_LABELS[s] ?? s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Objetivo</label>
            <Select value={goalFilter} onValueChange={setGoalFilter}>
              <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos</SelectItem>
                {goalOptions.map((g) => (
                  <SelectItem key={g} value={g}>{g}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {selected.size} selecionado{selected.size === 1 ? "" : "s"} · {filtered.length} visível{filtered.length === 1 ? "" : "s"}
            </span>
            <Button size="sm" disabled={!selected.size} onClick={() => setBulkOpen(true)}>
              <Zap className="w-4 h-4 mr-1" />Ajustar em massa
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2 w-8">
                    <Checkbox
                      checked={selected.size > 0 && selected.size === filtered.length}
                      onCheckedChange={toggleAll}
                    />
                  </th>
                  <th className="p-2 text-left">Conjunto</th>
                  <th className="p-2 text-left">Campanha</th>
                  <th className="p-2 text-left">Status</th>
                  <th className="p-2 text-left">Estratégia</th>
                  <th className="p-2 text-left">Objetivo</th>
                  <th className="p-2 text-right">Bid Cap (BRL)</th>
                  <th className="p-2 text-right">Budget diário</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={8} className="p-6"><Skeleton className="h-6" /></td></tr>
                )}
                {!isLoading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted-foreground text-sm">
                      Nenhum conjunto encontrado. Clique em "Sincronizar" para carregar os adsets da Meta.
                    </td>
                  </tr>
                )}
                {filtered.map((r) => {
                  const paused = isMetaCampaignPaused(r.status, r.effective_status);
                  const editVal = editing[r.adset_id];
                  const shown = editVal ?? (r.bid_amount != null ? String(r.bid_amount) : "");
                  return (
                    <tr key={`${r.account_id}-${r.adset_id}`} className="border-t border-border/40 hover:bg-muted/20">
                      <td className="p-2">
                        <Checkbox
                          checked={selected.has(r.adset_id)}
                          onCheckedChange={() => toggleRow(r.adset_id)}
                        />
                      </td>
                      <td className="p-2 font-medium max-w-[240px] truncate" title={r.adset_name}>
                        {r.adset_name || "—"}
                      </td>
                      <td className="p-2 text-muted-foreground max-w-[220px] truncate" title={r.campaign_name ?? ""}>
                        {r.campaign_name ?? "—"}
                      </td>
                      <td className="p-2">
                        <Badge variant={paused ? "secondary" : "default"} className="text-[10px]">
                          {paused ? "Pausado" : "Ativo"}
                        </Badge>
                      </td>
                      <td className="p-2 text-xs">
                        {r.bid_strategy ? (STRATEGY_LABELS[r.bid_strategy] ?? r.bid_strategy) : "—"}
                      </td>
                      <td className="p-2 text-xs text-muted-foreground">{r.optimization_goal ?? "—"}</td>
                      <td className="p-2 text-right">
                        {canEditCap(r) ? (
                          <div className="flex items-center gap-1 justify-end">
                            <Input
                              className="h-8 w-24 text-right"
                              value={shown}
                              placeholder="—"
                              onChange={(e) => setEditing((s) => ({ ...s, [r.adset_id]: e.target.value }))}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveOne(r, shown);
                                if (e.key === "Escape") setEditing((s) => { const n = { ...s }; delete n[r.adset_id]; return n; });
                              }}
                            />
                            {editVal !== undefined && (
                              <Button size="sm" variant="outline" className="h-8" disabled={saving} onClick={() => saveOne(r, shown)}>
                                OK
                              </Button>
                            )}
                          </div>
                        ) : (
                          <span
                            className="text-muted-foreground/60 text-xs cursor-help"
                            title="Este adset não usa estratégia de bid cap. Configure 'Limite de lance' ou 'Meta por custo' na Meta pra habilitar edição."
                          >
                            —
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-right text-muted-foreground">{fmtBrl(r.daily_budget || null)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajustar {selected.size} conjunto{selected.size === 1 ? "" : "s"}</DialogTitle>
            <DialogDescription>
              Aplica na Meta o novo lance e/ou estratégia. Deixe em branco pra manter o valor atual.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Novo bid cap (BRL)</label>
              <Input value={bulkBid} onChange={(e) => setBulkBid(e.target.value)} placeholder="ex: 50,00" autoFocus />
              <p className="text-[11px] text-muted-foreground mt-1">
                Use <b>0</b> pra remover o teto. Adsets sem estratégia de bid cap serão ignorados.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={applyBulk} disabled={saving || bulkBid.trim() === ""}>
              {saving ? "Aplicando..." : "Aplicar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
