import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOperation } from "@/contexts/OperationContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { Link2, Plus, Trash2, Save, AlertTriangle, CheckCircle2, Search, Copy, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast as sonnerToast } from "sonner";
import { AccountCombobox } from "./AccountCombobox";

interface AliasRow {
  id: string;
  account_id: string;
  account_label: string;
  utm_aliases: string[];
}

interface AccountOption {
  account_id: string;
  account_name: string;
}

export function UtmAccountMapper() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { operationId } = useOperation();
  const [search, setSearch] = useState("");
  const [newAlias, setNewAlias] = useState("");
  const [inlineAddTag, setInlineAddTag] = useState<Record<string, string>>({});
  const [newAccountId, setNewAccountId] = useState("");

  // Fetch existing mappings
  const { data: mappings, isLoading: loadingMappings } = useQuery({
    queryKey: ["utm-aliases", operationId],
    queryFn: async (): Promise<AliasRow[]> => {
      let query = supabase
        .from("account_utm_aliases")
        .select("*")
        .order("account_label", { ascending: true });
      if (operationId) query = query.eq("operation_id", operationId);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as AliasRow[];
    },
  });

  // Fetch accounts
  const { data: accounts } = useQuery({
    queryKey: ["account-statuses", operationId],
    queryFn: async (): Promise<AccountOption[]> => {
      let query = supabase
        .from("meta_ad_accounts")
        .select("account_id, account_name")
        .eq("is_active", true)
        .order("account_name", { ascending: true });
      if (operationId) query = query.eq("operation_id", operationId);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as AccountOption[];
    },
  });

  // Fetch unmatched UTM tags from sales
  const { data: utmTags } = useQuery({
    queryKey: ["unmatched-utm-tags", operationId],
    queryFn: async () => {
      let salesQuery = supabase
        .from("sales_data")
        .select("utm_campaign")
        .not("utm_campaign", "is", null)
        .limit(5000);
      if (operationId) salesQuery = salesQuery.eq("operation_id", operationId);
      const { data, error } = await salesQuery;
      if (error) throw error;

      // Extract first bracket tags and count
      const tagCounts = new Map<string, number>();
      for (const row of data || []) {
        const match = (row.utm_campaign as string)?.match(/\[([^\]]+)\]/);
        const tag = match ? match[1] : null;
        if (tag) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }

      return Array.from(tagCounts.entries())
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count);
    },
    staleTime: 5 * 60 * 1000,
  });

  // Get all mapped aliases in a flat set
  const mappedAliases = useMemo(() => {
    const set = new Set<string>();
    (mappings || []).forEach((m) => m.utm_aliases.forEach((a) => set.add(a.toUpperCase())));
    return set;
  }, [mappings]);

  // Unmatched tags
  const unmatchedTags = useMemo(() => {
    return (utmTags || []).filter((t) => !mappedAliases.has(t.tag.toUpperCase()));
  }, [utmTags, mappedAliases]);

  // Add alias to existing account mapping
  const addAliasMutation = useMutation({
    mutationFn: async ({ accountId, alias }: { accountId: string; alias: string }) => {
      // Check if account already has a mapping row
      const existing = mappings?.find((m) => m.account_id === accountId);
      if (existing) {
        const newAliases = [...new Set([...existing.utm_aliases, alias])];
        const { error } = await supabase
          .from("account_utm_aliases")
          .update({ utm_aliases: newAliases })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        // Find account name
        const acc = accounts?.find((a) => a.account_id === accountId);
        const { error } = await supabase.from("account_utm_aliases").insert({
          account_id: accountId,
          account_label: acc?.account_name || accountId,
          utm_aliases: [alias],
          operation_id: operationId || null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["utm-aliases"] });
      toast({ title: "Alias adicionado!" });
      setNewAlias("");
      setNewAccountId("");
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // Remove alias
  const removeAliasMutation = useMutation({
    mutationFn: async ({ mappingId, alias, currentAliases }: { mappingId: string; alias: string; currentAliases: string[] }) => {
      const newAliases = currentAliases.filter((a) => a !== alias);
      if (newAliases.length === 0) {
        const { error } = await supabase.from("account_utm_aliases").delete().eq("id", mappingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("account_utm_aliases")
          .update({ utm_aliases: newAliases })
          .eq("id", mappingId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["utm-aliases"] });
      toast({ title: "Alias removido" });
    },
  });

  // Quick-map: assign unmatched tag to an account
  const [quickMapAccount, setQuickMapAccount] = useState<Record<string, string>>({});

  const filteredUnmatched = useMemo(() => {
    if (!search) return unmatchedTags;
    const q = search.toLowerCase();
    return unmatchedTags.filter((t) => t.tag.toLowerCase().includes(q));
  }, [unmatchedTags, search]);

  return (
    <Card className="warroom-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <Link2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Mapeamento UTM → Conta</CardTitle>
              <CardDescription className="text-xs">
                Vincule tags de UTM (primeiro colchete) às contas de anúncios para atribuição de receita
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {unmatchedTags.length > 0 && (
              <Badge variant="outline" className="text-xs font-mono border-[hsl(var(--warroom-warning))]/30 text-[hsl(var(--warroom-warning))]">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {unmatchedTags.length} sem mapeamento
              </Badge>
            )}
            {mappings && mappings.length > 0 && (
              <Badge variant="outline" className="text-xs font-mono border-[hsl(var(--warroom-positive))]/30 text-[hsl(var(--warroom-positive))]">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {mappedAliases.size} mapeados
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Current Mappings */}
        {mappings && mappings.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-foreground">Mapeamentos Ativos</h4>
            <div className="rounded-md border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs font-mono">Conta</TableHead>
                    <TableHead className="text-xs font-mono">Tags UTM Vinculadas</TableHead>
                    <TableHead className="text-xs font-mono w-[80px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mappings.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs font-medium">
                        <div>
                          <span>{m.account_label}</span>
                          <span className="block text-[10px] text-muted-foreground font-mono">{m.account_id}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {m.utm_aliases.map((alias) => (
                            <div key={alias} className="inline-flex items-center gap-0.5">
                              <Badge
                                variant="secondary"
                                className="text-[10px] font-mono gap-1 pr-1 cursor-pointer hover:bg-destructive/20 transition-colors"
                                onClick={() =>
                                  removeAliasMutation.mutate({
                                    mappingId: m.id,
                                    alias,
                                    currentAliases: m.utm_aliases,
                                  })
                                }
                              >
                                [{alias}]
                                <Trash2 className="h-2.5 w-2.5 text-muted-foreground" />
                              </Badge>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 shrink-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(alias);
                                  sonnerToast.success("Tag copiada!", { description: alias });
                                }}
                              >
                                <Copy className="h-2.5 w-2.5 text-muted-foreground" />
                              </Button>
                            </div>
                          ))}
                          {/* Inline add tag button / input */}
                          {inlineAddTag[m.id] !== undefined ? (
                            <div className="inline-flex items-center gap-1">
                              <Input
                                placeholder="Nova tag..."
                                value={inlineAddTag[m.id] || ""}
                                onChange={(e) => setInlineAddTag((prev) => ({ ...prev, [m.id]: e.target.value }))}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && inlineAddTag[m.id]?.trim()) {
                                    addAliasMutation.mutate({ accountId: m.account_id, alias: inlineAddTag[m.id].trim() });
                                    setInlineAddTag((prev) => { const n = { ...prev }; delete n[m.id]; return n; });
                                  }
                                  if (e.key === "Escape") {
                                    setInlineAddTag((prev) => { const n = { ...prev }; delete n[m.id]; return n; });
                                  }
                                }}
                                autoFocus
                                className="h-6 w-28 text-[10px] font-mono px-1.5"
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 shrink-0"
                                disabled={!inlineAddTag[m.id]?.trim() || addAliasMutation.isPending}
                                onClick={() => {
                                  if (!inlineAddTag[m.id]?.trim()) return;
                                  addAliasMutation.mutate({ accountId: m.account_id, alias: inlineAddTag[m.id].trim() });
                                  setInlineAddTag((prev) => { const n = { ...prev }; delete n[m.id]; return n; });
                                }}
                              >
                                <Check className="h-3 w-3 text-[hsl(var(--warroom-positive))]" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 shrink-0 border border-dashed border-border hover:border-primary/50"
                              onClick={() => setInlineAddTag((prev) => ({ ...prev, [m.id]: "" }))}
                            >
                              <Plus className="h-3 w-3 text-muted-foreground" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {/* Inline add */}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Add new mapping */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground">Adicionar Mapeamento</h4>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Tag UTM (ex: BMV-C/A-10)"
              value={newAlias}
              onChange={(e) => setNewAlias(e.target.value)}
              className="flex-1 text-xs font-mono h-9"
            />
            <AccountCombobox
              accounts={accounts || []}
              value={newAccountId}
              onValueChange={setNewAccountId}
              placeholder="Selecione a conta"
              triggerClassName="flex-1 h-9 text-xs"
            />
            <Button
              size="sm"
              onClick={() => {
                if (!newAlias.trim() || !newAccountId) return;
                addAliasMutation.mutate({ accountId: newAccountId, alias: newAlias.trim() });
              }}
              disabled={!newAlias.trim() || !newAccountId || addAliasMutation.isPending}
              className="h-9"
            >
              <Plus className="h-4 w-4 mr-1" />
              Vincular
            </Button>
          </div>
        </div>

        {/* Unmatched UTM Tags */}
        {unmatchedTags.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-[hsl(var(--warroom-warning))]">
                <AlertTriangle className="h-4 w-4 inline mr-1" />
                Tags UTM Sem Correspondência
              </h4>
              <div className="relative w-48">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar tag..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-7 h-8 text-xs"
                />
              </div>
            </div>
            <div className="rounded-md border border-[hsl(var(--warroom-warning))]/20 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs font-mono">Tag UTM</TableHead>
                    <TableHead className="text-xs font-mono w-[80px]">Vendas</TableHead>
                    <TableHead className="text-xs font-mono">Vincular à Conta</TableHead>
                    <TableHead className="text-xs font-mono w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUnmatched.slice(0, 30).map((t) => (
                    <TableRow key={t.tag}>
                      <TableCell className="text-xs font-mono font-medium">
                        <Badge variant="outline" className="text-[10px] font-mono">
                          [{t.tag}]
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {t.count}
                      </TableCell>
                      <TableCell>
                        <AccountCombobox
                          accounts={accounts || []}
                          value={quickMapAccount[t.tag] || ""}
                          onValueChange={(v) =>
                            setQuickMapAccount((prev) => ({ ...prev, [t.tag]: v }))
                          }
                          placeholder="Selecione..."
                          triggerClassName="h-7 text-[10px] w-full"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          disabled={!quickMapAccount[t.tag] || addAliasMutation.isPending}
                          onClick={() => {
                            if (!quickMapAccount[t.tag]) return;
                            addAliasMutation.mutate({
                              accountId: quickMapAccount[t.tag],
                              alias: t.tag,
                            });
                            setQuickMapAccount((prev) => {
                              const next = { ...prev };
                              delete next[t.tag];
                              return next;
                            });
                          }}
                        >
                          <Save className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {filteredUnmatched.length > 30 && (
              <p className="text-xs text-muted-foreground text-center">
                Mostrando 30 de {filteredUnmatched.length} tags
              </p>
            )}
          </div>
        )}

        {loadingMappings && (
          <p className="text-sm text-muted-foreground text-center py-4">Carregando mapeamentos...</p>
        )}

        {!loadingMappings && (!mappings || mappings.length === 0) && unmatchedTags.length === 0 && (
          <div className="text-center py-6 text-muted-foreground">
            <Link2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum mapeamento configurado ainda.</p>
            <p className="text-xs mt-1">Use o formulário acima para vincular tags UTM às contas.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
