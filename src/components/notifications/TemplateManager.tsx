import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText, Plus, Pencil, Trash2, Eye, SendHorizonal, Loader2, Variable, Copy, Globe, Target } from "lucide-react";
import { toast } from "sonner";
import { ALL_PROJECTS } from "@/lib/projectUtils";
import { useOperation } from "@/contexts/OperationContext";

const SCOPE_OPTIONS = [
  { code: "TODOS", label: "🌎 Geral (todos os projetos)" },
  ...ALL_PROJECTS.map((p) => ({ code: p.code, label: `🎯 ${p.code} — ${p.label}` })),
];

type Template = {
  id: string;
  name: string;
  type: string;
  title_template: string;
  body_template: string;
  available_variables: string[];
  is_active: boolean;
  is_system: boolean;
  created_at: string;
  updated_at: string;
  project_scope: string;
};

function replaceVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || `{{${key}}}`);
}

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
  hora_inicio: "10:00",
  hora_fim: "10:59",
  janela: "10:00–10:59",
  lucro_baiano: "8.420,00",
  roas_baiano: "1.65x",
  lucro_bid: "5.130,00",
  roas_bid: "1.32x",
  lucro_cbo_baiano: "9.880,00",
  roas_cbo_baiano: "1.78x",
  lucro_bid_baiano: "4.215,00",
  roas_bid_baiano: "1.21x",
  vencedor: "CBO BAIANO",
  diagnostico: "✅ Fase saudável — lucrando dentro do esperado.",
};

