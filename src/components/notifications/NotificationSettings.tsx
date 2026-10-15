import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Clock, Plus, X, Save, Smartphone, SendHorizonal, Loader2, Eye, UserCircle,
  LayoutTemplate, Pencil, FolderKanban, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { Json } from "@/integrations/supabase/types";
import { ALL_PROJECTS } from "@/lib/projectUtils";
import { useOperation } from "@/contexts/OperationContext";

// Template types that fire instantly (no schedule needed)
const INSTANT_TEMPLATE_TYPES = ["sale_approved", "sale_pending"];

// Template types managed by their own system (cron/event-driven) — schedule not configurable
const SYSTEM_MANAGED_TYPES = ["pulse_1h", "account_status_change", "data_health"];

const SYSTEM_MANAGED_LABELS: Record<string, string> = {
  pulse_1h: "⏱ Disparo automático a cada ~1h via cron",
  account_status_change: "⚡ Disparo instantâneo ao detectar mudança de status",
  data_health: "📅 Disparo diário automático via cron",
};

type Recipient = {
  id: string;
  name: string;
  webhook_url: string;
  is_active: boolean;
  schedule: string[];
  project_filter: string[];
};

type Template = {
  id: string;
  name: string;
  type: string;
  title_template: string;
  body_template: string;
  available_variables: string[];
  is_active: boolean;
};

type Pref = {
  id: string;
  recipient_id: string;
  template_id: string;
  enabled: boolean;
  schedule: string[];
};

const SAMPLE_VALUES: Record<string, string> = {
  status: "🟢 AQUECIDO",
  vendas_1h: "4",
  receita_1h: "3.651,00",
  roas_1h: "1.85",
  lucro_1h: "1.672,00",
  investido_1h: "1.979,00",
  cpa_1h: "494,75",
  ctr_1h: "2.4%",
  vendas: "28",
  receita: "24.350,00",
  roas: "1.42",
  lucro: "6.892,00",
  investido: "17.458,00",
  tempo_sem_venda: "12 min",
  utm_campaign: "[BMGTX] [H02B28] [NDM] Campanha",
  utm_resumo: "[BMSPA-C/A-07] [H2B13] [Pré Escala] [21.02] [T3]",
  valor: "197,00",
  produto: "Neurodyne",
  projeto: "NDM",
  store: "ndm",
  periodo: "Hoje 08:00 - 23:00",
  cpa: "623,50",
  ticket: "869,64",
};

function replaceVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || `{{${key}}}`);
}

const PROJECT_OPTIONS = [{ code: "TODOS", label: "Todos os Projetos" }, ...ALL_PROJECTS];

