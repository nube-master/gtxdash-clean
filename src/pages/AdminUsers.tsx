import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOperation } from "@/contexts/OperationContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Shield, Eye, BarChart3, Pencil, Crown, Mail, Clock, Users, UserPlus, X, Settings, AlertTriangle, FileText, Lock } from "lucide-react";
import { usePlanLimits } from "@/hooks/usePlanLimits";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Member {
  id: string;
  user_id: string;
  role: string;
  status: string;
  joined_at: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  allowed_pages: string[] | null;
}

interface Invite {
  id: string;
  email: string;
  role: string;
  token: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
}

const ROLE_META: Record<string, { label: string; icon: typeof Shield; color: string; description: string }> = {
  owner: { label: "Proprietário", icon: Crown, color: "text-yellow-500", description: "Acesso total. Dono da operação." },
  admin: { label: "Admin", icon: Shield, color: "text-primary", description: "Acesso total ao sistema." },
  gestor: { label: "Gestor", icon: BarChart3, color: "text-blue-400", description: "Dashboard, Campanhas, Analytics, Vendas, VSLs, Criativos." },
  operador: { label: "Operador", icon: Settings, color: "text-amber-400", description: "Dashboard, Campanhas — sem alterar configurações." },
  visualizador: { label: "Visualizador", icon: Eye, color: "text-muted-foreground", description: "Apenas Dashboard em modo leitura." },
  member: { label: "Membro", icon: Users, color: "text-muted-foreground", description: "Acesso padrão." },
};

const ASSIGNABLE_ROLES = ["admin", "gestor", "operador", "visualizador"];

// Lista completa de abas do sidebar — espelha src/components/AppSidebar.tsx
const ALL_PAGES = [
  // Operação
  { path: "/", label: "Dashboard", feature: "dashboard" as const },
  { path: "/analytics", label: "Analytics", feature: "analytics" as const },
  { path: "/campaigns", label: "Campanhas", feature: "campaigns" as const },
  { path: "/media-channels", label: "Canais de Mídia", feature: "campaigns" as const },
  { path: "/gtx-meta-ia", label: "Meta IA", feature: "meta_ia" as const },
  // Conteúdo
  { path: "/creatives", label: "Criativos", feature: "creatives" as const },
  { path: "/vsls", label: "VSLs", feature: "vsls" as const },
  { path: "/ao-vivo", label: "Ao Vivo", feature: "ao_vivo" as const },
  { path: "/offers", label: "Offers", feature: "creatives" as const },
  { path: "/spy", label: "Spy", feature: "creatives" as const },
  // Financeiro
  { path: "/vendas", label: "Vendas", feature: "vendas" as const },
  { path: "/unit-economics", label: "Central Financeira", feature: "central_financeira" as const },
  { path: "/dashboard/cod", label: "Dashboard COD", feature: "central_financeira" as const },
  { path: "/planning", label: "Planejamento", feature: "planning" as const },
  { path: "/cashflow", label: "Fluxo de Caixa", feature: "cashflow" as const },
  { path: "/financial/reconciliation", label: "Reconciliação", feature: "central_financeira" as const },
  // Infraestrutura
  { path: "/assets", label: "Contingência", feature: "contingencia" as const },
  { path: "/academy", label: "Academy", feature: "academy" as const },
  { path: "/talent-bank", label: "Banco de Talentos", feature: "talent_bank" as const },
  // Sistema
  { path: "/war-room", label: "War Room", feature: "war_room" as const },
  { path: "/jarvis", label: "Jarvis IA", feature: "jarvis" as const },
  { path: "/integrations", label: "Integrações", feature: "integrations" as const },
  { path: "/admin/users", label: "Gerenciar Acessos", feature: "acessos" as const },
];

