import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Building2, Users, ShieldCheck, Eye, Pause, Play, Pencil, Plus, X, ToggleLeft, ToggleRight, Upload, Trash2, Search, Archive, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { MetaTokenRotateCard } from "@/components/super-admin/MetaTokenRotateCard";
import { RedTrackAuditDialog } from "@/components/audit/RedTrackAuditDialog";
import { ALL_FEATURES, DEFAULT_FEATURES, type OperationFeature } from "@/contexts/OperationContext";
import { PLAN_CONFIGS, getPlanConfig, formatLimit } from "@/lib/planConfig";

// ── Fetch all operations with owner email ──
function useOperations(
  statusFilter: string,
  planFilter: string,
  showArchived: boolean,
  showDeleted: boolean,
) {
  return useQuery({
    queryKey: ["super-admin-operations", statusFilter, planFilter, showArchived, showDeleted],
    queryFn: async () => {
      let query = supabase.from("operations").select("*");
      if (statusFilter && statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      } else {
        const visible = ["active", "trial", "suspended"];
        if (showArchived) visible.push("archived");
        if (showDeleted) visible.push("deleted");
        query = query.in("status", visible);
      }
      if (planFilter && planFilter !== "all") query = query.eq("plan", planFilter);
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;

      // Get owner emails
      const ownerIds = [...new Set((data || []).map((o: any) => o.owner_user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, email, display_name")
        .in("user_id", ownerIds);

      const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
      return (data || []).map((op: any) => ({
        ...op,
        owner_email: profileMap.get(op.owner_user_id)?.email || "—",
        owner_name: profileMap.get(op.owner_user_id)?.display_name || "",
      }));
    },
    staleTime: 30_000,
  });
}

function useGlobalMetrics() {
  return useQuery({
    queryKey: ["super-admin-metrics"],
    queryFn: async () => {
      const [opsRes, membersRes] = await Promise.all([
        supabase.from("operations").select("status"),
        supabase.from("operation_members").select("user_id"),
      ]);
      const ops = opsRes.data || [];
      const active = ops.filter((o: any) => o.status === "active").length;
      const trial = ops.filter((o: any) => o.status === "trial").length;
      const uniqueUsers = new Set((membersRes.data || []).map((m: any) => m.user_id)).size;
      return { active, trial, totalUsers: uniqueUsers };
    },
    staleTime: 30_000,
  });
}

export default function SuperAdmin() {
  const navigate = useNavigate();
  const { data: isSuperAdmin, isLoading: checkingAccess } = useSuperAdmin();
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [editOp, setEditOp] = useState<any>(null);
  const [deleteOp, setDeleteOp] = useState<any>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [editForm, setEditForm] = useState({ name: "", slug: "", plan: "", ownerEmail: "", logoUrl: "" });
  const [uploading, setUploading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newOp, setNewOp] = useState({ name: "", slug: "", plan: "enterprise", maxMetaAccounts: null as number | null, maxMembers: null as number | null });
  const [newOpFeatures, setNewOpFeatures] = useState<OperationFeature[]>([...getPlanConfig("enterprise").defaultFeatures]);

  const handlePlanChange = (plan: string) => {
    const config = getPlanConfig(plan);
    setNewOp(p => ({ ...p, plan, maxMetaAccounts: config.maxMetaAccounts, maxMembers: config.maxMembers }));
    setNewOpFeatures([...config.defaultFeatures]);
  };
  const queryClient = useQueryClient();

  const { data: operations, isLoading: loadingOps } = useOperations(statusFilter, planFilter, showArchived, showDeleted);
  const { data: metrics } = useGlobalMetrics();

  useEffect(() => {
    if (!checkingAccess && isSuperAdmin === false) {
      toast.error("Acesso negado.");
      navigate("/", { replace: true });
    }
  }, [checkingAccess, isSuperAdmin, navigate]);

  // Transição de estado (active / suspended / archived / deleted) + auditoria
  const changeStatus = useMutation({
    mutationFn: async ({ op, next }: { op: any; next: "active" | "suspended" | "archived" | "deleted" }) => {
      const patch: Record<string, any> = { status: next };
      if (next === "suspended") patch.suspended_at = new Date().toISOString();
      if (next === "archived") patch.archived_at = new Date().toISOString();
      if (next === "deleted") patch.deleted_at = new Date().toISOString();
      if (next === "active") {
        patch.suspended_at = null;
        patch.archived_at = null;
        patch.deleted_at = null;
      }
      const { error } = await supabase.from("operations").update(patch).eq("id", op.id);
      if (error) throw error;

      const { data: auth } = await supabase.auth.getUser();
      await supabase.from("operation_audit").insert({
        operation_id: op.id,
        action: next,
        performed_by: auth?.user?.email || auth?.user?.id || "desconhecido",
        note: `${op.status || "—"} → ${next}`,
      } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-operations"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin-metrics"] });
      setDeleteOp(null);
      setDeleteConfirmText("");
      toast.success("Estado da operação atualizado.");
    },
    onError: (err: any) => toast.error(err.message || "Erro ao atualizar estado."),
  });

  const updateOperation = useMutation({
    mutationFn: async ({ id, data, newOwnerEmail }: { id: string; data: Record<string, any>; newOwnerEmail?: string }) => {
      // If owner email changed, resolve the new user_id
      if (newOwnerEmail) {
        const { data: profile, error: profileErr } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("email", newOwnerEmail)
          .maybeSingle();
        if (profileErr) throw profileErr;
        if (profile) {
          data.owner_user_id = profile.user_id;
        } else {
          // Fallback: search in auth.users via admin edge function
          const { data: authData, error: authErr } = await supabase.functions.invoke("admin-list-users");
          if (authErr) throw authErr;
          const authUsers = authData as any[];
          const matched = authUsers?.find((u: any) => u.email?.toLowerCase() === newOwnerEmail.toLowerCase());
          if (!matched) throw new Error(`Usuário com email "${newOwnerEmail}" não encontrado. Verifique se o usuário já possui conta no sistema.`);
          data.owner_user_id = matched.id;
        }
      }
      const { error } = await supabase.from("operations").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-operations"] });
      setEditOp(null);
      toast.success("Operação atualizada.");
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao atualizar.");
    },
  });

  const createOperation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("operations").insert({
        name: newOp.name,
        slug: newOp.slug,
        plan: newOp.plan,
        owner_user_id: user.id,
        enabled_features: newOpFeatures,
        max_meta_accounts: newOp.maxMetaAccounts,
        max_members: newOp.maxMembers,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-operations"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin-metrics"] });
      setCreateOpen(false);
      setNewOp({ name: "", slug: "", plan: "enterprise", maxMetaAccounts: null, maxMembers: null });
      setNewOpFeatures([...getPlanConfig("enterprise").defaultFeatures]);
      toast.success("Operação criada.");
    },
  });

  const toggleFeature = useMutation({
    mutationFn: async ({ id, features, feature }: { id: string; features: string[]; feature: string }) => {
      const current = features || [...DEFAULT_FEATURES];
      const next = current.includes(feature)
        ? current.filter((f: string) => f !== feature)
        : [...current, feature];
      const { error } = await supabase.from("operations").update({ enabled_features: next } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-operations"] });
      toast.success("Feature atualizada.");
    },
  });


  const handleImpersonate = (op: any) => {
    localStorage.setItem("sa_impersonate", JSON.stringify({ id: op.id, name: op.name }));
    toast.success(`Visualizando: ${op.name}`);
    navigate("/");
    // Force page reload to apply impersonation context
    window.location.reload();
  };

  if (checkingAccess || (isSuperAdmin === undefined)) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isSuperAdmin) return null;

  return (
    <div className="space-y-6 full-width-page w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Super Admin</h1>
          <p className="text-sm text-muted-foreground">Gerenciamento global de operações</p>
        </div>
        <div className="flex items-center gap-2">
          <RedTrackAuditDialog />
          <Button onClick={() => setCreateOpen(true)} size="sm" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Nova Operação
          </Button>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Operações Ativas</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.active ?? "—"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Operações em Trial</CardTitle>
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.trial ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Usuários</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.totalUsers ?? "—"}</div>
          </CardContent>
        </Card>
      </div>

      {/* Secure secrets rotation */}
      <MetaTokenRotateCard />

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Ativo</SelectItem>
            <SelectItem value="trial">Trial</SelectItem>
            <SelectItem value="suspended">Suspenso</SelectItem>
            <SelectItem value="archived">Arquivado</SelectItem>
            <SelectItem value="deleted">Deletado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={planFilter} onValueChange={setPlanFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Plano" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="enterprise">Enterprise</SelectItem>
            <SelectItem value="pro">Pro</SelectItem>
            <SelectItem value="starter">Starter</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <Checkbox checked={showArchived} onCheckedChange={(c) => setShowArchived(!!c)} />
          Mostrar arquivadas
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <Checkbox checked={showDeleted} onCheckedChange={(c) => setShowDeleted(!!c)} />
          Mostrar deletadas
        </label>
      </div>

      {/* Operations Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto responsive-table-sticky">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="sticky-col text-left px-4 py-3 font-medium text-muted-foreground">Nome</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Slug</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Dono</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Plano</th>
                   <th className="text-left px-4 py-3 font-medium text-muted-foreground">Limites</th>
                   <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                   <th className="text-left px-4 py-3 font-medium text-muted-foreground">Features</th>
                   <th className="text-left px-4 py-3 font-medium text-muted-foreground">Criação</th>
                   <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                 {loadingOps ? (
                   <tr><td colSpan={9} className="text-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></td></tr>
                 ) : (operations || []).length === 0 ? (
                   <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">Nenhuma operação encontrada.</td></tr>
                ) : (
                  (operations || []).map((op: any) => (
                    <tr key={op.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="sticky-col px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          {op.logo_url ? (
                            <img src={op.logo_url} alt={op.name} className="h-7 w-7 rounded-md object-contain bg-background border border-border/50" />
                          ) : (
                            <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                              {op.name?.charAt(0)?.toUpperCase()}
                            </div>
                          )}
                          <span className="font-medium text-foreground">{op.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{op.slug}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{op.owner_email}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-[10px] font-mono uppercase">{op.plan}</Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        <div>{formatLimit(op.max_meta_accounts)} contas</div>
                        <div>{formatLimit(op.max_members)} membros</div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            op.status === "active"
                              ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                              : op.status === "trial"
                              ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                              : op.status === "suspended"
                              ? "bg-amber-600/10 text-amber-600 border-amber-600/30"
                              : op.status === "archived"
                              ? "bg-muted text-muted-foreground border-border"
                              : "bg-destructive/10 text-destructive border-destructive/30"
                          }`}
                        >
                          {op.status === "active"
                            ? "🟢 Ativo"
                            : op.status === "trial"
                            ? "Trial"
                            : op.status === "suspended"
                            ? "🟡 Suspenso"
                            : op.status === "archived"
                            ? "⚫ Arquivado"
                            : "❌ Deletado"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1 max-w-xs">
                         {ALL_FEATURES.map(({ key: feat, label }) => {
                            const features = (op.enabled_features as string[]) || [...DEFAULT_FEATURES];
                            const enabled = features.includes(feat);
                            return (
                              <button
                                key={feat}
                                onClick={() => toggleFeature.mutate({ id: op.id, features, feature: feat })}
                                className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full transition-colors ${
                                  enabled
                                    ? "bg-emerald-500/15 text-emerald-500"
                                    : "bg-muted text-muted-foreground/50"
                                }`}
                                title={`${enabled ? "Desabilitar" : "Habilitar"} ${label}`}
                              >
                                {enabled ? <ToggleRight className="h-3 w-3" /> : <ToggleLeft className="h-3 w-3" />}
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {new Date(op.created_at).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            title="Acessar como"
                            onClick={() => handleImpersonate(op)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {(op.status === "active" || op.status === "trial") && (
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px]" title="Suspender"
                              onClick={() => changeStatus.mutate({ op, next: "suspended" })}>
                              <Pause className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {op.status !== "active" && op.status !== "trial" && op.status !== "deleted" && (
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px]" title="Reativar"
                              onClick={() => changeStatus.mutate({ op, next: "active" })}>
                              <Play className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {op.status !== "archived" && op.status !== "deleted" && (
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px]" title="Arquivar"
                              onClick={() => changeStatus.mutate({ op, next: "archived" })}>
                              <Archive className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {op.status === "deleted" && (
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px]" title="Restaurar"
                              onClick={() => changeStatus.mutate({ op, next: "active" })}>
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            title="Editar operação"
                            onClick={() => {
                              setEditOp(op);
                              setEditForm({ name: op.name, slug: op.slug, plan: op.plan, ownerEmail: op.owner_email || "", logoUrl: op.logo_url || "" });
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {(op.status === "suspended" || op.status === "archived") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                              title="Deletar operação"
                              onClick={() => { setDeleteOp(op); setDeleteConfirmText(""); }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Plan Dialog */}
      <Dialog open={!!editOp} onOpenChange={() => setEditOp(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {editForm.logoUrl ? (
                <img src={editForm.logoUrl} alt="" className="h-8 w-8 rounded-md object-contain border border-border/50" />
              ) : (
                <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                  {editOp?.name?.charAt(0)?.toUpperCase()}
                </div>
              )}
              Editar Operação
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome da Operação</Label>
              <Input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex: GTX Mídia" />
            </div>
            <div>
              <Label>Slug</Label>
              <Input value={editForm.slug} onChange={e => setEditForm(p => ({ ...p, slug: e.target.value }))} placeholder="ex: gtx-midia" className="font-mono text-xs" />
            </div>
            <div>
              <Label>Email do Dono</Label>
              <Input value={editForm.ownerEmail} onChange={e => setEditForm(p => ({ ...p, ownerEmail: e.target.value }))} placeholder="email@exemplo.com" />
              <p className="text-[10px] text-muted-foreground mt-1">Altere para transferir a propriedade da operação.</p>
            </div>
            <div>
              <Label>Logo</Label>
              <div className="flex items-center gap-3 mt-1">
                {editForm.logoUrl ? (
                  <img src={editForm.logoUrl} alt="" className="h-12 w-12 rounded-md object-contain border border-border/50 bg-background" />
                ) : (
                  <div className="h-12 w-12 rounded-md bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground">
                    {editOp?.name?.charAt(0)?.toUpperCase()}
                  </div>
                )}
                <div className="flex flex-col gap-1.5 flex-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-fit gap-1.5"
                    disabled={uploading}
                    onClick={() => document.getElementById("logo-upload-input")?.click()}
                  >
                    {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    {uploading ? "Enviando..." : "Upload"}
                  </Button>
                  <input
                    id="logo-upload-input"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file || !editOp) return;
                      setUploading(true);
                      try {
                        const ext = file.name.split(".").pop() || "png";
                        const path = `${editOp.id}/logo.${ext}`;
                        const { error: upErr } = await supabase.storage.from("operation-logos").upload(path, file, { upsert: true });
                        if (upErr) throw upErr;
                        const { data: urlData } = supabase.storage.from("operation-logos").getPublicUrl(path);
                        const publicUrl = urlData.publicUrl + "?t=" + Date.now();
                        setEditForm(p => ({ ...p, logoUrl: publicUrl }));
                        toast.success("Logo enviado!");
                      } catch (err: any) {
                        toast.error("Erro ao enviar: " + err.message);
                      } finally {
                        setUploading(false);
                        e.target.value = "";
                      }
                    }}
                  />
                  <Input
                    value={editForm.logoUrl}
                    onChange={e => setEditForm(p => ({ ...p, logoUrl: e.target.value }))}
                    placeholder="Ou cole uma URL..."
                    className="text-xs h-8"
                  />
                </div>
              </div>
            </div>
            <div>
              <Label>Plano</Label>
              <Select value={editForm.plan} onValueChange={v => setEditForm(p => ({ ...p, plan: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="starter">Starter</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOp(null)}>Cancelar</Button>
            <Button
              onClick={() => {
                const ownerChanged = editForm.ownerEmail !== editOp.owner_email;
                updateOperation.mutate({
                  id: editOp.id,
                  data: {
                    name: editForm.name,
                    slug: editForm.slug,
                    plan: editForm.plan,
                    logo_url: editForm.logoUrl || null,
                  },
                  newOwnerEmail: ownerChanged ? editForm.ownerEmail : undefined,
                });
              }}
              disabled={updateOperation.isPending || !editForm.name || !editForm.slug}
            >
              {updateOperation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Operation Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Operação</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome</Label>
              <Input value={newOp.name} onChange={e => setNewOp(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Minha Empresa" />
            </div>
            <div>
              <Label>Slug</Label>
              <Input value={newOp.slug} onChange={e => setNewOp(p => ({ ...p, slug: e.target.value }))} placeholder="ex: minha-empresa" />
            </div>
            <div>
              <Label>Plano</Label>
              <Select value={newOp.plan} onValueChange={handlePlanChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.values(PLAN_CONFIGS).map(p => (
                    <SelectItem key={p.key} value={p.key}>
                      {p.label} — <span className="text-muted-foreground">{p.description}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Máx. Contas Meta</Label>
                <Input
                  type="number"
                  value={newOp.maxMetaAccounts ?? ""}
                  onChange={e => setNewOp(p => ({ ...p, maxMetaAccounts: e.target.value ? Number(e.target.value) : null }))}
                  placeholder="Ilimitado"
                />
              </div>
              <div>
                <Label>Máx. Membros</Label>
                <Input
                  type="number"
                  value={newOp.maxMembers ?? ""}
                  onChange={e => setNewOp(p => ({ ...p, maxMembers: e.target.value ? Number(e.target.value) : null }))}
                  placeholder="Ilimitado"
                />
              </div>
            </div>
            <div>
              <Label className="mb-2 block">Módulos Habilitados</Label>
              <div className="grid grid-cols-2 gap-2">
                {ALL_FEATURES.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 text-sm cursor-pointer rounded-md border border-border/50 px-3 py-2 hover:bg-muted/50 transition-colors">
                    <Checkbox
                      checked={newOpFeatures.includes(key)}
                      onCheckedChange={(checked) => {
                        setNewOpFeatures(prev =>
                          checked ? [...prev, key] : prev.filter(f => f !== key)
                        );
                      }}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={() => setNewOpFeatures(ALL_FEATURES.map(f => f.key))}>
                  Selecionar Todos
                </Button>
                <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={() => setNewOpFeatures([])}>
                  Limpar
                </Button>
                <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={() => setNewOpFeatures([...DEFAULT_FEATURES])}>
                  Padrão
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={() => createOperation.mutate()} disabled={createOperation.isPending || !newOp.name || !newOp.slug}>
              {createOperation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteOp} onOpenChange={() => setDeleteOp(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Excluir Operação
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <p className="text-sm text-foreground font-medium">
              Deletar a operação <span className="font-bold underline text-destructive">{deleteOp?.name}</span>?
            </p>
            <p className="text-xs text-muted-foreground bg-muted p-3 rounded-md border border-border/50">
              A operação some de todas as telas, webhooks e tokens param de responder, mas o histórico é preservado e ela pode ser restaurada.
            </p>
            <div>
              <Label className="text-xs">Digite <span className="font-mono">{deleteOp?.slug}</span> para confirmar</Label>
              <Input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={deleteOp?.slug}
                className="font-mono text-xs mt-1"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteOp(null)} disabled={changeStatus.isPending}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => changeStatus.mutate({ op: deleteOp, next: "deleted" })}
              disabled={changeStatus.isPending || deleteConfirmText.trim() !== (deleteOp?.slug || "")}
              className="gap-2"
            >
              {changeStatus.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