export function NotificationSettings() {
  const { operation } = useOperation();
  const queryClient = useQueryClient();
  const [selectedRecipientId, setSelectedRecipientId] = useState<string>("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [newTime, setNewTime] = useState("");
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [localTemplateSchedules, setLocalTemplateSchedules] = useState<Record<string, string[]>>({});
  const [localProjects, setLocalProjects] = useState<string[]>(["TODOS"]);
  const [isEditing, setIsEditing] = useState(false);

  const { data: recipients, isLoading: loadingRecipients } = useQuery({
    queryKey: ["notification-recipients", operation?.id],
    queryFn: async () => {
      let query = supabase
        .from("notification_recipients")
        .select("*")
        .order("created_at", { ascending: true });
      if (operation?.id) query = query.eq("operation_id", operation.id);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map((r: any) => ({
        ...r,
        schedule: Array.isArray(r.schedule) ? r.schedule : ["08:00", "12:00", "18:00", "23:00"],
        project_filter: Array.isArray(r.project_filter) ? r.project_filter : ["TODOS"],
      })) as Recipient[];
    },
  });

  const { data: templates } = useQuery({
    queryKey: ["notification-templates", operation?.id],
    queryFn: async () => {
      let query = supabase
        .from("notification_templates")
        .select("*")
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

  const selectedRecipient = recipients?.find((r) => r.id === selectedRecipientId);
  const selectedTemplate = templates?.find((t) => t.id === selectedTemplateId);

  // Check if selected template needs schedule
  const selectedTemplateNeedsSchedule = selectedTemplate
    ? !INSTANT_TEMPLATE_TYPES.includes(selectedTemplate.type) && !SYSTEM_MANAGED_TYPES.includes(selectedTemplate.type)
    : false;

  // Check if ANY enabled template for this recipient needs schedule
  const recipientEnabledTemplateIds = useMemo(() => {
    if (!selectedRecipientId || !prefs) return [];
    return prefs
      .filter((p) => p.recipient_id === selectedRecipientId && p.enabled)
      .map((p) => p.template_id);
  }, [selectedRecipientId, prefs]);

  const hasReportTemplates = useMemo(() => {
    if (!templates) return false;
    return recipientEnabledTemplateIds.some((tid) => {
      const t = templates.find((tpl) => tpl.id === tid);
      return t && !INSTANT_TEMPLATE_TYPES.includes(t.type) && !SYSTEM_MANAGED_TYPES.includes(t.type);
    });
  }, [recipientEnabledTemplateIds, templates]);

  const selectedTemplateIsEnabled = selectedTemplateId
    ? recipientEnabledTemplateIds.includes(selectedTemplateId)
    : false;

  const canEditSelectedTemplateSchedule = !!(
    selectedTemplate &&
    selectedTemplateIsEnabled &&
    selectedTemplateNeedsSchedule
  );

  const selectedTemplateSchedule = useMemo(() => {
    if (!selectedTemplateId) return [];
    const schedule = localTemplateSchedules[selectedTemplateId] || [];
    return [...schedule].sort();
  }, [localTemplateSchedules, selectedTemplateId]);

  const reportTemplateIds = useMemo(() => {
    if (!templates) return [];
    return recipientEnabledTemplateIds.filter((tid) => {
      const tpl = templates.find((t) => t.id === tid);
      return !!tpl && !INSTANT_TEMPLATE_TYPES.includes(tpl.type) && !SYSTEM_MANAGED_TYPES.includes(tpl.type);
    });
  }, [recipientEnabledTemplateIds, templates]);

  const handleRecipientChange = (id: string) => {
    setSelectedRecipientId(id);
    setHasChanges(false);
    setIsEditing(false);

    const r = recipients?.find((rec) => rec.id === id);
    if (r) {
      setLocalProjects([...r.project_filter]);
    }

    const recipientPrefs = (prefs || []).filter((p) => p.recipient_id === id);
    const scheduleMap = recipientPrefs.reduce((acc, p) => {
      acc[p.template_id] = Array.isArray(p.schedule) ? [...p.schedule] : [];
      return acc;
    }, {} as Record<string, string[]>);
    setLocalTemplateSchedules(scheduleMap);

    const enabled = recipientPrefs.filter((p) => p.enabled);
    if (enabled.length > 0) {
      setSelectedTemplateId(enabled[0].template_id);
    } else {
      setSelectedTemplateId("");
    }
  };

  const toggleTemplatePref = useMutation({
    mutationFn: async ({ recipientId, templateId, enabled }: { recipientId: string; templateId: string; enabled: boolean }) => {
      if (enabled) {
        const schedule = localTemplateSchedules[templateId] || [];
        const { error } = await supabase
          .from("recipient_notification_prefs")
          .upsert({
            recipient_id: recipientId,
            template_id: templateId,
            enabled: true,
            schedule: schedule as unknown as Json,
            operation_id: operation?.id!,
          }, { onConflict: "recipient_id,template_id" });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("recipient_notification_prefs")
          .delete()
          .eq("recipient_id", recipientId)
          .eq("template_id", templateId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipient-notification-prefs"] });
      setHasChanges(true);
      toast.success("Preferência atualizada!");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const saveAll = useMutation({
    mutationFn: async () => {
      if (!selectedRecipientId) throw new Error("Nenhum destinatário selecionado");

      const { error: recipientError } = await supabase
        .from("notification_recipients")
        .update({
          project_filter: localProjects as unknown as Json,
        })
        .eq("id", selectedRecipientId);

      if (recipientError) throw recipientError;

      for (const templateId of reportTemplateIds) {
        const { error: prefError } = await supabase
          .from("recipient_notification_prefs")
          .upsert(
            {
              recipient_id: selectedRecipientId,
              template_id: templateId,
              enabled: true,
              schedule: (localTemplateSchedules[templateId] || []) as unknown as Json,
              operation_id: operation?.id!,
            },
            { onConflict: "recipient_id,template_id" }
          );

        if (prefError) throw prefError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-recipients"] });
      queryClient.invalidateQueries({ queryKey: ["recipient-notification-prefs"] });
      setHasChanges(false);
      setIsEditing(false);
      toast.success("Configurações salvas!");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const addScheduleTime = () => {
    if (!selectedTemplateId || !canEditSelectedTemplateSchedule) {
      toast.error("Selecione um template agendado ativo");
      return;
    }

    const time = newTime.trim();
    if (!time.match(/^\d{2}:\d{2}$/)) {
      toast.error("Formato inválido. Use HH:MM");
      return;
    }

    if (selectedTemplateSchedule.includes(time)) {
      toast.error("Horário já adicionado");
      return;
    }

    const nextSchedule = [...selectedTemplateSchedule, time].sort();
    setLocalTemplateSchedules((prev) => ({ ...prev, [selectedTemplateId]: nextSchedule }));
    setHasChanges(true);
    setNewTime("");
  };

  const removeScheduleTime = (time: string) => {
    if (!selectedTemplateId) return;
    const nextSchedule = selectedTemplateSchedule.filter((t) => t !== time);
    setLocalTemplateSchedules((prev) => ({ ...prev, [selectedTemplateId]: nextSchedule }));
    setHasChanges(true);
  };

  const toggleProject = (code: string) => {
    if (code === "TODOS") {
      setLocalProjects(["TODOS"]);
    } else {
      setLocalProjects((prev) => {
        const withoutTodos = prev.filter((p) => p !== "TODOS");
        if (withoutTodos.includes(code)) {
          const next = withoutTodos.filter((p) => p !== code);
          return next.length === 0 ? ["TODOS"] : next;
        }
        return [...withoutTodos, code];
      });
    }
    setHasChanges(true);
  };

  const sendTestNotification = async () => {
    if (!selectedRecipient || !selectedTemplate) {
      toast.error("Selecione destinatário e template");
      return;
    }
    setIsSendingTest(true);
    try {
      const title = replaceVars(selectedTemplate.title_template, SAMPLE_VALUES);
      const text = replaceVars(selectedTemplate.body_template, SAMPLE_VALUES);
      const { error } = await supabase.functions.invoke("send-test-notification", {
        body: {
          custom_title: title,
          custom_text: text,
          recipient_webhook_url: selectedRecipient.webhook_url,
        },
      });
      if (error) throw error;
      toast.success(`Teste enviado para ${selectedRecipient.name}!`);
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setIsSendingTest(false);
    }
  };

  if (loadingRecipients) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="bg-card/50 border-border/30 animate-pulse">
            <CardContent className="p-6 h-64" />
          </Card>
        ))}
      </div>
    );
  }

  const isSaved = !hasChanges && !isEditing;

  return (
    <div className="space-y-6">
      {/* Recipient selector + Save/Edit */}
      <Card className="bg-card/50 border-border/30">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <UserCircle className="h-4 w-4 text-primary" />
                Destinatário
              </div>
              <Select value={selectedRecipientId} onValueChange={handleRecipientChange}>
                <SelectTrigger className="w-[260px] h-9 text-xs bg-secondary/30 border-border/50">
                  <SelectValue placeholder="Selecione um destinatário..." />
                </SelectTrigger>
                <SelectContent>
                  {recipients?.map((r) => (
                    <SelectItem key={r.id} value={r.id} className="text-xs">
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${r.is_active ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                        {r.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedRecipient && (
                <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[200px]">
                  {selectedRecipient.webhook_url || "Sem URL"}
                </span>
              )}
            </div>

            {selectedRecipientId && (
              <div className="flex items-center gap-2">
                {isSaved ? (
                  <>
                    <Badge variant="outline" className="text-[10px] gap-1 text-emerald-500 border-emerald-500/30 bg-emerald-500/5">
                      <CheckCircle2 className="h-3 w-3" /> Salvo
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1 text-xs"
                      onClick={() => setIsEditing(true)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    className="h-8 gap-1 text-xs"
                    onClick={() => saveAll.mutate()}
                    disabled={saveAll.isPending}
                  >
                    <Save className="h-3.5 w-3.5" />
                    {saveAll.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {!selectedRecipientId ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <UserCircle className="h-10 w-10 mb-3 opacity-40" />
          <p className="text-sm">Selecione um destinatário para configurar.</p>
          <p className="text-xs mt-1">Gerencie templates, horários, projetos e envie testes individuais.</p>
        </div>
      ) : (
        <>
          {/* Summary when saved */}
          {isSaved && (
            <Card className="bg-card/50 border-border/30">
              <CardContent className="p-4">
                <div className="flex flex-wrap gap-6 text-xs">
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Templates Ativos</p>
                    <div className="flex flex-wrap gap-1">
                      {recipientEnabledTemplateIds.length === 0 && (
                        <span className="text-muted-foreground">Nenhum</span>
                      )}
                      {recipientEnabledTemplateIds.map((tid) => {
                        const t = templates?.find((tpl) => tpl.id === tid);
                        return t ? (
                          <Badge key={tid} variant="outline" className="text-[9px] bg-primary/5 border-primary/20 text-primary">
                            {t.name}
                          </Badge>
                        ) : null;
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Projetos</p>
                    <div className="flex flex-wrap gap-1">
                      {localProjects.map((p) => (
                        <Badge key={p} variant="outline" className="text-[9px] bg-primary/5 border-primary/20 text-primary">
                          {p === "TODOS" ? "Todos" : p}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {hasReportTemplates && (
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Horários por Template</p>
                      <div className="flex flex-col gap-1.5">
                        {reportTemplateIds.map((templateId) => {
                          const template = templates?.find((tpl) => tpl.id === templateId);
                          if (!template) return null;
                          const schedule = (localTemplateSchedules[templateId] || []).slice().sort();
                          return (
                            <div key={templateId} className="flex flex-wrap items-center gap-1.5">
                              <Badge variant="outline" className="text-[9px] bg-primary/5 border-primary/20 text-primary">
                                {template.name}
                              </Badge>
                              {schedule.length > 0 ? (
                                schedule.map((time) => (
                                  <Badge key={`${templateId}-${time}`} variant="outline" className="text-[9px] font-mono bg-secondary/30 border-border/50 text-muted-foreground">
                                    {time}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-muted-foreground">Nenhum</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Edit mode: full panels */}
          {(isEditing || hasChanges || recipientEnabledTemplateIds.length === 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* ── LEFT: Template Assignment + Projects ── */}
              <Card className="bg-card/50 border-border/30">
                <CardHeader className="pb-4">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <LayoutTemplate className="h-4 w-4 text-primary" />
                    Templates Atribuídos
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Selecione quais templates {selectedRecipient?.name} vai receber:
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {templates?.map((t) => {
                    const isEnabled = recipientEnabledTemplateIds.includes(t.id);
                    const isSelected = selectedTemplateId === t.id;
                      const isInstant = INSTANT_TEMPLATE_TYPES.includes(t.type);
                    const isSystemManaged = SYSTEM_MANAGED_TYPES.includes(t.type);
                    return (
                      <button
                        key={t.id}
                        className={`w-full text-left rounded-lg border px-4 py-3 transition-all ${
                          isSelected
                            ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
                            : "border-border/30 bg-card/30 hover:border-border/60"
                        }`}
                        onClick={() => setSelectedTemplateId(t.id)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${isEnabled ? "bg-emerald-500" : "bg-muted-foreground/20"}`} />
                            <span className={`text-sm font-medium truncate ${isSelected ? "text-primary" : "text-foreground"}`}>
                              {t.name}
                            </span>
                            <Badge variant="outline" className="text-[9px] font-mono uppercase flex-shrink-0">
                              {t.type}
                            </Badge>
                            {isInstant && (
                              <Badge variant="outline" className="text-[9px] bg-amber-500/10 border-amber-500/30 text-amber-600 flex-shrink-0">
                                Instantâneo
                              </Badge>
                            )}
                            {isSystemManaged && (
                              <Badge variant="outline" className="text-[9px] bg-blue-500/10 border-blue-500/30 text-blue-600 flex-shrink-0">
                                Sistema
                              </Badge>
                            )}
                          </div>
                          <Switch
                            checked={isEnabled}
                            onCheckedChange={(v) => {
                              if (!v) {
                                setLocalTemplateSchedules((prev) => {
                                  const next = { ...prev };
                                  delete next[t.id];
                                  return next;
                                });
                              } else {
                                setLocalTemplateSchedules((prev) => ({
                                  ...prev,
                                  [t.id]: prev[t.id] || [],
                                }));
                              }
                              toggleTemplatePref.mutate({
                                recipientId: selectedRecipientId,
                                templateId: t.id,
                                enabled: v,
                              });
                            }}
                            className="scale-75"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1 truncate pl-[18px]">{t.title_template}</p>
                      </button>
                    );
                  })}

                  {(!templates || templates.length === 0) && (
                    <p className="text-xs text-muted-foreground text-center py-6">
                      Nenhum template criado. Vá na aba Templates para criar.
                    </p>
                  )}

                  {/* Project filter */}
                  <div className="pt-4 border-t border-border/30">
                    <p className="text-sm font-semibold flex items-center gap-2 mb-3">
                      <FolderKanban className="h-4 w-4 text-primary" />
                      Projetos
                    </p>
                    <p className="text-xs text-muted-foreground mb-3">
                      Quais projetos {selectedRecipient?.name} recebe notificações:
                    </p>
                    <div className="space-y-2">
                      {PROJECT_OPTIONS.map((proj) => {
                        const isChecked = localProjects.includes(proj.code);
                        return (
                          <label
                            key={proj.code}
                            className="flex items-center gap-2 cursor-pointer rounded-lg px-3 py-2 hover:bg-secondary/10 transition-colors"
                          >
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={() => toggleProject(proj.code)}
                            />
                            <span className="text-sm">{proj.code === "TODOS" ? "Todos os Projetos" : `${proj.code} — ${proj.label}`}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ── MIDDLE: Schedule (only if report templates exist) ── */}
              <Card className="bg-card/50 border-border/30">
                <CardHeader className="pb-4">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" />
                    Horários de Envio
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Horários para relatórios agendados de {selectedRecipient?.name}:
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!hasReportTemplates ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <Clock className="h-8 w-8 mb-2 opacity-30" />
                      <p className="text-xs text-center">
                        Nenhum template de relatório ativo.
                      </p>
                      <p className="text-[10px] mt-1 text-center">
                        Templates de venda são disparados instantaneamente — não precisam de horário.
                      </p>
                    </div>
                  ) : !selectedTemplate ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <Clock className="h-8 w-8 mb-2 opacity-30" />
                      <p className="text-xs text-center">Selecione um template à esquerda para editar horários.</p>
                    </div>
                  ) : !selectedTemplateIsEnabled ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <Clock className="h-8 w-8 mb-2 opacity-30" />
                      <p className="text-xs text-center">Ative o template para configurar os horários.</p>
                    </div>
                  ) : SYSTEM_MANAGED_TYPES.includes(selectedTemplate?.type || "") ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <Clock className="h-8 w-8 mb-2 opacity-30" />
                      <p className="text-xs text-center">
                        {SYSTEM_MANAGED_LABELS[selectedTemplate?.type || ""] || "Gerenciado pelo sistema"}
                      </p>
                      <p className="text-[10px] mt-1 text-center">Horário controlado automaticamente — não configurável.</p>
                    </div>
                  ) : !selectedTemplateNeedsSchedule ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <Clock className="h-8 w-8 mb-2 opacity-30" />
                      <p className="text-xs text-center">Template instantâneo: não usa agenda.</p>
                    </div>
                  ) : (
                    <>
                      {/* Quick-fill presets */}
                      <div className="space-y-1.5">
                        <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Presets — {selectedTemplate.name}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            { label: "A cada 1h", hours: Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`) },
                            { label: "A cada 2h", hours: Array.from({ length: 12 }, (_, i) => `${String(i * 2).padStart(2, "0")}:00`) },
                            { label: "A cada 3h", hours: Array.from({ length: 8 }, (_, i) => `${String(i * 3).padStart(2, "0")}:00`) },
                            { label: "Comercial", hours: ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00"] },
                          ].map((preset) => (
                            <Button
                              key={preset.label}
                              size="sm"
                              variant="outline"
                              className="h-7 text-[10px] px-2.5"
                              onClick={() => {
                                if (!selectedTemplateId) return;
                                setLocalTemplateSchedules((prev) => ({ ...prev, [selectedTemplateId]: [...preset.hours] }));
                                setHasChanges(true);
                              }}
                            >
                              <Clock className="h-3 w-3 mr-1" />
                              {preset.label}
                            </Button>
                          ))}
                          {selectedTemplateSchedule.length > 0 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-[10px] px-2.5 text-destructive hover:text-destructive"
                              onClick={() => {
                                if (!selectedTemplateId) return;
                                setLocalTemplateSchedules((prev) => ({ ...prev, [selectedTemplateId]: [] }));
                                setHasChanges(true);
                              }}
                            >
                              <X className="h-3 w-3 mr-1" />
                              Limpar
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
                        {selectedTemplateSchedule.map((time) => (
                          <div key={time} className="flex items-center justify-between bg-secondary/10 rounded-lg px-3 py-2">
                            <div className="flex items-center gap-2">
                              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-sm font-mono">{time}</span>
                            </div>
                            <button
                              onClick={() => removeScheduleTime(time)}
                              className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                        {selectedTemplateSchedule.length === 0 && (
                          <p className="text-xs text-muted-foreground text-center py-4">Nenhum horário definido</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Input
                          type="text"
                          value={newTime}
                          onChange={(e) => {
                            const v = e.target.value.replace(/[^\d:]/g, "");
                            if (v.length <= 5) setNewTime(v);
                          }}
                          onKeyDown={(e) => { if (e.key === "Enter") addScheduleTime(); }}
                          className="h-8 text-xs font-mono bg-secondary/30 border-border/50 w-[120px]"
                          placeholder="HH:MM"
                          maxLength={5}
                        />
                        <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={addScheduleTime}>
                          <Plus className="h-3 w-3" />
                          Adicionar
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* ── RIGHT: Preview + Test ── */}
              <Card className="bg-card/50 border-border/30">
                <CardHeader className="pb-4">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Eye className="h-4 w-4 text-primary" />
                    Prévia & Teste
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Visualize e envie um teste para {selectedRecipient?.name}:
                  </p>
                </CardHeader>
                <CardContent className="space-y-5">
                  {selectedTemplate ? (
                    <>
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                          Template: {selectedTemplate.name}
                          {INSTANT_TEMPLATE_TYPES.includes(selectedTemplate.type) && (
                            <span className="ml-2 text-amber-500">⚡ Disparo instantâneo</span>
                          )}
                        </p>
                        <div className="bg-secondary/20 border border-border/30 rounded-xl p-3">
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 h-8 w-8 rounded-lg bg-card border border-border/50 flex items-center justify-center text-sm">
                              {INSTANT_TEMPLATE_TYPES.includes(selectedTemplate.type) ? "💰" : "📊"}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-foreground">
                                {replaceVars(selectedTemplate.title_template, SAMPLE_VALUES) || "Título..."}
                              </p>
                              <p className="text-[11px] text-muted-foreground whitespace-pre-line leading-relaxed mt-0.5">
                                {replaceVars(selectedTemplate.body_template, SAMPLE_VALUES) || "Corpo..."}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {selectedTemplate.available_variables.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Variáveis</p>
                          <div className="flex flex-wrap gap-1">
                            {selectedTemplate.available_variables.map((v) => (
                              <Badge key={v} variant="outline" className="text-[9px] font-mono bg-primary/5 border-primary/20 text-primary">
                                {`{{${v}}}`}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Schedule/info summary */}
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                          {INSTANT_TEMPLATE_TYPES.includes(selectedTemplate.type) ? "Tipo de Disparo" : "Agenda"}
                        </p>
                        {INSTANT_TEMPLATE_TYPES.includes(selectedTemplate.type) ? (
                          <p className="text-xs text-amber-600">
                            ⚡ Enviado instantaneamente quando a venda é registrada
                          </p>
                        ) : SYSTEM_MANAGED_TYPES.includes(selectedTemplate.type) ? (
                          <p className="text-xs text-blue-600">
                            {SYSTEM_MANAGED_LABELS[selectedTemplate.type] || "Gerenciado pelo sistema"}
                          </p>
                        ) : !selectedTemplateIsEnabled ? (
                          <p className="text-xs text-muted-foreground">Ative o template para configurar a agenda.</p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {selectedTemplateSchedule.map((time) => (
                              <Badge key={time} variant="outline" className="text-[10px] font-mono bg-primary/5 border-primary/20 text-primary">
                                {time}
                              </Badge>
                            ))}
                            {selectedTemplateSchedule.length === 0 && (
                              <span className="text-xs text-muted-foreground">Nenhum horário</span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Send test */}
                      <div className="pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full gap-2 text-xs"
                          onClick={sendTestNotification}
                          disabled={isSendingTest || !selectedRecipient?.webhook_url}
                        >
                          {isSendingTest ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <SendHorizonal className="h-3.5 w-3.5" />
                          )}
                          {isSendingTest ? "Enviando..." : `Enviar teste para ${selectedRecipient?.name}`}
                        </Button>
                        <p className="text-[10px] text-muted-foreground mt-2 text-center">
                          Envia a prévia do template selecionado para o webhook de {selectedRecipient?.name}.
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                      <Smartphone className="h-8 w-8 mb-2 opacity-40" />
                      <p className="text-xs">Selecione um template à esquerda para ver a prévia.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
