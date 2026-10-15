import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccountTimelinePanel } from "@/components/super-admin/AccountTimelinePanel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw, ShieldCheck, ShieldAlert, CheckCircle2, XCircle, Search } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AdAccount {
  account_id: string;
  name: string;
  account_status: number | null;
  tasks: string[];
}

interface TokenAudit {
  token_index: number;
  profile_key: string;
  source: string;
  token_preview: string;
  system_user: {
    id: string | null;
    name: string | null;
    type: string | null;
    app_id: string | null;
    app_name: string | null;
    is_valid: boolean;
    expires_at: number | null;
    data_access_expires_at: number | null;
  };
  scopes: string[];
  scopes_summary: {
    ads_read: boolean;
    ads_management: boolean;
    business_management: boolean;
    pages_read_engagement: boolean;
  };
  accounts: AdAccount[];
  accounts_count: number;
  error: string | null;
}

interface Coverage {
  token_index: number;
  total_visible: number;
  can_manage: number;
  read_only: number;
  missing_active_accounts: number;
}

interface AuditResponse {
  success: boolean;
  generated_at: string;
  tokens_total: number;
  known_accounts_total: number;
  known_accounts_active: number;
  orphaned_active_accounts: Array<{ account_id: string; account_name: string }>;
  tokens: TokenAudit[];
  coverage: Coverage[];
}

