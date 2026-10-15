import { useState, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Search, Save, Loader2, AlertTriangle, ShieldAlert, Lock, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useOperation } from "@/contexts/OperationContext";
import { usePlanLimits } from "@/hooks/usePlanLimits";

interface MetaAccount {
  account_id: string;
  account_name: string;
  account_status: number;
  currency: string;
  timezone: string;
  is_active: boolean;
  is_saved: boolean;
  category?: string;
  not_visible_via_token?: boolean;
}

export function MetaAccountSelector() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { operationId } = useOperation();
  const { data: planLimits } = usePlanLimits();
  const [localState, setLocalState] = useState<Map<string, boolean>>(new Map());
  const [categoryState, setCategoryState] = useState<Map<string, string>>(new Map());
  const [accountSearch, setAccountSearch] = useState("");

  const { data: accounts, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["meta-accounts", operationId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("list-meta-accounts", {
        body: { operation_id: operationId },
      });
      if (error) throw error;
      return (data.accounts as MetaAccount[]) || [];
    },
    staleTime: 0,
    refetchOnMount: false,
  });

  // Detect unconfigured accounts (active on Meta but not enabled in dashboard)
  const unconfiguredAccounts = accounts?.filter(
    (acc) => !acc.is_saved && acc.account_status === 1
  ) || [];

  const hasUnconfigured = unconfiguredAccounts.length > 0;

  // Show toast alert when unconfigured accounts are detected
  useEffect(() => {
    if (hasUnconfigured) {
      toast({
        title: `🚨 ${unconfiguredAccounts.length} conta(s) não configurada(s)!`,
        description: `Existem contas ativas no Meta que não estão sincronizando: ${unconfiguredAccounts.map(a => a.account_name).slice(0, 3).join(", ")}${unconfiguredAccounts.length > 3 ? "..." : ""}`,
        variant: "destructive",
        duration: 15000,
      });
    }
  }, [hasUnconfigured, unconfiguredAccounts.length]);

  const getCategory = (acc: MetaAccount) => {
    if (categoryState.has(acc.account_id)) return categoryState.get(acc.account_id)!;
    return acc.category || "own";
  };

  const setCategory = (accountId: string, cat: string) => {
    const newState = new Map(categoryState);
    newState.set(accountId, cat);
    setCategoryState(newState);
  };

  const saveMutation = useMutation({
    mutationFn: async (selections: Array<{ account_id: string; account_name: string; is_active: boolean; currency: string; timezone: string; category: string }>) => {
      // Batch upsert (era 1 request por conta — com 300+ contas travava/timeout)
      const rows = selections.map((sel) => ({
        account_id: sel.account_id,
        account_name: sel.account_name,
        is_active: sel.is_active,
        currency: sel.currency,
        timezone: sel.timezone,
        category: sel.category,
        operation_id: operationId,
      }));
      const CHUNK = 100;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error } = await supabase
          .from("meta_ad_accounts" as any)
          .upsert(rows.slice(i, i + CHUNK), { onConflict: "account_id" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: "Contas salvas!", description: "Sincronizando status das contas na Meta..." });
      queryClient.invalidateQueries({ queryKey: ["meta-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["meta-ad-accounts"] });
      setLocalState(new Map());
      setCategoryState(new Map());
      // Contas recém-ativadas ficam com account_status NULL ("Sem status" na
      // Central de Contingência) até o cron de 10min rodar. Dispara o sync já.
      supabase.functions
        .invoke("sync-campaign-status", { body: { operation_id: operationId } })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["account-statuses"] });
          queryClient.invalidateQueries({ queryKey: ["campaign-statuses"] });
        })
        .catch((e) => console.warn("[MetaAccountSelector] sync status falhou:", e));
    },

    onError: (err: any) => {
      const msg = err?.message || err?.error_description || err?.details || err?.hint || (typeof err === "string" ? err : JSON.stringify(err));
      console.error("[MetaAccountSelector] save error:", err);
      toast({ title: "Erro ao salvar", description: msg, variant: "destructive" });
    },
  });

  const getIsActive = (acc: MetaAccount) => {
    if (localState.has(acc.account_id)) return localState.get(acc.account_id)!;
    return acc.is_active;
  };

  const toggleAccount = (acc: MetaAccount) => {
    const newState = new Map(localState);
    newState.set(acc.account_id, !getIsActive(acc));
    setLocalState(newState);
  };

  const hasChanges = localState.size > 0 || categoryState.size > 0;

  const handleSave = () => {
    if (!accounts) return;
    if (!operationId) {
      toast({
        title: "Selecione uma operação",
        description: "Não é possível salvar contas sem uma operação ativa. Escolha uma operação no seletor do topo antes de salvar.",
        variant: "destructive",
      });
      return;
    }
    // Só grava o que mudou (evita reescrever 300+ linhas e roubar contas de outras ops)
    const selections = accounts
      .filter((acc) => localState.has(acc.account_id) || categoryState.has(acc.account_id))
      .map((acc) => ({
        account_id: acc.account_id,
        account_name: acc.account_name,
        is_active: getIsActive(acc),
        currency: acc.currency || "USD",
        timezone: acc.timezone || "America/Sao_Paulo",
        category: getCategory(acc),
      }));

    if (selections.length === 0) {
      toast({ title: "Nada para salvar", description: "Nenhuma alteração pendente." });
      return;
    }

    // Count how many will be active after save
    const newActiveCount = accounts.filter((acc) => getIsActive(acc)).length;
    if (planLimits?.maxMetaAccounts != null && newActiveCount > planLimits.maxMetaAccounts) {
      toast({
        title: "Limite de contas atingido",
        description: `Seu plano permite até ${planLimits.maxMetaAccounts} contas ativas. Você selecionou ${newActiveCount}. Faça upgrade para adicionar mais.`,
        variant: "destructive",
      });
      return;
    }

    saveMutation.mutate(selections);
  };

  // Activate all unconfigured accounts at once
  const handleActivateAll = () => {
    const newState = new Map(localState);
    for (const acc of unconfiguredAccounts) {
      newState.set(acc.account_id, true);
    }
    setLocalState(newState);
    toast({
      title: "Contas selecionadas!",
      description: `${unconfiguredAccounts.length} conta(s) marcada(s) como ativas. Clique em "Salvar Seleção" para confirmar.`,
    });
  };

  const timezoneLabel = (tz: string) => {
    const labels: Record<string, string> = {
      "America/Sao_Paulo": "UTC-3",
      "America/New_York": "UTC-5",
      "America/Los_Angeles": "UTC-8",
      "Europe/London": "UTC+0",
      "Europe/Paris": "UTC+1",
      "Europe/Berlin": "UTC+1",
      "Europe/Belgrade": "UTC+1",
      "Europe/Amsterdam": "UTC+1",
    };
    return labels[tz] || tz.split("/")[1]?.substring(0, 8) || tz;
  };

  const statusLabel = (status: number) => {
    if (status === 1) return <Badge variant="outline" className="text-xs bg-[hsl(var(--warroom-positive))]/15 text-[hsl(var(--warroom-positive))] border-[hsl(var(--warroom-positive))]/30">Ativa</Badge>;
    if (status === 2) return <Badge variant="outline" className="text-xs bg-destructive/15 text-destructive border-destructive/30">Desativada</Badge>;
    return <Badge variant="outline" className="text-xs">Status {status}</Badge>;
  };

  const activeCount = accounts?.filter((a) => getIsActive(a)).length ?? 0;

  // Sort: unconfigured first, then by name
  const sortedAccounts = useMemo(() => {
    if (!accounts) return [];
    const q = accountSearch.toLowerCase();
    return [...accounts]
      .filter((a) => !q || a.account_name.toLowerCase().includes(q) || a.account_id.includes(q))
      .sort((a, b) => {
        const aUnconfigured = !a.is_saved && a.account_status === 1;
        const bUnconfigured = !b.is_saved && b.account_status === 1;
        if (aUnconfigured && !bUnconfigured) return -1;
        if (!aUnconfigured && bUnconfigured) return 1;
        return a.account_name.localeCompare(b.account_name);
      });
  }, [accounts, accountSearch]);

  return (
    <Card className="warroom-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Contas de Anúncio</CardTitle>
            <CardDescription className="text-xs">
              Selecione quais contas do Meta Ads devem ser sincronizadas
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs font-mono">
              {activeCount} ativas
            </Badge>
            {(() => {
              const hidden = accounts?.filter((a) => a.not_visible_via_token).length || 0;
              if (!hidden) return null;
              return (
                <Badge variant="destructive" className="text-xs font-mono" title="Salvas no banco mas nenhum token Meta consegue lê-las agora">
                  {hidden} invisíveis ao token
                </Badge>
              );
            })()}
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Buscar Contas
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Alert banner for unconfigured accounts */}
        {hasUnconfigured && (
          <div className="mb-4 rounded-lg border-2 border-destructive/50 bg-destructive/10 p-4 animate-pulse-slow">
            <div className="flex items-start gap-3">
              <ShieldAlert className="h-6 w-6 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-sm font-bold text-destructive">
                  ⚠️ {unconfiguredAccounts.length} conta(s) ativa(s) no Meta NÃO configurada(s)!
                </h4>
                <p className="text-xs text-destructive/80 mt-1 whitespace-pre-line">
                  Investiguei via API v22.0 direto na Meta com o mesmo token EDD (escola_maribel). FATOS:1. O token TEM permissão financeira. GET /me/adaccounts?fields=balance,   amount_spent,currency retornou 14 contas com balance real, zero erros. 2. Conta act_960676138744949 (Peregriya): Meta agora reporta USD 815.38.   Sua tabela meta_account_financials tem USD 555.47. Gap de USD 260.   Isso PROVA que sync-meta-balance está quebrado, NÃO que o token    está sem permissão. 3. Conta "01 SHAWNTELLE" que você mencionou: NÃO EXISTE mais na resposta    do /me/adaccounts. Provavelmente foi removida do BM/token e seu banco    nunca foi limpado. Está exibindo dados fantasma. AÇÃO REAL:1. Rode sync-meta-balance manualmente AGORA para as 14 contas ativas    (lista abaixo). Se falhar, me mostre o log RAW do erro Meta,    sem interpretar.2. Adicione dedupe/cleanup no meta_account_financials: qualquer conta    que NÃO retornar em /me/adaccounts deve ser marcada como inactive    ou removida da view.3. Configure health check no cron: se sync-meta-balance falhar &gt;2h    consecutivas, alert em vez de mostrar dados stale silenciosamente. Contas ativas atuais (fonte de verdade Meta API):- act_2793584900809911 (02 FUNNEL MAKERS, BRL)- act_2131001753973649 (AURORA LEAO, USD)- act_2555724948183552 (AURORA LEÃO FAMILY 1, USD)- act_1057430863602204 (AURORA LEÃO FAMILY 1 dupl, USD)- act_1442966834269044 (Jade Elliot868, USD)- act_1329081318149094 (Apparel P Art, USD)- act_2338421063648044 (Arsenal MARCA, USD)- act_2947344662001846 (Bright Start, USD)- act_706114962558361 (DOGE 656996, USD)- act_284028653898851 (Kestler Bau, EUR)- act_960676138744949 (Peregriya, USD)- act_263501074834066 (jacob brown, USD)- act_1848384442398680 (senses.srilanka, EUR)- act_1511968103461390 (RW USD 4, USD) Depois disso, me confirma se sync rodou OK e traz os balances atualizados.
                </p>

                <ul className="mt-2 space-y-1">
                  {unconfiguredAccounts.map((acc) => (
                    <li key={acc.account_id} className="text-xs font-mono text-destructive flex items-center gap-1.5">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      <span className="font-semibold">{acc.account_name}</span>
                      <span className="text-destructive/60">({acc.currency}, {timezoneLabel(acc.timezone)})</span>
                    </li>
                  ))}
                </ul>
                <Button 
                  size="sm" 
                  variant="destructive" 
                  className="mt-3"
                  onClick={handleActivateAll}
                >
                  Ativar todas as {unconfiguredAccounts.length} contas
                </Button>
              </div>
            </div>
          </div>
        )}

        {isLoading || isFetching ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            <span className="text-sm">Buscando contas no Meta Ads...</span>
          </div>
        ) : !accounts?.length ? (
          <div className="text-center py-8 text-muted-foreground">
            <RefreshCw className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhuma conta encontrada.</p>
            <p className="text-xs mt-1">Clique em "Buscar Contas" para carregar.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar conta por nome ou ID..."
                value={accountSearch}
                onChange={(e) => setAccountSearch(e.target.value)}
                className="pl-8 h-9 text-xs"
              />
              {accountSearch && (
                <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6" onClick={() => setAccountSearch("")}>
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap text-xs text-muted-foreground">
              <span>
                {sortedAccounts.length} conta(s) listada(s) ·{" "}
                {sortedAccounts.filter((a) => a.account_status === 1).length} ativa(s) no Meta
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const next = new Map(localState);
                    let n = 0;
                    for (const a of sortedAccounts) {
                      if (a.account_status === 1 && !getIsActive(a)) {
                        next.set(a.account_id, true);
                        n++;
                      }
                    }
                    setLocalState(next);
                    toast({ title: `${n} conta(s) ativa(s) marcada(s)`, description: n ? 'Clique em "Salvar Seleção".' : "Todas já estavam marcadas." });
                  }}
                >
                  Marcar todas ativas (filtro atual)
                </Button>
              </div>
            </div>

            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full">
               <thead>
                  <tr className="border-b border-border bg-muted/30">
                     <th className="text-left px-3 py-2 text-xs font-mono w-10"></th>
                     <th className="text-left px-3 py-2 text-xs font-mono">Conta</th>
                     <th className="text-left px-3 py-2 text-xs font-mono w-20">Status</th>
                     <th className="text-left px-3 py-2 text-xs font-mono w-16">Moeda</th>
                     <th className="text-left px-3 py-2 text-xs font-mono w-16">Fuso</th>
                     <th className="text-left px-3 py-2 text-xs font-mono w-28">Categoria</th>
                   </tr>
                 </thead>
                 <tbody>
                   {sortedAccounts.map((acc) => {
                     const isUnconfigured = !acc.is_saved && acc.account_status === 1;
                     return (
                       <tr
                         key={acc.account_id}
                         className={`border-b border-border/50 hover:bg-muted/20 cursor-pointer ${
                           isUnconfigured ? "bg-destructive/5 hover:bg-destructive/10" : ""
                         }`}
                         onClick={() => toggleAccount(acc)}
                       >
                         <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                           <Checkbox
                             checked={getIsActive(acc)}
                             onCheckedChange={() => toggleAccount(acc)}
                           />
                         </td>
                         <td className="px-3 py-2">
                           <div className="flex items-center gap-1.5">
                             {isUnconfigured && (
                               <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                             )}
                             <div className={`text-sm font-medium leading-tight truncate ${isUnconfigured ? "text-destructive font-bold" : ""}`}>
                               {acc.account_name}
                             </div>
                             {isUnconfigured && (
                               <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4">
                                 NOVA
                               </Badge>
                             )}
                             {acc.not_visible_via_token && (
                               <Badge
                                 variant="outline"
                                 className="text-[9px] px-1 py-0 h-4 gap-0.5 border-destructive/40 text-destructive"
                                 title="Salva no banco, mas nenhum token Meta vinculado a esta operação consegue ler essa conta agora. Adicione/renove o token que tem acesso a ela."
                               >
                                 <Lock className="h-2.5 w-2.5" /> sem token
                               </Badge>
                             )}
                           </div>
                         </td>
                         <td className="px-3 py-2">{statusLabel(acc.account_status)}</td>
                         <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{acc.currency}</td>
                         <td className="px-3 py-2">
                           <Badge variant="outline" className="text-[10px] font-mono">
                             {timezoneLabel(acc.timezone)}
                           </Badge>
                         </td>
                         <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                           <Select value={getCategory(acc)} onValueChange={(v) => setCategory(acc.account_id, v)}>
                              <SelectTrigger className="h-7 w-[110px] text-xs font-mono">
                               <SelectValue />
                             </SelectTrigger>
                              <SelectContent>
                               <SelectItem value="own">Própria</SelectItem>
                               <SelectItem value="rented">Alugada</SelectItem>
                               <SelectItem value="farm">🔥 Farm</SelectItem>
                             </SelectContent>
                           </Select>
                         </td>
                       </tr>
                     );
                   })}
                </tbody>
              </table>
            </div>

            <div className="sticky bottom-0 z-20 -mx-6 -mb-6 mt-2 flex items-center justify-between gap-3 border-t border-border bg-card/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/80">
              <span className="text-xs text-muted-foreground">
                {hasChanges
                  ? `${localState.size + categoryState.size} alteração(ões) pendente(s)`
                  : `✓ Tudo salvo — ${(accounts ?? []).filter((a) => getIsActive(a)).length} conta(s) ativa(s) sincronizando nesta operação`}
              </span>
              <div className="flex items-center gap-2">
                {hasChanges && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setLocalState(new Map()); setCategoryState(new Map()); }}
                    disabled={saveMutation.isPending}
                  >
                    Desfazer
                  </Button>
                )}
                <Button onClick={handleSave} disabled={!hasChanges || saveMutation.isPending}>
                  {saveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  {hasChanges ? "Salvar Seleção" : "Salvo"}
                </Button>
              </div>
            </div>

          </div>
        )}
      </CardContent>
    </Card>
  );
}
