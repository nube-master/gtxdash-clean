import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
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
}

const STRATEGY_LABELS: Record<string, string> = {
  LOWEST_COST_WITHOUT_CAP: "Menor custo",
  LOWEST_COST_WITH_BID_CAP: "Limite de lance",
  COST_CAP: "Meta por custo",
  LOWEST_COST_WITH_MIN_ROAS: "ROAS mínimo",
};

const CAP_STRATEGIES = new Set(["LOWEST_COST_WITH_BID_CAP", "COST_CAP"]);

const fmtBrl = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

interface Props {
  campaignId: string;
  campaignName: string;
  accountId?: string | null;
}

export function CampaignAdsetsPanel({ campaignId, campaignName, accountId }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["meta-adset-status", "campaign", campaignId],
    queryFn: async (): Promise<AdsetRow[]> => {
      const { data, error } = await supabase
        .from("meta_adset_status" as any)
        .select("*")
        .eq("campaign_id", campaignId)
        .order("adset_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any as AdsetRow[];
    },
    staleTime: 30_000,
  });

  const syncNow = useCallback(async () => {
    try {
      setSyncing(true);
      const body: any = { campaign_id: campaignId };
      if (accountId) body.account_id = accountId;
      const res = await supabase.functions.invoke("sync-adset-status", { body });
      if (res.error) throw res.error;
      toast.success("Sincronizado", { description: `${(res.data as any)?.adsets ?? 0} conjuntos` });
      await refetch();
      qc.invalidateQueries({ queryKey: ["meta-adset-status"] });
    } catch (e: any) {
      toast.error("Falha ao sincronizar", { description: e.message });
    } finally { setSyncing(false); }
  }, [campaignId, accountId, refetch, qc]);

  const canEditCap = (r: AdsetRow) => !!r.bid_strategy && CAP_STRATEGIES.has(r.bid_strategy);

  const saveOne = async (row: AdsetRow, newBidStr: string) => {
    const parsed = newBidStr.trim() === "" ? null : Number(newBidStr.replace(",", "."));
    if (parsed !== null && !isFinite(parsed)) {
      toast.error("Valor inválido"); return;
    }
    const prev = row.bid_amount ?? null;
    try {
      setSaving(true);
      const { error, data } = await supabase.functions.invoke("update-adset-bid", {
        body: {
          items: [{ adset_id: row.adset_id, account_id: row.account_id, bid_amount_brl: parsed }],
          reason: "inline_bid_edit_drawer",
        },
      });
      if (error) throw error;
      const r = (data as any)?.results?.[0];
      if (!r?.ok) throw new Error(r?.error || "update_failed");
      const hora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      toast.success(`✅ Lance atualizado — ${fmtBrl(parsed)}`, {
        description: `${row.adset_name} · ${fmtBrl(prev)} → ${fmtBrl(parsed)} · ${hora}`,
      });
      setEditing((s) => { const n = { ...s }; delete n[row.adset_id]; return n; });
      await refetch();
      qc.invalidateQueries({ queryKey: ["meta-adset-status"] });
    } catch (e: any) {
      toast.error("Falha ao atualizar lance", { description: e.message });
    } finally { setSaving(false); }
  };

  const rows = data ?? [];
  const activeCount = useMemo(
    () => rows.filter((r) => !isMetaCampaignPaused(r.status, r.effective_status)).length,
    [rows],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] text-muted-foreground">
          {rows.length} conjunto{rows.length === 1 ? "" : "s"} · {activeCount} ativo{activeCount === 1 ? "" : "s"}
        </div>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={syncNow} disabled={syncing}>
          <RefreshCw className={`w-3 h-3 mr-1 ${syncing ? "animate-spin" : ""}`} />
          Sincronizar Meta
        </Button>
      </div>

      {isLoading && <Skeleton className="h-24" />}

      {!isLoading && rows.length === 0 && (
        <div className="rounded border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
          Nenhum conjunto sincronizado para esta campanha ainda.
          <br />Clique em "Sincronizar Meta" para puxar os adsets.
        </div>
      )}

      <div className="space-y-2">
        {rows.map((r) => {
          const paused = isMetaCampaignPaused(r.status, r.effective_status);
          const editVal = editing[r.adset_id];
          const isEditing = editVal !== undefined;
          const formatted =
            r.bid_amount != null
              ? r.bid_amount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              : "";
          const shown = isEditing ? editVal : formatted;
          const editable = canEditCap(r);
          return (
            <div
              key={`${r.account_id}-${r.adset_id}`}
              className="rounded-md border border-border/60 bg-muted/10 p-2.5 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate" title={r.adset_name}>{r.adset_name}</div>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <Badge variant={paused ? "secondary" : "default"} className="text-[9px] h-4 px-1.5">
                      {paused ? "Pausado" : "Ativo"}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {r.bid_strategy ? (STRATEGY_LABELS[r.bid_strategy] ?? r.bid_strategy) : "sem estratégia"}
                    </span>
                    {r.optimization_goal && (
                      <span className="text-[10px] text-muted-foreground">· {r.optimization_goal}</span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[9px] uppercase text-muted-foreground">Budget</div>
                  <div className="text-xs tabular-nums">{fmtBrl(r.daily_budget || null)}</div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Bid Cap</span>
                {editable ? (
                  isEditing ? (
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground">R$</span>
                      <Input
                        autoFocus
                        className="h-7 w-24 text-right text-xs tabular-nums"
                        value={shown}
                        placeholder="—"
                        onChange={(e) => setEditing((s) => ({ ...s, [r.adset_id]: e.target.value }))}
                        onBlur={() => {
                          // cancela edição se valor não mudou
                          if (shown === (r.bid_amount != null ? String(r.bid_amount) : "")) {
                            setEditing((s) => { const n = { ...s }; delete n[r.adset_id]; return n; });
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveOne(r, shown);
                          if (e.key === "Escape") setEditing((s) => { const n = { ...s }; delete n[r.adset_id]; return n; });
                        }}
                      />
                      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={saving} onClick={() => saveOne(r, shown)}>
                        OK
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="text-xs tabular-nums font-medium hover:bg-muted/40 px-2 py-1 rounded transition-colors"
                      onClick={() =>
                        setEditing((s) => ({
                          ...s,
                          [r.adset_id]: r.bid_amount != null ? String(r.bid_amount) : "",
                        }))
                      }
                      title="Clique para editar"
                    >
                      {r.bid_amount != null ? `R$ ${formatted}` : "—"}
                    </button>
                  )
                ) : (
                  <span
                    className="text-[10px] text-muted-foreground/60 cursor-help"
                    title="Este adset não usa estratégia de bid cap. Configure 'Limite de lance' ou 'Meta por custo' na Meta para habilitar edição."
                  >
                    sem teto (edite estratégia na Meta)
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
