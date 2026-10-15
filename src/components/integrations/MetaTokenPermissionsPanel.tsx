import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CheckCircle2, XCircle, Eye, Lock, RefreshCw, Search, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useOperationId } from "@/contexts/OperationContext";

interface Row {
  account_id: string;
  account_name: string | null;
  can_manage: boolean;
  can_read: boolean;
  tokens_with_manage: number;
  tokens_with_read: number;
  tokens_total_tested: number;
  last_error: string | null;
  checked_at: string;
}

export function MetaTokenPermissionsPanel() {
  const qc = useQueryClient();
  const operationId = useOperationId();
  const [running, setRunning] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "no_manage" | "no_access">("all");

  const { data, isLoading } = useQuery({
    queryKey: ["meta-token-permissions", operationId],
    enabled: !!operationId,
    queryFn: async () => {
      // Escopa por operação: só mostra contas cadastradas em meta_ad_accounts da operação atual.
      const { data: opAccounts, error: accErr } = await supabase
        .from("meta_ad_accounts")
        .select("account_id")
        .eq("operation_id", operationId!);
      if (accErr) throw accErr;
      const allowed = new Set((opAccounts ?? []).map((a: any) => String(a.account_id)));
      if (allowed.size === 0) return [] as Row[];

      const { data, error } = await supabase
        .from("meta_token_permissions")
        .select("*")
        .in("account_id", Array.from(allowed))
        .order("account_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    refetchInterval: 60_000,
  });


  const runValidation = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("validate-meta-tokens", { body: {} });
      if (error) throw error;
      toast.success(
        `Validado: ${data.accounts_can_manage} podem gerenciar · ${data.accounts_read_only} só leitura · ${data.accounts_no_access} sem acesso`,
      );
      await qc.invalidateQueries({ queryKey: ["meta-token-permissions"] });
    } catch (e: any) {
      toast.error(`Falha: ${e.message}`);
    } finally {
      setRunning(false);
    }
  };

  const rows = (data ?? []).filter((r) => {
    if (filter === "no_manage" && r.can_manage) return false;
    if (filter === "no_access" && (r.can_read || r.can_manage)) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        (r.account_name ?? "").toLowerCase().includes(q) ||
        r.account_id.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const summary = {
    total: data?.length ?? 0,
    manage: data?.filter((r) => r.can_manage).length ?? 0,
    readOnly: data?.filter((r) => r.can_read && !r.can_manage).length ?? 0,
    noAccess: data?.filter((r) => !r.can_read).length ?? 0,
  };

  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-card/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-foreground">Permissões dos tokens Meta</h4>
          <p className="text-xs text-muted-foreground">
            Verifica quais contas cada token pode <strong>ler</strong> vs <strong>gerenciar</strong> (pausar/ligar).
            {data && data[0]?.checked_at && (
              <> · Última: {formatDistanceToNow(new Date(data[0].checked_at), { locale: ptBR, addSuffix: true })}</>
            )}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={runValidation} disabled={running}>
          <RefreshCw className={`mr-2 h-3 w-3 ${running ? "animate-spin" : ""}`} />
          {running ? "Validando…" : "Validar agora"}
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <div className="rounded-md border border-border/60 bg-background/40 p-2">
          <div className="text-muted-foreground">Total</div>
          <div className="text-lg font-semibold">{summary.total}</div>
        </div>
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2">
          <div className="text-emerald-400">Pode gerenciar</div>
          <div className="text-lg font-semibold text-emerald-400">{summary.manage}</div>
        </div>
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
          <div className="text-amber-400">Só leitura</div>
          <div className="text-lg font-semibold text-amber-400">{summary.readOnly}</div>
        </div>
        <div className="rounded-md border border-red-500/30 bg-red-500/5 p-2">
          <div className="text-red-400">Sem acesso</div>
          <div className="text-lg font-semibold text-red-400">{summary.noAccess}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-7 text-xs"
            placeholder="Buscar por nome ou ID da conta"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")} className="h-8 text-xs">
            Todas
          </Button>
          <Button size="sm" variant={filter === "no_manage" ? "default" : "outline"} onClick={() => setFilter("no_manage")} className="h-8 text-xs">
            Sem gerenciar
          </Button>
          <Button size="sm" variant={filter === "no_access" ? "default" : "outline"} onClick={() => setFilter("no_access")} className="h-8 text-xs">
            Sem acesso
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-xs text-muted-foreground">Carregando…</div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-muted-foreground py-4 text-center">
          {data?.length === 0 ? 'Clique em "Validar agora" para gerar o primeiro relatório.' : "Nenhuma conta com esse filtro."}
        </div>
      ) : (
        <div className="max-h-[420px] overflow-y-auto rounded-md border border-border/60 divide-y divide-border/40">
          {rows.map((r) => (
            <div key={r.account_id} className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-muted/20">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm">
                  {r.can_manage ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  ) : r.can_read ? (
                    <Eye className="h-4 w-4 shrink-0 text-amber-400" />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0 text-red-400" />
                  )}
                  <span className="truncate font-medium">{r.account_name || r.account_id}</span>
                </div>
                <div className="mt-0.5 text-[10px] text-muted-foreground font-mono">act_{r.account_id}</div>
                {r.last_error && !r.can_read && (
                  <div className="mt-1 flex items-center gap-1 text-[11px] text-red-400">
                    <AlertTriangle className="h-3 w-3" />
                    <span>{r.last_error}</span>
                  </div>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {r.can_manage ? (
                  <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-[10px]">
                    <CheckCircle2 className="mr-1 h-3 w-3" /> Pode gerenciar
                  </Badge>
                ) : r.can_read ? (
                  <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-300 text-[10px]">
                    <Lock className="mr-1 h-3 w-3" /> Só leitura
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-red-300 text-[10px]">
                    <XCircle className="mr-1 h-3 w-3" /> Sem acesso
                  </Badge>
                )}
                <div className="text-[10px] text-muted-foreground">
                  {r.tokens_with_manage}/{r.tokens_total_tested} c/ MANAGE
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-md border border-border/40 bg-muted/20 p-3 text-[11px] text-muted-foreground">
        <div className="mb-1 font-semibold text-foreground">Por que "só leitura" ou "sem acesso"?</div>
        <ul className="list-disc space-y-0.5 pl-4">
          <li><strong>Pode gerenciar</strong>: algum token cadastrado tem a task <code>MANAGE</code> — o toggle liga/pausa.</li>
          <li><strong>Só leitura</strong>: token tem <code>ANALYZE</code>/<code>ADVERTISE</code> mas não <code>MANAGE</code>. Você vê dados no pacing mas o toggle vai falhar. Solução: no Business Manager, promova o usuário do token a "Anunciante"+"Gerenciar campanhas" nessa conta.</li>
          <li><strong>Sem acesso</strong>: nenhum token vê a conta hoje. As campanhas aparecem porque foram sincronizadas quando ainda havia acesso. Solução: adicione novo token que enxergue a conta ou remova a conta em Integrações → Meta Ads.</li>
        </ul>
      </div>
    </div>
  );
}
