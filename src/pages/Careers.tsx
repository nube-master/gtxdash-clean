import { useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { Briefcase, MapPin, CheckCircle2, Send, FileEdit, Code, Megaphone, PenTool, Users, DollarSign, Headphones, LayoutGrid } from "lucide-react";
import type { QuizQuestion } from "@/lib/quizTemplates";

const AREAS = ["Copywriter", "Editor de VSL", "Media Buyer", "Designer", "Desenvolvedor", "Gestor de Tráfego", "Atendimento", "Financeiro", "Outro"];

/* ─── Quiz Section Renderer ─── */
function QuizSection({ questions, answers, setAnswers }: { questions: QuizQuestion[]; answers: Record<string, any>; setAnswers: (a: Record<string, any>) => void }) {
  const sections = useMemo(() => {
    const map = new Map<string, QuizQuestion[]>();
    questions.forEach(q => {
      const list = map.get(q.section) || [];
      list.push(q);
      map.set(q.section, list);
    });
    return Array.from(map.entries());
  }, [questions]);

  return (
    <div className="space-y-8">
      {sections.map(([section, qs]) => (
        <div key={section} className="space-y-5">
          {qs.map((q, i) => (
            <div key={q.id} className="space-y-3">
              <Label className="text-gray-200 text-sm font-medium">
                {q.text} {q.required && <span className="text-[#FF1E1E]">*</span>}
              </Label>

              {q.type === "radio" && q.options && (
                <RadioGroup value={answers[q.id] || ""} onValueChange={v => setAnswers({ ...answers, [q.id]: v })} className="space-y-2 pl-1">
                  {q.options.map(opt => (
                    <div key={opt} className="flex items-center gap-3 p-2.5 rounded-lg border border-white/10 hover:border-[#FF1E1E]/30 transition-colors cursor-pointer">
                      <RadioGroupItem value={opt} id={`${q.id}-${opt}`} className="border-white/30 text-[#FF1E1E]" />
                      <Label htmlFor={`${q.id}-${opt}`} className="text-gray-300 text-sm cursor-pointer flex-1">{opt}</Label>
                    </div>
                  ))}
                </RadioGroup>
              )}

              {q.type === "checkbox" && q.options && (
                <div className="space-y-2 pl-1">
                  {q.options.map(opt => {
                    const checked = (answers[q.id] as string[] || []).includes(opt);
                    return (
                      <div key={opt} className="flex items-center gap-3 p-2.5 rounded-lg border border-white/10 hover:border-[#FF1E1E]/30 transition-colors cursor-pointer">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={v => {
                            const prev = (answers[q.id] as string[]) || [];
                            setAnswers({ ...answers, [q.id]: v ? [...prev, opt] : prev.filter(x => x !== opt) });
                          }}
                          className="border-white/30 data-[state=checked]:bg-[#FF1E1E] data-[state=checked]:border-[#FF1E1E]"
                        />
                        <Label className="text-gray-300 text-sm cursor-pointer flex-1">{opt}</Label>
                      </div>
                    );
                  })}
                </div>
              )}

              {q.type === "text" && (
                <Textarea
                  value={answers[q.id] || ""}
                  onChange={e => setAnswers({ ...answers, [q.id]: e.target.value })}
                  placeholder="Escreva sua resposta..."
                  rows={3}
                  className="bg-white/5 border-white/10 text-white placeholder:text-gray-500"
                />
              )}

              {q.type === "select" && q.options && (
                <Select value={answers[q.id] || ""} onValueChange={v => setAnswers({ ...answers, [q.id]: v })}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {q.options.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ─── Application Form ─── */
function ApplicationForm({ operationId, jobId, jobTitle, quizQuestions, onSuccess }: {
  operationId: string; jobId?: string; jobTitle?: string; quizQuestions?: QuizQuestion[]; onSuccess: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [instagram, setInstagram] = useState("");
  const [area, setArea] = useState("");
  const [portfolio, setPortfolio] = useState("");
  const [resume, setResume] = useState("");
  const [coverLetter, setCoverLetter] = useState("");
  const [quizAnswers, setQuizAnswers] = useState<Record<string, any>>({});
  const [currentStep, setCurrentStep] = useState(0); // 0 = dados pessoais, 1 = quiz

  const hasQuiz = quizQuestions && quizQuestions.length > 0;
  const totalSteps = hasQuiz ? 2 : 1;

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("talent_applications").insert({
        operation_id: operationId,
        job_id: jobId || null,
        full_name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        instagram: instagram.trim(),
        area_of_interest: area || jobTitle || "",
        portfolio_url: portfolio.trim(),
        resume_url: resume.trim(),
        cover_letter: coverLetter.trim(),
        quiz_answers: hasQuiz ? quizQuestions!.map(q => ({ id: q.id, question: q.text, answer: quizAnswers[q.id] ?? "" })) : [],
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Candidatura enviada com sucesso! ✅" });
      onSuccess();
    },
    onError: (e: any) => toast({ title: "Erro ao enviar", description: e.message, variant: "destructive" }),
  });

  const canProceed = fullName.trim() && email.trim();

  return (
    <div className="space-y-5 max-w-lg mx-auto">
      {/* Step indicator */}
      {hasQuiz && (
        <div className="flex items-center gap-2 mb-4">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= currentStep ? "bg-[#FF1E1E]" : "bg-white/10"}`} />
          ))}
        </div>
      )}

      {currentStep === 0 && (
        <>
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-white">{jobTitle ? `Candidatar-se: ${jobTitle}` : "Entrar no Banco de Talentos"}</h2>
            <p className="text-sm text-gray-400 mt-1">{hasQuiz ? "Etapa 1 — Dados Pessoais" : "Preencha o formulário para se candidatar."}</p>
          </div>
          <div className="space-y-2">
            <Label className="text-gray-300">Nome completo *</Label>
            <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Seu nome completo" className="bg-white/5 border-white/10 text-white placeholder:text-gray-500" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-gray-300">Email *</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" className="bg-white/5 border-white/10 text-white placeholder:text-gray-500" />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-300">Telefone / WhatsApp</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(00) 00000-0000" className="bg-white/5 border-white/10 text-white placeholder:text-gray-500" />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-gray-300">Instagram *</Label>
            <Input value={instagram} onChange={e => setInstagram(e.target.value)} placeholder="@seuinstagram" className="bg-white/5 border-white/10 text-white placeholder:text-gray-500" />
          </div>
          {!jobTitle && (
            <div className="space-y-2">
              <Label className="text-gray-300">Área de interesse</Label>
              <Select value={area} onValueChange={setArea}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {AREAS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {!hasQuiz && (
            <div className="space-y-2">
              <Label className="text-gray-300">Mensagem / Carta de apresentação</Label>
              <Textarea value={coverLetter} onChange={e => setCoverLetter(e.target.value)} placeholder="Conte um pouco sobre você..." rows={4} className="bg-white/5 border-white/10 text-white placeholder:text-gray-500" />
            </div>
          )}
          {hasQuiz ? (
            <Button onClick={() => setCurrentStep(1)} disabled={!canProceed} className="w-full bg-[#FF1E1E] hover:bg-[#FF1E1E]/90 text-white font-semibold py-3">
              Próxima Etapa →
            </Button>
          ) : (
            <Button onClick={() => mutation.mutate()} disabled={!canProceed || mutation.isPending} className="w-full bg-[#FF1E1E] hover:bg-[#FF1E1E]/90 text-white font-semibold py-3">
              <Send className="h-4 w-4 mr-2" />
              {mutation.isPending ? "Enviando..." : "Enviar Candidatura"}
            </Button>
          )}
        </>
      )}

      {currentStep === 1 && hasQuiz && (
        <>
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-white">Questionário — {jobTitle}</h2>
            <p className="text-sm text-gray-400 mt-1">Etapa 2 — Responda as perguntas abaixo</p>
          </div>
          <QuizSection questions={quizQuestions!} answers={quizAnswers} setAnswers={setQuizAnswers} />
          <div className="flex gap-3 pt-4">
            <Button variant="outline" onClick={() => setCurrentStep(0)} className="border-white/20 text-white hover:bg-white/5 flex-1">
              ← Voltar
            </Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="flex-1 bg-[#FF1E1E] hover:bg-[#FF1E1E]/90 text-white font-semibold py-3">
              <Send className="h-4 w-4 mr-2" />
              {mutation.isPending ? "Enviando..." : "Enviar Candidatura"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Main Page ─── */
export default function Careers() {
  const { slug } = useParams<{ slug: string }>();
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [showTalentForm, setShowTalentForm] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Resolve slug or UUID to operation
  const { data: operation } = useQuery({
    queryKey: ["careers-operation", slug],
    enabled: !!slug,
    queryFn: async () => {
      // Try by slug first, then by id (UUID)
      const { data: bySlug } = await supabase.from("operations").select("id, name, logo_url, slug").eq("slug", slug!).single();
      if (bySlug) return bySlug;
      const { data: byId } = await supabase.from("operations").select("id, name, logo_url, slug").eq("id", slug!).single();
      return byId;
    },
  });

  const operationId = operation?.id || null;

  const { data: jobs = [] } = useQuery({
    queryKey: ["careers-jobs", operationId],
    enabled: !!operationId,
    queryFn: async () => {
      const { data } = await supabase.from("talent_jobs").select("*").eq("operation_id", operationId!).eq("is_active", true).order("sort_order");
      return data ?? [];
    },
  });

  if (!slug) return <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center text-white">Página não encontrada</div>;

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <CheckCircle2 className="h-16 w-16 text-emerald-400 mx-auto" />
          <h1 className="text-2xl font-bold text-white">Candidatura Enviada!</h1>
          <p className="text-gray-400 max-w-md">Recebemos sua candidatura com sucesso. Entraremos em contato em breve.</p>
          <Button variant="outline" onClick={() => { setSubmitted(false); setSelectedJob(null); setShowTalentForm(false); }} className="border-white/20 text-white hover:bg-white/5">
            Voltar às vagas
          </Button>
        </div>
        <Toaster />
      </div>
    );
  }

  if (selectedJob || showTalentForm) {
    const quizQuestions: QuizQuestion[] = selectedJob?.quiz_questions && Array.isArray(selectedJob.quiz_questions) ? selectedJob.quiz_questions : [];
    return (
      <div className="min-h-screen bg-[#0A0A0A] py-12 px-4">
        <div className="max-w-xl mx-auto">
          <Button variant="ghost" onClick={() => { setSelectedJob(null); setShowTalentForm(false); }} className="text-gray-400 hover:text-white mb-6">← Voltar</Button>
          <ApplicationForm
            operationId={operationId}
            jobId={selectedJob?.id}
            jobTitle={selectedJob?.title}
            quizQuestions={quizQuestions}
            onSuccess={() => setSubmitted(true)}
          />
        </div>
        <Toaster />
      </div>
    );
  }

  const AREA_ICONS: Record<string, any> = {
    "Copywriter": PenTool,
    "Editor de VSL": FileEdit,
    "Media Buyer": Megaphone,
    "Designer": LayoutGrid,
    "Desenvolvedor": Code,
    "Gestor de Tráfego": Megaphone,
    "Atendimento": Headphones,
    "Financeiro": DollarSign,
    "Outro": Briefcase,
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      {/* Hero */}
      <div className="px-6 pt-16 pb-14 text-center">
        {operation?.logo_url && (
          <img src={operation.logo_url} alt={operation.name} className="h-16 sm:h-20 mx-auto mb-8 object-contain" />
        )}
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-black text-white leading-tight tracking-tight">
          Vagas Abertas —
          <br />
          <span className="text-white">{operation?.name || "Operação"}</span>
        </h1>
        <div className="w-20 h-1 bg-[#FF1E1E] mx-auto mt-6" />
        <p className="text-[#FF1E1E] font-semibold mt-8 text-lg sm:text-xl">
          Operação de Direct Response
        </p>
        <p className="text-gray-400 mt-4 max-w-sm mx-auto text-sm sm:text-base leading-relaxed">
          Atualizamos oportunidades regularmente.
          <br />
          Candidate-se ou entre no banco de talentos.
        </p>
      </div>

      {/* Jobs */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pb-6 space-y-5">
        {jobs.map((job: any) => {
          const IconComp = AREA_ICONS[job.area] || Briefcase;
          const modelLabel = job.work_model === "remoto" ? "Remoto" : job.work_model === "presencial" ? "Presencial" : "Híbrido";
          return (
            <div key={job.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8 space-y-4 hover:border-[#FF1E1E]/30 transition-colors">
              <div className="flex items-start justify-between">
                <div className="p-2.5 rounded-xl bg-[#FF1E1E]/10 text-[#FF1E1E]">
                  <IconComp className="h-6 w-6" />
                </div>
                <span className="px-4 py-1.5 rounded-full bg-[#3A1520] text-[#E8B4C0] text-sm font-medium">
                  {modelLabel}
                </span>
              </div>
              <div>
                <h3 className="text-xl sm:text-2xl font-bold text-white">{job.title}</h3>
                {job.description && <p className="text-gray-400 mt-2 text-sm sm:text-base leading-relaxed">{job.description}</p>}
              </div>
              <Button
                onClick={() => setSelectedJob(job)}
                className="w-full py-4 text-base font-semibold rounded-xl bg-[#FF1E1E] hover:bg-[#FF1E1E]/90 text-white"
              >
                Candidatar-se →
              </Button>
            </div>
          );
        })}

        {jobs.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <Briefcase className="h-14 w-14 mx-auto mb-4 opacity-30" />
            <p className="text-lg">Nenhuma vaga aberta no momento.</p>
          </div>
        )}
      </div>

      {/* Talent Bank CTA — burgundy section */}
      <div className="mx-4 sm:mx-6 max-w-2xl lg:mx-auto my-10 rounded-3xl bg-gradient-to-b from-[#3A1520] to-[#2A0F18] px-6 sm:px-10 py-14 text-center space-y-5">
        <h2 className="text-2xl sm:text-3xl font-black text-[#E8B4C0] leading-tight">
          Não encontrou sua vaga ideal?
        </h2>
        <p className="text-[#C09AA5] text-sm sm:text-base max-w-md mx-auto leading-relaxed">
          Cadastre-se em nosso banco de talentos e seja notificado sobre novas oportunidades.
        </p>
        <Button
          onClick={() => setShowTalentForm(true)}
          variant="outline"
          className="px-8 py-4 text-base font-semibold rounded-xl border-[#E8B4C0]/40 text-[#E8B4C0] hover:bg-[#E8B4C0]/10 hover:border-[#E8B4C0]/60"
        >
          Entrar no banco de talentos →
        </Button>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/5 py-6 text-center text-xs text-gray-600">
        © {new Date().getFullYear()} {operation?.name || "Operação"} — Todos os direitos reservados.
      </footer>
      <Toaster />
    </div>
  );
}