function ScopeBadge({ label, granted }: { label: string; granted: boolean }) {
  return (
    <Badge
      variant={granted ? "default" : "outline"}
      className={granted ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" : "text-muted-foreground"}
    >
      {granted ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
      {label}
    </Badge>
  );
}

function TaskBadge({ task }: { task: string }) {
  const color =
    task === "MANAGE" ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
    : task === "ADVERTISE" ? "bg-sky-500/15 text-sky-500 border-sky-500/30"
    : task === "ANALYZE" ? "bg-amber-500/15 text-amber-500 border-amber-500/30"
    : "bg-muted text-muted-foreground";
  return <Badge variant="outline" className={`text-[10px] ${color}`}>{task}</Badge>;
}

function accountStatusLabel(s: number | null) {
  switch (s) {
    case 1: return { label: "ACTIVE", cls: "text-emerald-500" };
    case 2: return { label: "DISABLED", cls: "text-red-500" };
    case 3: return { label: "UNSETTLED", cls: "text-amber-500" };
    case 7: return { label: "PENDING_RISK", cls: "text-amber-500" };
    case 8: return { label: "PENDING_SETTLEMENT", cls: "text-amber-500" };
    case 9: return { label: "IN_GRACE_PERIOD", cls: "text-amber-500" };
    case 100: return { label: "PENDING_CLOSURE", cls: "text-red-500" };
    case 101: return { label: "CLOSED", cls: "text-red-500" };
    default: return { label: s == null ? "—" : `STATUS_${s}`, cls: "text-muted-foreground" };
  }
}

export default function AuditTokens() {
  const navigate = useNavigate();
  const { data: isSuperAdmin, isLoading: checking } = useSuperAdmin();
  const [selectedTokenIdx, setSelectedTokenIdx] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!checking && isSuperAdmin === false) navigate("/");
  }, [checking, isSuperAdmin, navigate]);

  const { data, isFetching, refetch, error } = useQuery<AuditResponse>({
    queryKey: ["audit-meta-tokens"],
    enabled: isSuperAdmin === true,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("audit-meta-tokens");
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as AuditResponse;
    },
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (data?.tokens?.length && selectedTokenIdx == null) {
      setSelectedTokenIdx(data.tokens[0].token_index);
    }
  }, [data, selectedTokenIdx]);

  if (checking || isSuperAdmin === undefined) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="animate-spin h-6 w-6 text-muted-foreground" /></div>;
  }
  if (!isSuperAdmin) return null;

  const selected = data?.tokens.find((t) => t.token_index === selectedTokenIdx) ?? null;
  const coverage = data?.coverage.find((c) => c.token_index === selectedTokenIdx) ?? null;

  const filteredAccounts = (selected?.accounts ?? []).filter((a) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return a.name.toLowerCase().includes(q) || a.account_id.includes(q);
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Auditoria de Tokens Meta</h1>
          <p className="text-sm text-muted-foreground">
            System users, escopos concedidos e acesso a ad accounts, por token.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data?.generated_at && (
            <span className="text-xs text-muted-foreground">
              atualizado {formatDistanceToNow(new Date(data.generated_at), { locale: ptBR, addSuffix: true })}
            </span>
          )}
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-red-500/40">
          <CardContent className="p-4 text-sm text-red-500">
            Erro: {(error as Error).message}
          </CardContent>
        </Card>
      )}

      {isFetching && !data && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Consultando Meta Graph API…
        </div>
      )}

      {data && (
        <>
          {/* Summary strip */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase">Tokens</p>
                <p className="text-2xl font-semibold">{data.tokens_total}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase">Ativas no sistema</p>
                <p className="text-2xl font-semibold">{data.known_accounts_active}</p>
                <p className="text-[10px] text-muted-foreground">de {data.known_accounts_total} históricas</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase">Tokens válidos</p>
                <p className="text-2xl font-semibold">
                  {data.tokens.filter((t) => t.system_user.is_valid).length}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase">Cobertura (visíveis únicas)</p>
                <p className="text-2xl font-semibold">
                  {new Set(data.tokens.flatMap((t) => t.accounts.map((a) => a.account_id))).size}
                </p>
              </CardContent>
            </Card>
            <Card className={data.orphaned_active_accounts.length > 0 ? "border-red-500/40" : ""}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase">Órfãs (nenhum token vê)</p>
                <p className={`text-2xl font-semibold ${data.orphaned_active_accounts.length > 0 ? "text-red-500" : "text-emerald-500"}`}>
                  {data.orphaned_active_accounts.length}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Orphaned accounts callout */}
          {data.orphaned_active_accounts.length > 0 && (
            <Card className="border-red-500/40">
              <CardHeader>
                <CardTitle className="text-base text-red-500 flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4" />
                  Ad accounts ativas fora do inventário de todos os tokens
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">
                  Reatribuir no Business Manager → Configurações → Usuários do sistema → Adicionar ativos.
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.orphaned_active_accounts.map((a) => (
                      <TableRow key={a.account_id}>
                        <TableCell>{a.account_name}</TableCell>
                        <TableCell className="font-mono text-xs">act_{a.account_id}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <AccountTimelinePanel />

          {/* Token list */}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tokens cadastrados</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>System User</TableHead>
                    <TableHead>App</TableHead>
                    <TableHead>Perfil</TableHead>
                    <TableHead>Fonte</TableHead>
                    <TableHead>Escopos-chave</TableHead>
                    <TableHead className="text-right">Contas visíveis</TableHead>
                    <TableHead className="text-right">Manage</TableHead>
                    <TableHead className="text-right">Faltando</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.tokens.map((t) => {
                    const cov = data.coverage.find((c) => c.token_index === t.token_index);
                    const isSelected = t.token_index === selectedTokenIdx;
                    return (
                      <TableRow
                        key={t.token_index}
                        onClick={() => setSelectedTokenIdx(t.token_index)}
                        className={`cursor-pointer ${isSelected ? "bg-muted/60" : ""}`}
                      >
                        <TableCell className="font-mono text-xs">{t.token_index}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{t.system_user.name ?? "—"}</span>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {t.system_user.id ?? "?"} · {t.system_user.type ?? "?"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {t.system_user.app_name ?? "—"}
                          {t.system_user.app_id && (
                            <div className="text-[10px] text-muted-foreground font-mono">{t.system_user.app_id}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{t.profile_key}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{t.source}</Badge></TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <ScopeBadge label="ads_read" granted={t.scopes_summary.ads_read} />
                            <ScopeBadge label="ads_management" granted={t.scopes_summary.ads_management} />
                            <ScopeBadge label="business_management" granted={t.scopes_summary.business_management} />
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono">{cov?.total_visible ?? t.accounts_count}</TableCell>
                        <TableCell className="text-right font-mono text-emerald-500">{cov?.can_manage ?? 0}</TableCell>
                        <TableCell className={`text-right font-mono ${(cov?.missing_active_accounts ?? 0) > 0 ? "text-red-500" : ""}`}>
                          {cov?.missing_active_accounts ?? 0}
                        </TableCell>
                        <TableCell>
                          {t.system_user.is_valid ? (
                            <span className="inline-flex items-center gap-1 text-emerald-500 text-xs">
                              <ShieldCheck className="h-3 w-3" /> válido
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-500 text-xs">
                              <ShieldAlert className="h-3 w-3" /> inválido
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Detail panel */}
          {selected && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    Detalhe · Token #{selected.token_index} — {selected.system_user.name ?? "sem nome"}
                  </CardTitle>
                  <span className="text-xs text-muted-foreground font-mono">{selected.token_preview}</span>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="accounts">
                  <TabsList>
                    <TabsTrigger value="accounts">
                      Ad accounts ({selected.accounts_count})
                    </TabsTrigger>
                    <TabsTrigger value="scopes">Todos os escopos ({selected.scopes.length})</TabsTrigger>
                    <TabsTrigger value="raw">System user</TabsTrigger>
                  </TabsList>

                  <TabsContent value="accounts" className="mt-4 space-y-3">
                    {selected.error && (
                      <div className="text-sm text-red-500 border border-red-500/30 rounded p-2 bg-red-500/5">
                        Erro da Graph API: {selected.error}
                      </div>
                    )}
                    <div className="relative max-w-sm">
                      <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        className="pl-7 h-9"
                        placeholder="Buscar por nome ou ID…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                    {coverage && (
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>Total visíveis: <strong className="text-foreground">{coverage.total_visible}</strong></span>
                        <span>Com MANAGE: <strong className="text-emerald-500">{coverage.can_manage}</strong></span>
                        <span>Somente leitura: <strong className="text-amber-500">{coverage.read_only}</strong></span>
                        <span>Contas ativas fora do token: <strong className={coverage.missing_active_accounts > 0 ? "text-red-500" : "text-foreground"}>{coverage.missing_active_accounts}</strong></span>
                      </div>
                    )}
                    <div className="border rounded max-h-[500px] overflow-auto">
                      <Table>
                        <TableHeader className="sticky top-0 bg-background">
                          <TableRow>
                            <TableHead>Account</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Tasks concedidas</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredAccounts.map((a) => {
                            const st = accountStatusLabel(a.account_status);
                            return (
                              <TableRow key={a.account_id}>
                                <TableCell>
                                  <div className="flex flex-col">
                                    <span>{a.name}</span>
                                    <span className="text-[10px] text-muted-foreground font-mono">act_{a.account_id}</span>
                                  </div>
                                </TableCell>
                                <TableCell className={`text-xs ${st.cls}`}>{st.label}</TableCell>
                                <TableCell>
                                  {a.tasks.length === 0 ? (
                                    <span className="text-xs text-muted-foreground">— (só visibilidade)</span>
                                  ) : (
                                    <div className="flex flex-wrap gap-1">
                                      {a.tasks.map((t) => <TaskBadge key={t} task={t} />)}
                                    </div>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                          {filteredAccounts.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-6">
                                Nenhuma ad account visível para este token{search ? " com esse filtro" : ""}.
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>

                  <TabsContent value="scopes" className="mt-4">
                    {selected.scopes.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhum escopo retornado pelo Meta.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {selected.scopes.map((s) => {
                          const critical = ["ads_read", "ads_management", "business_management"].includes(s);
                          return (
                            <Badge
                              key={s}
                              variant="outline"
                              className={critical ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" : ""}
                            >
                              {s}
                            </Badge>
                          );
                        })}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="raw" className="mt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div><span className="text-muted-foreground">Nome:</span> {selected.system_user.name ?? "—"}</div>
                      <div><span className="text-muted-foreground">User ID:</span> <span className="font-mono">{selected.system_user.id ?? "—"}</span></div>
                      <div><span className="text-muted-foreground">Tipo:</span> {selected.system_user.type ?? "—"}</div>
                      <div><span className="text-muted-foreground">App:</span> {selected.system_user.app_name ?? "—"} <span className="font-mono text-xs text-muted-foreground">{selected.system_user.app_id ?? ""}</span></div>
                      <div>
                        <span className="text-muted-foreground">Expira em:</span>{" "}
                        {selected.system_user.expires_at
                          ? (selected.system_user.expires_at === 0 ? "nunca" : new Date(selected.system_user.expires_at * 1000).toLocaleString("pt-BR"))
                          : "—"}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Data-access expira em:</span>{" "}
                        {selected.system_user.data_access_expires_at
                          ? new Date(selected.system_user.data_access_expires_at * 1000).toLocaleString("pt-BR")
                          : "—"}
                      </div>
                      <div><span className="text-muted-foreground">Perfil:</span> {selected.profile_key}</div>
                      <div><span className="text-muted-foreground">Fonte:</span> {selected.source}</div>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
