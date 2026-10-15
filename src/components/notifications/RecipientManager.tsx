import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Users, Plus, Pencil, Trash2, Loader2, Link2, Bell, Clock, ChevronDown, ChevronUp, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useOperation } from "@/contexts/OperationContext";

// Pushcut webhooks: https://api.pushcut.io/<token>/notifications/<name>
const recipientSchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório").max(80, "Máx. 80 caracteres"),
  webhook_url: z
    .string()
    .trim()
    .url("URL inválida")
    .max(500, "Máx. 500 caracteres")
    .refine(
      (u) => /^https:\/\/(api\.)?pushcut\.io\//i.test(u),
      "Precisa ser uma URL Pushcut (https://api.pushcut.io/...)",
    ),
});


type Recipient = {
  id: string;
  name: string;
  webhook_url: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type Template = {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
};

type Pref = {
  id: string;
  recipient_id: string;
  template_id: string;
  enabled: boolean;
  schedule: string[];
};

const ALL_HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);

export function RecipientManager() {
  const { operation } = useOperation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Recipient | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const { data: recipients, isLoading } = useQuery({
    queryKey: ["notification-recipients", operation?.id],
    queryFn: async () => {
      let query = supabase
        .from("notification_recipients")
        .select("*")
        .order("created_at", { ascending: true });
      if (operation?.id) query = query.eq("operation_id", operation.id);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Recipient[];
    },
  });

  const { data: templates } = useQuery({
    queryKey: ["notification-templates", operation?.id],
    queryFn: async () => {
      let query = supabase
        .from("notification_templates")
        .select("id, name, type, is_active")
        .order("created_at", { ascending: true });
      if (operation?.id) query = query.or(`operation_id.eq.${operation.id},operation_id.is.null`);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Template[];
    },
  });

  const { data: prefs } = useQuery({
    queryKey: ["recipient-notification-prefs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipient_notification_prefs")
        .select("*");
      if (error) throw error;
      return (data || []).map((p: any) => ({
        ...p,
        schedule: Array.isArray(p.schedule) ? p.schedule : [],
      })) as Pref[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (r: Partial<Recipient> & { id?: string }) => {
      const parsed = recipientSchema.safeParse({
        name: r.name ?? "",
        webhook_url: r.webhook_url ?? "",
      });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      }
      const { name, webhook_url } = parsed.data;
      if (r.id) {
        const { error } = await supabase
          .from("notification_recipients")
          .update({ name, webhook_url, is_active: r.is_active })
          .eq("id", r.id);
        if (error) throw error;
      } else {
        if (!operation?.id) throw new Error("Selecione uma operação antes de criar destinatário");
        const { error } = await supabase
          .from("notification_recipients")
          .insert({ name, webhook_url, is_active: r.is_active ?? true, operation_id: operation.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-recipients"] });
      setEditing(null);
      setIsCreating(false);
      toast.success("Destinatário salvo!");
    },
    onError: (err: Error) => toast.error(err.message),
  });


  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notification_recipients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-recipients"] });
      toast.success("Destinatário removido!");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("notification_recipients").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notification-recipients"] }),
  });

  const togglePref = useMutation({
    mutationFn: async ({ recipient_id, template_id, enabled }: { recipient_id: string; template_id: string; enabled: boolean }) => {
      if (enabled) {
        const { error } = await supabase
          .from("recipient_notification_prefs")
          .upsert({ recipient_id, template_id, enabled: true, operation_id: operation?.id! }, { onConflict: "recipient_id,template_id" });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("recipient_notification_prefs")
          .delete()
          .eq("recipient_id", recipient_id)
          .eq("template_id", template_id);
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recipient-notification-prefs"] }),
    onError: (err: Error) => toast.error(err.message),
  });

  const updatePrefSchedule = useMutation({
    mutationFn: async ({ recipient_id, template_id, schedule }: { recipient_id: string; template_id: string; schedule: string[] }) => {
      const { error } = await supabase
        .from("recipient_notification_prefs")
        .update({ schedule } as any)
        .eq("recipient_id", recipient_id)
        .eq("template_id", template_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipient-notification-prefs"] });
      toast.success("Horários salvos!");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const getEnabledTemplates = (recipientId: string) => {
    return (prefs || []).filter((p) => p.recipient_id === recipientId && p.enabled).map((p) => p.template_id);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">Carregando destinatários...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Destinatários</h2>
          <p className="text-xs text-muted-foreground">Gerencie quem recebe cada tipo de notificação via Pushcut</p>
        </div>
        <Button size="sm" className="gap-1.5 text-xs" onClick={() => {
          setIsCreating(true);
          setEditing({ id: "", name: "", webhook_url: "", is_active: true, created_at: "", updated_at: "" });
        }}>
          <Plus className="h-3.5 w-3.5" />
          Novo Destinatário
        </Button>
      </div>

      <div className="grid gap-3">
        {recipients?.map((r) => {
          const enabledIds = getEnabledTemplates(r.id);
          return (
            <Card key={r.id} className="bg-card/50 border-border/30 hover:border-border/60 transition-colors">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`h-2 w-2 rounded-full flex-shrink-0 ${r.is_active ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{r.name}</span>
                        <Badge
                          variant="outline"
                          className={`text-[9px] px-1.5 py-0 h-4 ${
                            enabledIds.length > 0
                              ? "bg-primary/10 border-primary/30 text-primary"
                              : "bg-muted/10 border-border/30 text-muted-foreground"
                          }`}
                          title="Alertas vinculados nesta operação"
                        >
                          <Bell className="h-2.5 w-2.5 mr-0.5" />
                          {enabledIds.length} {enabledIds.length === 1 ? "alerta" : "alertas"}
                        </Badge>
                        {!r.is_active && (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-muted/20 text-muted-foreground border-muted-foreground/30">
                            Inativo
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Link2 className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[240px]">{r.webhook_url || "Sem URL"}</span>
                      </div>
                    </div>
                  </div>


                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Switch checked={r.is_active} onCheckedChange={(v) => toggleActive.mutate({ id: r.id, is_active: v })} className="scale-75" />
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditing(r); setIsCreating(false); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => {
                      const count = enabledIds.length;
                      const msg = count > 0
                        ? `Remover "${r.name}"? Ele tem ${count} alerta(s) vinculado(s) que serão desvinculados.`
                        : `Remover "${r.name}"?`;
                      if (confirm(msg)) deleteMutation.mutate(r.id);
                    }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>

                  </div>
                </div>

                {/* Template preferences inline */}
                <div className="flex flex-wrap gap-1.5">
                  {templates?.map((t) => {
                    const enabled = enabledIds.includes(t.id);
                    return (
                      <Badge
                        key={t.id}
                        variant="outline"
                        className={`text-[9px] cursor-pointer transition-colors ${
                          enabled ? "bg-primary/10 border-primary/30 text-primary" : "bg-muted/10 border-border/30 text-muted-foreground"
                        }`}
                        onClick={() => togglePref.mutate({ recipient_id: r.id, template_id: t.id, enabled: !enabled })}
                      >
                        <Bell className="h-2.5 w-2.5 mr-1" />
                        {t.name}
                      </Badge>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {(!recipients || recipients.length === 0) && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Users className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm">Nenhum destinatário configurado.</p>
            <p className="text-xs mt-1">Adicione destinatários para controlar quem recebe cada notificação.</p>
          </div>
        )}
      </div>

      {/* Edit/Create Dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) { setEditing(null); setIsCreating(false); } }}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">{isCreating ? "Novo Destinatário" : "Editar Destinatário"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <RecipientEditor
              recipient={editing}
              isCreating={isCreating}
              templates={templates || []}
              prefs={(prefs || []).filter((p) => p.recipient_id === editing.id)}
              onSave={(r) => saveMutation.mutate(r)}
              onTogglePref={(templateId, enabled) => togglePref.mutate({ recipient_id: editing.id, template_id: templateId, enabled })}
              onUpdateSchedule={(templateId, schedule) => updatePrefSchedule.mutate({ recipient_id: editing.id, template_id: templateId, schedule })}
              isSaving={saveMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RecipientEditor({
  recipient,
  isCreating,
  templates,
  prefs,
  onSave,
  onTogglePref,
  onUpdateSchedule,
  isSaving,
}: {
  recipient: Recipient;
  isCreating: boolean;
  templates: Template[];
  prefs: Pref[];
  onSave: (r: Partial<Recipient> & { id?: string }) => void;
  onTogglePref: (templateId: string, enabled: boolean) => void;
  onUpdateSchedule: (templateId: string, schedule: string[]) => void;
  isSaving: boolean;
}) {
  const [name, setName] = useState(recipient.name);
  const [webhookUrl, setWebhookUrl] = useState(recipient.webhook_url);
  const [isActive, setIsActive] = useState(recipient.is_active);
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);

  const validation = useMemo(
    () => recipientSchema.safeParse({ name, webhook_url: webhookUrl }),
    [name, webhookUrl],
  );
  const errors = validation.success
    ? {}
    : Object.fromEntries(
        validation.error.issues.map((i) => [i.path[0] as string, i.message]),
      );

  const prefsMap = new Map(prefs.filter((p) => p.enabled).map((p) => [p.template_id, p]));

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Nome</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          className={`h-9 text-sm ${errors.name ? "border-destructive" : ""}`}
          placeholder="Gabriel, Gui, Operação..."
        />
        {errors.name && (
          <p className="text-[10px] text-destructive flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> {errors.name}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Webhook URL (Pushcut)</label>
        <Input
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          maxLength={500}
          className={`h-9 text-xs font-mono ${errors.webhook_url ? "border-destructive" : ""}`}
          placeholder="https://api.pushcut.io/<token>/notifications/<nome>"
        />
        {errors.webhook_url ? (
          <p className="text-[10px] text-destructive flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> {errors.webhook_url}
          </p>
        ) : (
          <p className="text-[10px] text-muted-foreground">
            Aceita apenas URLs <code className="font-mono">api.pushcut.io</code>.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between border border-border/30 rounded-md px-3 py-2">
        <div>
          <div className="text-xs font-medium">Ativo</div>
          <p className="text-[10px] text-muted-foreground">
            Desativar pausa o envio sem apagar os vínculos.
          </p>
        </div>
        <Switch checked={isActive} onCheckedChange={setIsActive} />
      </div>


      {!isCreating && (
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Bell className="h-3.5 w-3.5" />
            Notificações habilitadas
          </label>
          <div className="space-y-1">
            {templates.map((t) => {
              const pref = prefsMap.get(t.id);
              const enabled = !!pref;
              const isExpanded = expandedTemplate === t.id;
              const schedule = pref?.schedule || [];

              return (
                <div key={t.id} className="border border-border/30 rounded-md overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2">
                    <Checkbox
                      checked={enabled}
                      onCheckedChange={(v) => onTogglePref(t.id, !!v)}
                    />
                    <span className="text-sm flex-1">{t.name}</span>
                    <Badge variant="outline" className="text-[9px] font-mono">{t.type}</Badge>
                    {enabled && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => setExpandedTemplate(isExpanded ? null : t.id)}
                      >
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </Button>
                    )}
                  </div>

                  {enabled && isExpanded && (
                    <SchedulePicker
                      schedule={schedule}
                      onChange={(newSchedule) => onUpdateSchedule(t.id, newSchedule)}
                    />
                  )}

                  {enabled && !isExpanded && schedule.length > 0 && (
                    <div className="px-3 pb-2">
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{schedule.join(", ")}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Button
        onClick={() => onSave({ id: isCreating ? undefined : recipient.id, name, webhook_url: webhookUrl, is_active: isActive })}
        disabled={isSaving || !validation.success}
        className="w-full gap-2"
      >
        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
        {isSaving ? "Salvando..." : "Salvar Destinatário"}
      </Button>

    </div>
  );
}

function SchedulePicker({ schedule, onChange }: { schedule: string[]; onChange: (s: string[]) => void }) {
  const toggleHour = (hour: string) => {
    const next = schedule.includes(hour)
      ? schedule.filter((h) => h !== hour)
      : [...schedule, hour].sort();
    onChange(next);
  };

  return (
    <div className="px-3 pb-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Horários de envio</span>
        <span className="text-[10px] text-muted-foreground ml-auto">{schedule.length === 0 ? "Todos (sem filtro)" : `${schedule.length} selecionados`}</span>
      </div>
      <div className="grid grid-cols-6 gap-1">
        {ALL_HOURS.map((h) => {
          const active = schedule.includes(h);
          return (
            <button
              key={h}
              onClick={() => toggleHour(h)}
              className={`text-[10px] py-1 rounded transition-colors font-mono ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
              }`}
            >
              {h}
            </button>
          );
        })}
      </div>
      {schedule.length === 0 && (
        <p className="text-[10px] text-muted-foreground/60 italic">
          Sem horários = envia em qualquer hora do cron
        </p>
      )}
    </div>
  );
}
