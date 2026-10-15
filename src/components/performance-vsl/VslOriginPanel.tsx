import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useVslOriginStats } from "@/hooks/useVslOriginStats";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  vsl_id?: string | null;
}

const HEX24 = /^[0-9a-f]{24}$/i;

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v || 0);
}

export function VslOriginPanel({ vsl_id }: Props) {
  const initial = vsl_id && HEX24.test(vsl_id) ? vsl_id : "";
  const [playerId, setPlayerId] = useState<string>(initial);
  const [period, setPeriod] = useState<"today" | "yesterday" | "7d">("today");
  const [refreshing, setRefreshing] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading } = useVslOriginStats(playerId || null, period);

  async function handleRefresh() {
    if (!playerId) {
      toast.error("Player ID inválido");
      return;
    }
    setRefreshing(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("pull_vturb_origins", {
        body: { player_id: playerId },
      });
      if (error) throw error;
      toast.success(`Atualizado · ${(res as any)?.upserts ?? 0} linhas`);
      qc.invalidateQueries({ queryKey: ["vsl-origin-stats"] });
    } catch (e: any) {
      toast.error(e?.message || "Erro ao atualizar");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Origem de Criativos</CardTitle>
          <CardDescription>Agrupado por AD ID — soma de todas as variações de campanha</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value.trim())}
            placeholder="Player ID (24 hex)"
            className="h-8 w-48 font-mono text-xs"
          />
          <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
            <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="yesterday">Ontem</SelectItem>
              <SelectItem value="7d">Últimos 7d</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={handleRefresh} disabled={refreshing || !playerId}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${refreshing ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!playerId || !HEX24.test(playerId) ? (
          <div className="text-xs text-muted-foreground italic px-3 py-8 text-center border border-dashed border-border/40 rounded-lg">
            Informe um Player ID VTurb (24 caracteres hex) para carregar a origem dos criativos.
          </div>
        ) : isLoading ? (
          <div className="text-xs text-muted-foreground px-3 py-8 text-center">Carregando…</div>
        ) : !data || data.length === 0 ? (
          <div className="text-xs text-muted-foreground italic px-3 py-8 text-center border border-dashed border-border/40 rounded-lg">
            Sem dados para este período. Clique em "Atualizar" para puxar do VTurb.
          </div>
        ) : (
          <div className="rounded-lg border border-border/40 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/30 border-b border-border/40">
                <tr className="text-left text-muted-foreground uppercase text-[10px] tracking-wider">
                  <th className="px-3 py-2 font-medium">AD ID</th>
                  <th className="px-3 py-2 font-medium text-right">Views</th>
                  <th className="px-3 py-2 font-medium text-right">Started</th>
                  <th className="px-3 py-2 font-medium text-right">Pitch</th>
                  
                  <th className="px-3 py-2 font-medium text-right">Vendas</th>
                  <th className="px-3 py-2 font-medium text-right">Spend</th>
                  <th className="px-3 py-2 font-medium text-right">Receita</th>
                  <th className="px-3 py-2 font-medium text-right">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.ad_id} className="border-b border-border/20 last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-2 font-mono">{r.ad_id}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.total_viewed.toLocaleString("pt-BR")}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.total_started.toLocaleString("pt-BR")}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.total_over_pitch.toLocaleString("pt-BR")}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.vendas || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.spend_brl > 0 ? formatBRL(r.spend_brl) : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.receita_brl > 0 ? formatBRL(r.receita_brl) : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">
                      {r.roas != null ? `${r.roas.toFixed(2)}x` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