export function TemplateManager() {
  const { operation } = useOperation();
  const queryClient = useQueryClient();
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [sendingTestId, setSendingTestId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive" | "system">("all");

  const { data: templates, isLoading } = useQuery({
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

  const saveMutation = useMutation({
    mutationFn: async (t: Partial<Template> & { id?: string }) => {
      if (t.id) {
        const { error } = await supabase
          .from("notification_templates")
          .update({
            name: t.name,
            type: t.type,
            title_template: t.title_template,
            body_template: t.body_template,
            available_variables: t.available_variables,
            is_active: t.is_active,
            project_scope: t.project_scope || "TODOS",
          })
          .eq("id", t.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("notification_templates")
          .insert({
            name: t.name || "Novo Template",
            type: t.type || "custom",
            title_template: t.title_template || "",
            body_template: t.body_template || "",
            available_variables: t.available_variables || [],
            is_active: t.is_active ?? true,
            project_scope: t.project_scope || "TODOS",
            operation_id: operation?.id || null,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-templates"] });
      setEditingTemplate(null);
      setIsCreating(false);
      toast.success("Template salvo!");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notification_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-templates"] });
      toast.success("Template removido!");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("notification_templates").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notification-templates"] }),
    onError: (err: Error) => toast.error(err.message),
  });

  const sendTest = async (template: Template) => {
    setSendingTestId(template.id);
    try {
      const title = replaceVars(template.title_template, SAMPLE_VALUES);
      const text = replaceVars(template.body_template, SAMPLE_VALUES);
      const { error } = await supabase.functions.invoke("send-test-notification", {
        body: { custom_title: title, custom_text: text },
      });
      if (error) throw error;
      toast.success("Teste enviado via Pushcut!");
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setSendingTestId(null);
    }
  };

  const filteredTemplates = (templates || []).filter((t) => {
    if (statusFilter === "active") return t.is_active;
    if (statusFilter === "inactive") return !t.is_active;
    if (statusFilter === "system") return t.is_system;
    return true;
  });

  const filterCounts = {
    all: templates?.length || 0,
    active: templates?.filter((t) => t.is_active).length || 0,
    inactive: templates?.filter((t) => !t.is_active).length || 0,
    system: templates?.filter((t) => t.is_system).length || 0,
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">Carregando templates...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Templates de Notificação</h2>
          <p className="text-xs text-muted-foreground">Edite título, corpo e variáveis dinâmicas de cada template</p>
        </div>
        <Button size="sm" className="gap-1.5 text-xs" onClick={() => {
          setIsCreating(true);
          setEditingTemplate({
            id: "",
            name: "",
            type: "custom",
            title_template: "",
            body_template: "",
            available_variables: [],
            is_active: true,
            is_system: false,
            created_at: "",
            updated_at: "",
            project_scope: "TODOS",
          });
        }}>
          <Plus className="h-3.5 w-3.5" />
          Novo Template
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {([
          { key: "all" as const, label: "Todos" },
          { key: "active" as const, label: "Ativos" },
          { key: "inactive" as const, label: "Inativos" },
          { key: "system" as const, label: "Sistema" },
        ]).map((f) => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors ${
              statusFilter === f.key
                ? "bg-primary/10 text-primary border border-primary/20"
                : "bg-secondary/30 text-muted-foreground border border-border hover:bg-secondary/50"
            }`}
          >
            {f.label}
            <span className="ml-0.5 text-[10px] opacity-70">{filterCounts[f.key]}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-3">
        {filteredTemplates.map((t) => (
          <Card key={t.id} className="bg-card/50 border-border/30 hover:border-border/60 transition-colors">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={`h-2 w-2 rounded-full flex-shrink-0 ${t.is_active ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{t.name}</span>
                      <Badge variant="outline" className="text-[9px] font-mono uppercase flex-shrink-0">
                        {t.type}
                      </Badge>
                      <Badge variant="outline" className={`text-[9px] flex-shrink-0 ${t.project_scope === "TODOS" ? "bg-blue-500/10 border-blue-500/30 text-blue-600" : "bg-amber-500/10 border-amber-500/30 text-amber-600"}`}>
                        {t.project_scope === "TODOS" ? "🌎 Geral" : `🎯 ${t.project_scope}`}
                      </Badge>
                      {t.is_system && (
                        <Badge variant="outline" className="text-[9px] bg-primary/5 text-primary border-primary/20 flex-shrink-0">
                          Sistema
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">{t.title_template}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Switch
                    checked={t.is_active}
                    onCheckedChange={(v) => toggleActive.mutate({ id: t.id, is_active: v })}
                    className="scale-75"
                  />
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => sendTest(t)} disabled={sendingTestId === t.id}>
                    {sendingTestId === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SendHorizonal className="h-3.5 w-3.5" />}
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingTemplate(t); setIsCreating(false); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(t.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit/Create Dialog */}
      <Dialog open={!!editingTemplate} onOpenChange={(open) => { if (!open) { setEditingTemplate(null); setIsCreating(false); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">{isCreating ? "Novo Template" : "Editar Template"}</DialogTitle>
          </DialogHeader>
          {editingTemplate && (
            <TemplateEditor
              template={editingTemplate}
              isCreating={isCreating}
              onSave={(t) => saveMutation.mutate(t)}
              isSaving={saveMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TemplateEditor({
  template,
  isCreating,
  onSave,
  isSaving,
}: {
  template: Template;
  isCreating: boolean;
  onSave: (t: Partial<Template> & { id?: string }) => void;
  isSaving: boolean;
}) {
  const [name, setName] = useState(template.name);
  const [type, setType] = useState(template.type);
  const [projectScope, setProjectScope] = useState(template.project_scope || "TODOS");
  const [titleTemplate, setTitleTemplate] = useState(template.title_template);
  const [bodyTemplate, setBodyTemplate] = useState(template.body_template);
  const [varsText, setVarsText] = useState(template.available_variables.join(", "));

  const previewTitle = replaceVars(titleTemplate, SAMPLE_VALUES);
  const previewBody = replaceVars(bodyTemplate, SAMPLE_VALUES);

  const handleSave = () => {
    const vars = varsText.split(",").map((v) => v.trim()).filter(Boolean);
    onSave({
      id: isCreating ? undefined : template.id,
      name,
      type,
      title_template: titleTemplate,
      body_template: bodyTemplate,
      available_variables: vars,
      is_active: template.is_active,
      project_scope: projectScope,
    });
  };

  const insertVar = (v: string) => {
    setBodyTemplate((prev) => prev + `{{${v}}}`);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Nome</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-sm" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Tipo</label>
          <Input value={type} onChange={(e) => setType(e.target.value)} className="h-9 text-sm" placeholder="pulse_1h, sale_approved..." />
        </div>
      </div>

      {/* Project Scope Selector */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground flex items-center gap-1.5">
          {projectScope === "TODOS" ? <Globe className="h-3.5 w-3.5" /> : <Target className="h-3.5 w-3.5" />}
          Escopo do Projeto
        </label>
        <Select value={projectScope} onValueChange={setProjectScope}>
          <SelectTrigger className="h-9 text-sm bg-secondary/30 border-border/50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SCOPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.code} value={opt.code} className="text-sm">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground">
          {projectScope === "TODOS"
            ? "Métricas consolidadas de toda a operação (todas as contas e projetos)"
            : `Métricas filtradas apenas para o projeto ${projectScope}`}
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Título do Template</label>
        <Input value={titleTemplate} onChange={(e) => setTitleTemplate(e.target.value)} className="h-9 text-sm font-mono" placeholder="GTX OS | {{projeto}} — {{status}}" />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Corpo do Template</label>
        <Textarea value={bodyTemplate} onChange={(e) => setBodyTemplate(e.target.value)} className="min-h-[120px] text-sm font-mono" placeholder="📊 ROAS: {{roas}}x | Lucro: R$ {{lucro}}" />
      </div>

      {/* Variables */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Variable className="h-3.5 w-3.5" />
          Variáveis disponíveis
        </label>
        <Input value={varsText} onChange={(e) => setVarsText(e.target.value)} className="h-9 text-xs font-mono" placeholder="vendas, receita, roas, lucro..." />
        <div className="flex flex-wrap gap-1 mt-1">
          {varsText.split(",").map((v) => v.trim()).filter(Boolean).map((v) => (
            <Badge
              key={v}
              variant="outline"
              className="text-[9px] font-mono cursor-pointer hover:bg-primary/10 hover:border-primary/30 transition-colors"
              onClick={() => insertVar(v)}
            >
              {`{{${v}}}`}
              <Copy className="h-2.5 w-2.5 ml-1 opacity-50" />
            </Badge>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Eye className="h-3.5 w-3.5" />
          Preview em tempo real
        </label>
        <div className="bg-secondary/20 border border-border/30 rounded-xl p-3">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 h-8 w-8 rounded-lg bg-card border border-border/50 flex items-center justify-center text-sm">📊</div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">{previewTitle || "Título..."}</p>
              <p className="text-[11px] text-muted-foreground whitespace-pre-line leading-relaxed mt-0.5">{previewBody || "Corpo..."}</p>
            </div>
          </div>
        </div>
      </div>

      <Button onClick={handleSave} disabled={isSaving} className="w-full gap-2">
        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
        {isSaving ? "Salvando..." : "Salvar Template"}
      </Button>
    </div>
  );
}