export default function AdminUsers() {
  const { session, user } = useAuth();
  const { operation, operationId, userRole } = useOperation();
  const { toast } = useToast();
  const { data: planLimits } = usePlanLimits();

  // Mostra TODAS as abas do sidebar para concessão de acesso, independente de
  // enabled_features da operação — o admin precisa enxergar tudo que existe.
  const enabledPages = useMemo(() => ALL_PAGES, []);

  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);

  // Invite modal
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteRole, setInviteRole] = useState("gestor");
  const [invitePages, setInvitePages] = useState<string[]>([]);
  const [inviting, setInviting] = useState(false);
  const [inviteMode, setInviteMode] = useState<"password" | "invite">("password");

  // Edit role modal
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editPages, setEditPages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const canManage = userRole === "owner" || userRole === "admin" || userRole === "super_admin";

  const invoke = useCallback(async (body: Record<string, unknown>) => {
    if (!operationId || !session?.access_token) return null;
    const res = await supabase.functions.invoke("operation-invite", {
      body: { ...body, operation_id: operationId },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.error) throw new Error(res.error.message);
    if (res.data?.error) throw new Error(res.data.error);
    return res.data;
  }, [operationId, session?.access_token]);

  const fetchMembers = useCallback(async () => {
    if (!operationId) return;
    setLoading(true);
    try {
      const data = await invoke({ action: "list" });
      if (data) {
        setMembers(data.members || []);
        setInvites(data.invites || []);
      }
    } catch (e: any) {
      toast({ title: "Erro ao carregar membros", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [operationId, invoke, toast]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    try {
      const pagesPayload = inviteRole === "admin" ? null : invitePages;
      if (inviteMode === "password") {
        const data = await invoke({ action: "create_member", email: inviteEmail, password: invitePassword, role: inviteRole, allowed_pages: pagesPayload });
        toast({ title: "Usuário criado!", description: `${inviteEmail} foi criado e adicionado à operação.` });
      } else {
        const data = await invoke({ action: "invite", email: inviteEmail, role: inviteRole, allowed_pages: pagesPayload });
        if (data?.added_directly) {
          toast({ title: "Membro adicionado!", description: `${inviteEmail} já tinha conta e foi adicionado diretamente.` });
        } else {
          toast({ title: "Convite enviado!", description: `E-mail de convite enviado para ${inviteEmail}` });
        }
      }
      setInviteEmail("");
      setInvitePassword("");
      setInviteRole("gestor");
      setInvitePages(ALL_PAGES.map(p => p.path));
      setInviteMode("password");
      setShowInviteModal(false);
      fetchMembers();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = async (member: Member) => {
    if (!confirm(`Remover ${member.display_name || member.email} da operação?`)) return;
    try {
      await invoke({ action: "remove", member_id: member.id });
      toast({ title: "Membro removido" });
      fetchMembers();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const handleCancelInvite = async (invite: Invite) => {
    try {
      await invoke({ action: "cancel_invite", invite_id: invite.id });
      toast({ title: "Convite cancelado" });
      fetchMembers();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const handleUpdateRole = async () => {
    if (!editingMember) return;
    setSaving(true);
    try {
      const pagesPayload = editRole === "admin" ? null : editPages;
      await invoke({ action: "update_role", member_id: editingMember.id, new_role: editRole, allowed_pages: pagesPayload });
      toast({ title: "Permissões atualizadas!" });
      setEditingMember(null);
      fetchMembers();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openEditRole = (m: Member) => {
    setEditingMember(m);
    setEditRole(m.role);
    setEditPages(m.allowed_pages || ALL_PAGES.map(p => p.path));
  };

  const togglePage = (pages: string[], setPages: (p: string[]) => void, path: string) => {
    if (pages.includes(path)) {
      setPages(pages.filter(p => p !== path));
    } else {
      setPages([...pages, path]);
    }
  };




  const formatLastAccess = (dateStr: string | null) => {
    if (!dateStr) return "—";
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ptBR });
    } catch {
      return "—";
    }
  };

  if (!canManage) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-2">
        <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Apenas o proprietário ou administrador pode gerenciar acessos.</p>
      </div>
    );
  }

  const PageCheckboxList = ({ pages, setPages, disabled }: { pages: string[]; setPages: (p: string[]) => void; disabled?: boolean }) => {
    const toggleAll = () => {
      if (pages.length === enabledPages.length) {
        setPages([]);
      } else {
        setPages(enabledPages.map(p => p.path));
      }
    };
    return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
          <FileText className="h-3 w-3" />
          Abas permitidas
        </label>
        <button
          type="button"
          onClick={toggleAll}
          className="text-[10px] text-primary hover:underline"
          disabled={disabled}
        >
          {pages.length === enabledPages.length ? "Desmarcar todas" : "Selecionar todas"}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1.5 rounded-md bg-secondary/30 border border-border p-2.5">
        {enabledPages.map((page) => (
          <label
            key={page.path}
            className={`flex items-center gap-2 text-[11px] py-1 px-1.5 rounded hover:bg-secondary/50 cursor-pointer transition-colors ${disabled ? "opacity-50 pointer-events-none" : ""}`}
          >
            <Checkbox
              checked={pages.includes(page.path)}
              onCheckedChange={() => togglePage(pages, setPages, page.path)}
              disabled={disabled}
              className="h-3.5 w-3.5"
            />
            <span className="text-foreground">{page.label}</span>
          </label>
        ))}
      </div>
      <p className="text-[9px] text-muted-foreground">
        {pages.length} de {enabledPages.length} abas selecionadas
      </p>
    </div>
    );
  };

  return (
    <div className="space-y-6 full-width-page w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Gerenciar Acessos</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {operation?.name || "Operação"} — Gerencie os membros e convites da equipe
          </p>
        </div>
        <Button
          size="sm"
          className="gap-1.5 h-8"
          onClick={() => {
            if (planLimits && !planLimits.canAddMember) {
              toast({ title: "Limite atingido", description: `Seu plano permite até ${planLimits.maxMembers} membros. Faça upgrade para adicionar mais.`, variant: "destructive" });
              return;
            }
            setInvitePages(enabledPages.map(p => p.path));
            setShowInviteModal(true);
          }}
        >
          {planLimits && !planLimits.canAddMember ? <Lock className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
          Novo Acesso
          {planLimits?.maxMembers != null && (
            <Badge variant="outline" className="ml-1 text-[9px]">{planLimits.currentMembers}/{planLimits.maxMembers}</Badge>
          )}
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-secondary/30 border-border">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Membros Ativos</p>
            <p className="text-lg font-bold text-foreground">{members.filter(m => m.status === "active").length}</p>
          </CardContent>
        </Card>
        <Card className="bg-secondary/30 border-border">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Convites Pendentes</p>
            <p className="text-lg font-bold text-foreground">{invites.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Active Members */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Membros ({members.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : members.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">Nenhum membro encontrado.</p>
          ) : (
            <div className="space-y-2">
              {members.map((m) => {
                const meta = ROLE_META[m.role] || ROLE_META.member;
                const RoleIcon = meta.icon;
                const isOwner = m.role === "owner";
                const isMe = m.user_id === user?.id;
                const pageCount = m.allowed_pages ? m.allowed_pages.length : ALL_PAGES.length;
                const isFullAccess = !m.allowed_pages || m.role === "owner" || m.role === "admin";

                return (
                  <div key={m.id} className="rounded-md bg-secondary/30 border border-border">
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <div className="flex items-center gap-3">
                        <RoleIcon className={`h-4 w-4 ${meta.color}`} />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-medium text-foreground">
                              {m.display_name || m.email}
                            </p>
                            {isMe && (
                              <span className="text-[9px] font-bold uppercase tracking-wider bg-primary/15 text-primary px-1.5 py-0.5 rounded">Você</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-[10px] text-muted-foreground">{m.email}</p>
                            <span className="text-[9px] text-muted-foreground/60">•</span>
                            <span className={`text-[10px] font-medium ${meta.color}`}>{meta.label}</span>
                            <span className="text-[9px] text-muted-foreground/60">•</span>
                            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Clock className="h-2.5 w-2.5" />
                              {formatLastAccess(m.joined_at)}
                            </p>
                            <span className="text-[9px] text-muted-foreground/60">•</span>
                            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <FileText className="h-2.5 w-2.5" />
                              {isFullAccess ? "Todas as abas" : `${pageCount}/${ALL_PAGES.length} abas`}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-[9px] ${meta.color}`}>{meta.label}</Badge>
                        {!isOwner && !isMe && canManage && (
                          <>
                            <button
                              onClick={() => openEditRole(m)}
                              className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                              title="Editar permissões"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleRemoveMember(m)}
                              className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              title="Remover"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Invites */}
      {invites.length > 0 && (
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Mail className="h-3.5 w-3.5" />
              Convites Pendentes ({invites.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {invites.map((inv) => {
                const expired = new Date(inv.expires_at) < new Date();
                return (
                  <div key={inv.id} className="rounded-md bg-secondary/30 border border-border flex items-center justify-between px-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs font-medium text-foreground">{inv.email}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">
                            Papel: {ROLE_META[inv.role]?.label || inv.role}
                          </span>
                          <span className="text-[9px] text-muted-foreground/60">•</span>
                          {expired ? (
                            <span className="text-[10px] text-destructive">Expirado</span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">
                              Expira {formatLastAccess(inv.expires_at)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleCancelInvite(inv)}
                      className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="Cancelar convite"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invite Modal */}
      <Dialog open={showInviteModal} onOpenChange={setShowInviteModal}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">Novo Membro</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {inviteMode === "password" 
                ? `Crie um usuário com login e senha para a operação ${operation?.name}.`
                : `O usuário receberá um e-mail de convite para acessar a operação ${operation?.name}.`
              }
            </DialogDescription>
          </DialogHeader>

          {/* Mode toggle */}
          <div className="flex gap-1 p-0.5 rounded-md bg-secondary/40 border border-border">
            <button
              type="button"
              onClick={() => setInviteMode("password")}
              className={`flex-1 text-[11px] font-medium py-1.5 px-3 rounded transition-colors flex items-center justify-center gap-1.5 ${
                inviteMode === "password" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Lock className="h-3 w-3" />
              Criar com Senha
            </button>
            <button
              type="button"
              onClick={() => setInviteMode("invite")}
              className={`flex-1 text-[11px] font-medium py-1.5 px-3 rounded transition-colors flex items-center justify-center gap-1.5 ${
                inviteMode === "invite" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Mail className="h-3 w-3" />
              Enviar Convite
            </button>
          </div>

          <form onSubmit={handleInvite} className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">E-mail</label>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="email@exemplo.com"
                required
                className="h-9 text-xs"
              />
            </div>

            {inviteMode === "password" && (
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Senha</label>
                <Input
                  type="password"
                  value={invitePassword}
                  onChange={(e) => setInvitePassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  required
                  minLength={6}
                  className="h-9 text-xs"
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Papel</label>
              <Select value={inviteRole} onValueChange={(v) => { setInviteRole(v); if (v === "admin") setInvitePages(ALL_PAGES.map(p => p.path)); }}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_ROLES.map((role) => {
                    const meta = ROLE_META[role];
                    if (!meta) return null;
                    const RIcon = meta.icon;
                    return (
                      <SelectItem key={role} value={role} className="text-xs">
                        <span className="flex items-center gap-2">
                          <RIcon className={`h-3 w-3 ${meta.color}`} />
                          {meta.label}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {ROLE_META[inviteRole] && (
                <p className="text-[10px] text-muted-foreground mt-1">{ROLE_META[inviteRole].description}</p>
              )}
            </div>

            {inviteRole !== "admin" && (
              <PageCheckboxList pages={invitePages} setPages={setInvitePages} />
            )}
            {inviteRole === "admin" && (
              <p className="text-[10px] text-muted-foreground bg-secondary/30 rounded px-3 py-2 border border-border">
                Administradores têm acesso total a todas as abas.
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowInviteModal(false)}>Cancelar</Button>
              <Button 
                type="submit" 
                size="sm" 
                disabled={inviting || (inviteRole !== "admin" && invitePages.length === 0) || (inviteMode === "password" && invitePassword.length < 6)} 
                className="gap-1.5"
              >
                {inviting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : inviteMode === "password" ? <UserPlus className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
                {inviteMode === "password" ? "Criar Usuário" : "Enviar Convite"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Role & Permissions Modal */}
      <Dialog open={!!editingMember} onOpenChange={(open) => !open && setEditingMember(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">Editar Permissões</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {editingMember?.display_name || editingMember?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Papel</label>
              <Select value={editRole} onValueChange={(v) => { setEditRole(v); if (v === "admin") setEditPages(ALL_PAGES.map(p => p.path)); }}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_ROLES.map((role) => {
                    const meta = ROLE_META[role];
                    if (!meta) return null;
                    const RIcon = meta.icon;
                    return (
                      <SelectItem key={role} value={role} className="text-xs">
                        <span className="flex items-center gap-2">
                          <RIcon className={`h-3 w-3 ${meta.color}`} />
                          {meta.label}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {ROLE_META[editRole] && (
                <div className="rounded-md bg-secondary/30 border border-border px-3 py-2">
                  <p className="text-[10px] text-muted-foreground">{ROLE_META[editRole].description}</p>
                </div>
              )}
            </div>

            {/* Page permissions */}
            {editRole !== "admin" && (
              <PageCheckboxList pages={editPages} setPages={setEditPages} />
            )}
            {editRole === "admin" && (
              <p className="text-[10px] text-muted-foreground bg-secondary/30 rounded px-3 py-2 border border-border">
                Administradores têm acesso total a todas as abas.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditingMember(null)}>Cancelar</Button>
            <Button size="sm" onClick={handleUpdateRole} disabled={saving || (editRole !== "admin" && editPages.length === 0)} className="gap-1.5">
              {saving && <Loader2 className="h-3 w-3 animate-spin" />}
              Salvar Permissões
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
