import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperation } from "@/contexts/OperationContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Plus, Briefcase, Users, Eye, Pencil, Trash2, ExternalLink, Copy, Search, Filter, ListChecks, Download } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { QUIZ_TEMPLATES, type QuizQuestion } from "@/lib/quizTemplates";

const AREAS = ["Copywriter", "Editor de VSL", "Media Buyer", "Designer", "Desenvolvedor", "Gestor de Tráfego", "Atendimento", "Financeiro", "Outro"];
const WORK_MODELS = [
  { value: "remoto", label: "Remoto" },
  { value: "presencial", label: "Presencial" },
  { value: "hibrido", label: "Híbrido" },
];
const STATUS_OPTIONS = [
  { value: "novo", label: "Novo", color: "bg-blue-500/15 text-blue-400" },
  { value: "em_analise", label: "Em Análise", color: "bg-yellow-500/15 text-yellow-400" },
  { value: "aprovado", label: "Aprovado", color: "bg-emerald-500/15 text-emerald-400" },
  { value: "rejeitado", label: "Rejeitado", color: "bg-red-500/15 text-red-400" },
];

function JobFormDialog({ job, operationId, onClose }: { job?: any; operationId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(job?.title ?? "");
  const [description, setDescription] = useState(job?.description ?? "");
  const [area, setArea] = useState(job?.area ?? "geral");
  const [workModel, setWorkModel] = useState(job?.work_model ?? "remoto");
  const [isActive, setIsActive] = useState(job?.is_active ?? true);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>(
    job?.quiz_questions && Array.isArray(job.quiz_questions) ? job.quiz_questions : []
  );

  const hasTemplate = QUIZ_TEMPLATES[area];

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = { title, description, area, work_model: workModel, is_active: isActive, quiz_questions: quizQuestions as any };
      if (job) {
        const { error } = await supabase.from("talent_jobs").update(payload).eq("id", job.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("talent_jobs").insert({ ...payload, operation_id: operationId } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["talent-jobs"] });
      toast({ title: job ? "Vaga atualizada" : "Vaga criada" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      <div className="space-y-2">
        <Label>Título da vaga</Label>
        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Copywriter Pleno" />
      </div>
      <div className="space-y-2">
        <Label>Descrição</Label>
        <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Descreva a vaga..." rows={4} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Área</Label>
          <Select value={area} onValueChange={v => { setArea(v); if (QUIZ_TEMPLATES[v] && quizQuestions.length === 0) setQuizQuestions(QUIZ_TEMPLATES[v]); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {AREAS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Modelo</Label>
          <Select value={workModel} onValueChange={setWorkModel}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {WORK_MODELS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Quiz Questions */}
      <div className="space-y-2 border-t pt-4">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-1.5"><ListChecks className="h-4 w-4" /> Questionário ({quizQuestions.length} perguntas)</Label>
          <div className="flex gap-1">
            {hasTemplate && quizQuestions.length === 0 && (
              <Button variant="outline" size="sm" onClick={() => setQuizQuestions(QUIZ_TEMPLATES[area])}>
                Usar template
              </Button>
            )}
            {quizQuestions.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => { if (confirm("Remover todas as perguntas?")) setQuizQuestions([]); }} className="text-destructive">
                Limpar
              </Button>
            )}
          </div>
        </div>
        {quizQuestions.length > 0 && (
          <div className="text-xs text-muted-foreground space-y-1 max-h-40 overflow-y-auto bg-muted/30 rounded-md p-3">
            {quizQuestions.map((q, i) => (
              <p key={q.id} className="truncate">
                {i + 1}. <span className="text-foreground">{q.text}</span>
                <span className="ml-1 text-muted-foreground">({q.type === "radio" ? "Múlt. Escolha" : q.type === "checkbox" ? "Caixa de Seleção" : q.type === "select" ? "Seleção" : "Texto"})</span>
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="rounded" />
        <Label>Vaga ativa (visível na página pública)</Label>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button onClick={() => mutation.mutate()} disabled={!title.trim() || mutation.isPending}>
          {mutation.isPending ? "Salvando..." : job ? "Atualizar" : "Criar Vaga"}
        </Button>
      </div>
    </div>
  );
}

export default function TalentBank() {
  const qc = useQueryClient();
  const { operation } = useOperation();
  const operationId = operation?.id || null;
  const operationSlug = operation?.slug || operationId;
  const [jobDialog, setJobDialog] = useState<{ open: boolean; job?: any }>({ open: false });
  const [searchApps, setSearchApps] = useState("");
  const [filterStatus, setFilterStatus] = useState("todos");
  const [filterArea, setFilterArea] = useState("todos");

  const { data: jobs = [] } = useQuery({
    queryKey: ["talent-jobs", operationId],
    enabled: !!operationId,
    queryFn: async () => {
      const { data } = await supabase.from("talent_jobs").select("*").eq("operation_id", operationId!).order("sort_order").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: applications = [] } = useQuery({
    queryKey: ["talent-applications", operationId],
    enabled: !!operationId,
    queryFn: async () => {
      const { data } = await supabase.from("talent_applications").select("*, talent_jobs(title)").eq("operation_id", operationId!).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const deleteJob = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("talent_jobs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["talent-jobs"] }); toast({ title: "Vaga removida" }); },
  });

  const updateAppStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("talent_applications").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["talent-applications"] }); },
  });

  const deleteApp = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("talent_applications").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["talent-applications"] }); toast({ title: "Candidatura removida" }); },
  });

  const publicUrl = `https://gtxmidiadash.lovable.app/careers/${operationSlug}`;

  const filteredApps = applications.filter((a: any) => {
    if (filterStatus !== "todos" && a.status !== filterStatus) return false;
    if (filterArea !== "todos" && a.area_of_interest !== filterArea) return false;
    if (searchApps && !a.full_name.toLowerCase().includes(searchApps.toLowerCase()) && !a.email.toLowerCase().includes(searchApps.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total: applications.length,
    novo: applications.filter((a: any) => a.status === "novo").length,
    em_analise: applications.filter((a: any) => a.status === "em_analise").length,
    aprovado: applications.filter((a: any) => a.status === "aprovado").length,
  };

  return (
    <div className="space-y-6 full-width-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Banco de Talentos</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie vagas e candidaturas da sua operação</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(publicUrl); toast({ title: "Link copiado!" }); }}>
            <Copy className="h-4 w-4 mr-1" /> Link público
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.open(publicUrl, "_blank")}>
            <ExternalLink className="h-4 w-4 mr-1" /> Visualizar
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4 pb-3 px-4"><p className="text-xs text-muted-foreground">Total Candidatos</p><p className="text-2xl font-bold">{stats.total}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 px-4"><p className="text-xs text-muted-foreground">Novos</p><p className="text-2xl font-bold text-blue-400">{stats.novo}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 px-4"><p className="text-xs text-muted-foreground">Em Análise</p><p className="text-2xl font-bold text-yellow-400">{stats.em_analise}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 px-4"><p className="text-xs text-muted-foreground">Aprovados</p><p className="text-2xl font-bold text-emerald-400">{stats.aprovado}</p></CardContent></Card>
      </div>

      <Tabs defaultValue="jobs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="jobs"><Briefcase className="h-4 w-4 mr-1" /> Vagas ({jobs.length})</TabsTrigger>
          <TabsTrigger value="applications"><Users className="h-4 w-4 mr-1" /> Candidaturas ({applications.length})</TabsTrigger>
        </TabsList>

        {/* VAGAS TAB */}
        <TabsContent value="jobs" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={jobDialog.open} onOpenChange={o => setJobDialog({ open: o })}>
              <DialogTrigger asChild>
                <Button size="sm" onClick={() => setJobDialog({ open: true })}><Plus className="h-4 w-4 mr-1" /> Nova Vaga</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{jobDialog.job ? "Editar Vaga" : "Nova Vaga"}</DialogTitle></DialogHeader>
                <JobFormDialog job={jobDialog.job} operationId={operationId!} onClose={() => setJobDialog({ open: false })} />
              </DialogContent>
            </Dialog>
          </div>

          {jobs.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhuma vaga cadastrada. Crie sua primeira vaga!</CardContent></Card>
          ) : (
            <div className="grid gap-3">
              {jobs.map((job: any) => (
                <Card key={job.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{job.title}</h3>
                        <Badge variant={job.is_active ? "default" : "secondary"}>{job.is_active ? "Ativa" : "Inativa"}</Badge>
                        <Badge variant="outline">{job.area}</Badge>
                        <Badge variant="outline">{WORK_MODELS.find(m => m.value === job.work_model)?.label}</Badge>
                      </div>
                      {job.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{job.description}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setJobDialog({ open: true, job })}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => { if (confirm("Excluir vaga?")) deleteJob.mutate(job.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* CANDIDATURAS TAB */}
        <TabsContent value="applications" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome ou email..." value={searchApps} onChange={e => setSearchApps(e.target.value)} className="pl-9" />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40"><Filter className="h-4 w-4 mr-1" /><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos status</SelectItem>
                {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterArea} onValueChange={setFilterArea}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas áreas</SelectItem>
                {AREAS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" disabled={filteredApps.length === 0} onClick={() => {
              const jobMap = new Map(jobs.map((j: any) => [j.id, j.title]));
              const header = ["Nome", "Email", "Telefone", "Instagram", "Área", "Vaga", "Status", "Data", "Portfolio", "Currículo", "Carta de Apresentação", "Respostas Quiz"];
              const rows = filteredApps.map((a: any) => [
                a.full_name, a.email, a.phone || "", a.instagram || "", a.area_of_interest || "",
                a.job_id ? (jobMap.get(a.job_id) || "—") : "Banco de Talentos",
                STATUS_OPTIONS.find(s => s.value === a.status)?.label || a.status,
                a.created_at ? format(new Date(a.created_at), "dd/MM/yyyy HH:mm") : "",
                a.portfolio_url || "", a.resume_url || "", a.cover_letter || "",
                Array.isArray(a.quiz_answers) ? a.quiz_answers.map((q: any) => `${q.question}: ${Array.isArray(q.answer) ? q.answer.join("; ") : q.answer}`).join(" | ") : ""
              ]);
              const csvContent = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
              const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = `candidaturas_${format(new Date(), "yyyy-MM-dd")}.csv`;
              link.click();
              URL.revokeObjectURL(url);
              toast({ title: `${filteredApps.length} candidaturas exportadas ✅` });
            }}>
              <Download className="h-4 w-4 mr-1" /> Exportar CSV
            </Button>
          </div>

          {filteredApps.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhuma candidatura encontrada.</CardContent></Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                     <TableHead>Telefone</TableHead>
                     <TableHead>Instagram</TableHead>
                     <TableHead>Área</TableHead>
                    <TableHead>Vaga</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data</TableHead>
                     <TableHead>Questionário</TableHead>
                     <TableHead>Links</TableHead>
                     <TableHead></TableHead>
                   </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredApps.map((app: any) => {
                    const st = STATUS_OPTIONS.find(s => s.value === app.status) ?? STATUS_OPTIONS[0];
                    return (
                      <TableRow key={app.id}>
                        <TableCell className="font-medium">{app.full_name}</TableCell>
                        <TableCell className="text-sm">{app.email}</TableCell>
                         <TableCell className="text-sm">{app.phone || "—"}</TableCell>
                         <TableCell className="text-sm">{app.instagram || "—"}</TableCell>
                         <TableCell><Badge variant="outline">{app.area_of_interest || "—"}</Badge></TableCell>
                        <TableCell className="text-sm">{app.talent_jobs?.title || "Banco de Talentos"}</TableCell>
                        <TableCell>
                          <Select value={app.status} onValueChange={v => updateAppStatus.mutate({ id: app.id, status: v })}>
                            <SelectTrigger className="h-7 w-28 text-xs">
                              <Badge className={st.color + " text-xs"}>{st.label}</Badge>
                            </SelectTrigger>
                            <SelectContent>
                              {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{format(new Date(app.created_at), "dd/MM/yy", { locale: ptBR })}</TableCell>
                        <TableCell>
                          {Array.isArray(app.quiz_answers) && app.quiz_answers.length > 0 ? (
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs"><Eye className="h-3 w-3 mr-1" />{app.quiz_answers.length} respostas</Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
                                <DialogHeader><DialogTitle>Respostas — {app.full_name}</DialogTitle></DialogHeader>
                                <div className="space-y-4 mt-2">
                                  {(app.quiz_answers as any[]).map((qa: any, i: number) => (
                                    <div key={i} className="space-y-1">
                                      <p className="text-sm font-medium">{i + 1}. {qa.question}</p>
                                      <p className="text-sm text-muted-foreground pl-3">
                                        {Array.isArray(qa.answer) ? qa.answer.join(", ") : qa.answer || "—"}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </DialogContent>
                            </Dialog>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {app.portfolio_url && <a href={app.portfolio_url} target="_blank" className="text-primary hover:underline text-xs">Portfólio</a>}
                            {app.resume_url && <a href={app.resume_url} target="_blank" className="text-primary hover:underline text-xs">CV</a>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => { if (confirm("Excluir candidatura?")) deleteApp.mutate(app.id); }}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
