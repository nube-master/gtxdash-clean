import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  useAcademyCourses, useAcademyModules, useUserProgress,
  useAllAcademyModules, useAllAcademyLessons,
  useCreateCourse, useUpdateCourse, useDeleteCourse, useCreateModule, useDeleteModule,
  useCreateLesson, useUpdateLesson, useDeleteLesson, useToggleLessonComplete,
  useLessonComments, useAddComment,
} from "@/hooks/useAcademyData";
import { useAuth } from "@/contexts/AuthContext";
import {
  BookOpen, Play, ChevronRight, ChevronDown, CheckSquare, FileText, Video, Plus, Trash2,
  CheckCircle2, Circle as CircleIcon, MessageSquare, ExternalLink, GraduationCap, Send,
  Layers, ArrowLeft, Trophy, Lock, ImageIcon, Pencil, Upload, Loader2, Download, Paperclip, X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";

function isDirectVideo(url: string): boolean {
  if (!url) return false;
  if (url.includes("supabase") && url.includes("/storage/")) return true;
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase();
  return ["mp4", "webm", "mov", "ogg", "mkv", "avi"].includes(ext || "");
}

function toEmbedUrl(url: string): string {
  try {
    const u = new URL(url);
    if ((u.hostname === "www.youtube.com" || u.hostname === "youtube.com") && u.pathname === "/watch") {
      const v = u.searchParams.get("v");
      if (v) return `https://www.youtube.com/embed/${v}`;
    }
    if (u.hostname === "youtu.be") {
      return `https://www.youtube.com/embed${u.pathname}`;
    }
    return url;
  } catch {
    return url;
  }
}

// ── Video Upload Helper ──
function VideoUploadField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [tab, setTab] = useState<"upload" | "url">(value && !isDirectVideo(value) ? "url" : "upload");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) { input.value = ""; return; }

    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const validExts = ["mp4", "webm", "mov", "mkv", "avi", "ogg", "wmv", "flv"];

    if (!file.type.startsWith("video/") && !validExts.includes(ext)) {
      toast.error("Formato inválido. Use MP4, WebM, MOV, MKV ou AVI.");
      input.value = ""; return;
    }

    if (file.size > 200 * 1024 * 1024) {
      toast.error("Vídeo deve ter no máximo 200MB");
      input.value = ""; return;
    }

    setUploading(true);
    setUploadProgress(0);

    let interval: ReturnType<typeof setInterval> | null = null;
    try {
      const uploadExt = ext || "mp4";
      const path = `lessons/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${uploadExt}`;

      interval = setInterval(() => {
        setUploadProgress((p) => Math.min(p + 5, 90));
      }, 600);

      const { error } = await supabase.storage.from("academy-videos").upload(path, file, { upsert: true });
      if (error) throw new Error(`Erro ao enviar vídeo: ${error.message}`);

      const { data: urlData } = supabase.storage.from("academy-videos").getPublicUrl(path);
      setUploadProgress(100);
      onChange(urlData.publicUrl);
      toast.success("Vídeo enviado com sucesso!");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao enviar vídeo");
    } finally {
      if (interval) clearInterval(interval);
      setUploading(false);
      setUploadProgress(0);
      input.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs">Vídeo da aula</Label>
      <div className="flex gap-1 rounded-lg bg-muted/20 p-1">
        <button type="button" onClick={() => setTab("upload")} className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${tab === "upload" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          📁 Upload Direto
        </button>
        <button type="button" onClick={() => setTab("url")} className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${tab === "url" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          🔗 Colar URL
        </button>
      </div>

      {tab === "upload" ? (
        <div>
          {value && isDirectVideo(value) && !uploading ? (
            <div className="space-y-2">
              <div className="rounded-lg border border-border/30 bg-card/40 p-3 flex items-center gap-3">
                <Video className="h-5 w-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">Vídeo enviado ✓</p>
                  <p className="text-[10px] text-muted-foreground truncate">{value.split("/").pop()}</p>
                </div>
                <Button type="button" variant="ghost" size="sm" className="text-xs h-7" onClick={() => onChange("")}>Trocar</Button>
              </div>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border/40 bg-muted/10 p-6 cursor-pointer hover:border-primary/40 hover:bg-muted/20 transition-colors">
              {uploading ? (
                <>
                  <Loader2 className="h-8 w-8 text-primary animate-spin" />
                  <span className="text-xs text-muted-foreground text-center">Enviando... {uploadProgress}%</span>
                  <Progress value={uploadProgress} className="w-40 h-1.5" />
                </>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground/50" />
                  <span className="text-xs text-muted-foreground text-center">Clique para enviar vídeo<br/>MP4, MKV, WebM, MOV, AVI • max 200MB</span>
                </>
              )}
              <input type="file" accept="video/*" className="hidden" onChange={handleFileUpload} disabled={uploading} />
            </label>
          )}
        </div>
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://youtube.com/watch?v=... ou URL direta" className="text-xs" />
      )}
    </div>
  );
}

// ── Attachment Types & Hooks ──
type LessonAttachment = {
  id: string;
  lesson_id: string;
  file_name: string;
  file_url: string;
  file_size: number;
  file_type: string;
  sort_order: number;
  uploaded_by: string;
  created_at: string;
};

function useLessonAttachments(lessonId?: string) {
  return useQuery({
    queryKey: ["academy-attachments", lessonId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("academy_lesson_attachments")
        .select("*")
        .eq("lesson_id", lessonId!)
        .order("sort_order");
      if (error) throw error;
      return data as LessonAttachment[];
    },
    enabled: !!lessonId,
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(type: string): string {
  if (type.startsWith("image/")) return "🖼️";
  if (type === "application/pdf") return "📄";
  if (type.includes("spreadsheet") || type.includes("excel") || type.includes("csv")) return "📊";
  if (type.includes("presentation") || type.includes("powerpoint")) return "📑";
  if (type.includes("word") || type.includes("document")) return "📝";
  if (type.includes("zip") || type.includes("rar") || type.includes("compressed")) return "📦";
  return "📎";
}



function AcademyVideoPlayer({ src }: { src: string }) {
  const [videoError, setVideoError] = useState<string | null>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const playWatchdogRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setVideoError(null);
    // cleanup watchdog on src change
    if (playWatchdogRef.current) { clearTimeout(playWatchdogRef.current); playWatchdogRef.current = null; }
  }, [src]);

  // Detect black-screen: user clicks play but no frames decode (H.265 issue)
  const handlePlay = () => {
    if (playWatchdogRef.current) clearTimeout(playWatchdogRef.current);
    playWatchdogRef.current = setTimeout(() => {
      const vid = videoRef.current;
      if (!vid) return;
      // If currentTime hasn't moved after 4s of "playing", codec is broken
      if (vid.currentTime < 0.1 && !vid.paused) {
        setVideoError(
          "O vídeo carregou mas não consegue reproduzir (codec incompatível, provavelmente H.265/HEVC). Exporte em MP4 (H.264 + AAC) e reenvie."
        );
      }
    }, 4000);
  };

  const handleTimeUpdate = () => {
    // Video is actually playing — cancel watchdog
    if (playWatchdogRef.current) { clearTimeout(playWatchdogRef.current); playWatchdogRef.current = null; }
  };

  useEffect(() => {
    return () => { if (playWatchdogRef.current) clearTimeout(playWatchdogRef.current); };
  }, []);

  if (!isDirectVideo(src)) {
    return (
      <div className="aspect-video bg-black rounded-xl overflow-hidden mb-8 shadow-lg academy-video-wrapper">
        <iframe src={toEmbedUrl(src)} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
      </div>
    );
  }

  return (
    <div className="aspect-video bg-black rounded-xl overflow-hidden mb-8 shadow-lg academy-video-wrapper relative">
      {!videoError ? (
        <video
          ref={videoRef}
          key={src}
          controls
          playsInline
          preload="auto"
          className="w-full h-full object-contain"
          onPlay={handlePlay}
          onTimeUpdate={handleTimeUpdate}
          onError={() => {
            setVideoError(
              "Não foi possível reproduzir este vídeo. O formato pode ser incompatível com o navegador. Exporte em MP4 (H.264 + AAC) e reenvie."
            );
          }}
        >
          <source src={src} type={inferMimeType(src)} />
        </video>
      ) : (
        <div className="flex items-center justify-center h-full">
          <div className="text-center px-8 max-w-md">
            <Video className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-white/80 mb-2">{videoError}</p>
            <p className="text-xs text-white/50">
              Dica: Use o{" "}
              <a href="https://handbrake.fr/" target="_blank" rel="noopener noreferrer" className="underline text-primary/80 hover:text-primary">
                HandBrake
              </a>{" "}
              (gratuito) para converter qualquer vídeo para MP4 H.264.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function inferMimeType(url: string): string {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase();
  switch (ext) {
    case "webm": return "video/webm";
    case "mov": return "video/quicktime";
    case "mkv": return "video/x-matroska";
    case "ogg": case "ogv": return "video/ogg";
    case "avi": return "video/x-msvideo";
    default: return "video/mp4";
  }
}
// ── Attachment Upload Field (for admin dialogs) ──
function AttachmentUploadField({ lessonId }: { lessonId: string }) {
  const qc = useQueryClient();
  const { data: attachments, isLoading } = useLessonAttachments(lessonId);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const maxSize = 50 * 1024 * 1024; // 50MB per file

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error("Não autenticado"); return; }

    setUploading(true);
    for (const file of Array.from(files)) {
      if (file.size > maxSize) { toast.error(`${file.name} excede 50MB`); continue; }

      const ext = file.name.split(".").pop() || "bin";
      const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
      const path = `lessons/${lessonId}/${safeName}`;

      const { error: upErr } = await supabase.storage.from("academy-attachments").upload(path, file, { upsert: true });
      if (upErr) { toast.error(`Erro ao enviar ${file.name}`); continue; }

      const { data: urlData } = supabase.storage.from("academy-attachments").getPublicUrl(path);

      const { error: dbErr } = await (supabase as any).from("academy_lesson_attachments").insert({
        lesson_id: lessonId,
        file_name: file.name,
        file_url: urlData.publicUrl,
        file_size: file.size,
        file_type: file.type || "application/octet-stream",
        uploaded_by: user.id,
        sort_order: (attachments?.length ?? 0),
      });
      if (dbErr) { toast.error(`Erro ao salvar ${file.name}`); continue; }
    }
    qc.invalidateQueries({ queryKey: ["academy-attachments", lessonId] });
    setUploading(false);
    toast.success("Arquivo(s) anexado(s)!");
    e.target.value = "";
  };

  const handleDelete = async (att: LessonAttachment) => {
    // Extract storage path from URL
    const urlParts = att.file_url.split("/academy-attachments/");
    if (urlParts[1]) {
      await supabase.storage.from("academy-attachments").remove([decodeURIComponent(urlParts[1])]);
    }
    await (supabase as any).from("academy_lesson_attachments").delete().eq("id", att.id);
    qc.invalidateQueries({ queryKey: ["academy-attachments", lessonId] });
    toast.success("Anexo removido");
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs flex items-center gap-1.5"><Paperclip className="h-3.5 w-3.5" /> Anexos da aula</Label>

      {/* Existing attachments */}
      {!isLoading && attachments && attachments.length > 0 && (
        <div className="space-y-1.5">
          {attachments.map((att) => (
            <div key={att.id} className="flex items-center gap-2 rounded-lg border border-border/30 bg-card/40 px-3 py-2">
              <span className="text-sm">{getFileIcon(att.file_type)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{att.file_name}</p>
                <p className="text-[10px] text-muted-foreground">{formatFileSize(att.file_size)}</p>
              </div>
              <button type="button" onClick={() => handleDelete(att)} className="text-muted-foreground hover:text-destructive transition-colors p-1">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload area */}
      <label className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border/40 bg-muted/10 p-4 cursor-pointer hover:border-primary/40 hover:bg-muted/20 transition-colors">
        {uploading ? (
          <><Loader2 className="h-4 w-4 text-primary animate-spin" /><span className="text-xs text-muted-foreground">Enviando...</span></>
        ) : (
          <><Paperclip className="h-4 w-4 text-muted-foreground/50" /><span className="text-xs text-muted-foreground">Clique para anexar arquivos • max 50MB cada</span></>
        )}
        <input type="file" multiple className="hidden" onChange={handleUpload} disabled={uploading} />
      </label>
    </div>
  );
}

// ── Attachment Display (for lesson view) ──
function LessonAttachmentsDisplay({ lessonId }: { lessonId: string }) {
  const { data: attachments, isLoading } = useLessonAttachments(lessonId);

  if (isLoading || !attachments?.length) return null;

  return (
    <div className="mb-8 rounded-xl border border-border/30 bg-card/40 p-6">
      <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
        <Download className="h-4 w-4 text-primary" /> Anexos para Download
      </h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {attachments.map((att) => (
          <a
            key={att.id}
            href={att.file_url}
            target="_blank"
            rel="noopener noreferrer"
            download={att.file_name}
            className="flex items-center gap-3 rounded-lg border border-border/20 bg-background/50 px-4 py-3 hover:border-primary/30 hover:bg-primary/5 transition-all group"
          >
            <span className="text-lg">{getFileIcon(att.file_type)}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">{att.file_name}</p>
              <p className="text-[10px] text-muted-foreground">{formatFileSize(att.file_size)}</p>
            </div>
            <Download className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
          </a>
        ))}
      </div>
    </div>
  );
}

// ── Create Dialogs ──

function CreateCourseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const create = useCreateCourse();
  const handleSubmit = () => {
    if (!title.trim()) return;
    create.mutate({ title: title.trim(), description: description.trim(), cover_url: coverUrl.trim() }, {
      onSuccess: () => { setTitle(""); setDescription(""); setCoverUrl(""); onOpenChange(false); },
    });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Criar Jornada</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label className="text-xs">Nome da jornada</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Meta Ads" className="mt-1" /></div>
          <div><Label className="text-xs">Descrição</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Estrutura completa de tráfego..." className="mt-1" rows={3} /></div>
          <div>
            <Label className="text-xs">URL da capa (opcional)</Label>
            <Input value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} placeholder="https://exemplo.com/capa.jpg" className="mt-1" />
            {coverUrl && (
              <div className="mt-2 rounded-lg overflow-hidden aspect-video bg-muted/20">
                <img src={coverUrl} alt="Preview" className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
              </div>
            )}
          </div>
          <Button onClick={handleSubmit} disabled={!title.trim() || create.isPending} className="w-full">{create.isPending ? "Criando..." : "Criar Jornada"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditCoverDialog({ open, onOpenChange, course }: { open: boolean; onOpenChange: (o: boolean) => void; course: { id: string; title: string; cover_url: string } }) {
  const [coverUrl, setCoverUrl] = useState(course.cover_url || "");
  const [tab, setTab] = useState<"upload" | "url">("upload");
  const [uploading, setUploading] = useState(false);
  const [previewSrc, setPreviewSrc] = useState(course.cover_url || "");
  const update = useUpdateCourse();

  useEffect(() => {
    if (open) {
      setCoverUrl(course.cover_url || "");
      setPreviewSrc(course.cover_url || "");
      setTab("upload");
    }
  }, [open, course.cover_url]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Selecione uma imagem JPG ou PNG"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Imagem deve ter no máximo 5MB"); return; }

    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `covers/${course.id}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("academy-covers").upload(path, file, { upsert: true });
    if (error) { toast.error("Erro ao enviar imagem"); setUploading(false); return; }

    const { data: urlData } = supabase.storage.from("academy-covers").getPublicUrl(path);
    const publicUrl = urlData.publicUrl;
    setCoverUrl(publicUrl);
    setPreviewSrc(publicUrl);
    setUploading(false);
    toast.success("Imagem enviada!");
  };

  const handleSubmit = () => {
    update.mutate({ id: course.id, cover_url: coverUrl.trim() }, {
      onSuccess: () => onOpenChange(false),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Editar Capa — {course.title}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-border/30 bg-muted/10 p-3">
            <p className="text-[11px] font-medium text-muted-foreground mb-1">📐 Dimensão recomendada</p>
            <p className="text-xs text-foreground font-mono">1280 × 720 px (16:9) • JPG ou PNG</p>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 rounded-lg bg-muted/20 p-1">
            <button onClick={() => setTab("upload")} className={`flex-1 text-xs font-medium py-2 rounded-md transition-colors ${tab === "upload" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              📁 Enviar Arquivo
            </button>
            <button onClick={() => setTab("url")} className={`flex-1 text-xs font-medium py-2 rounded-md transition-colors ${tab === "url" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              🔗 Colar URL
            </button>
          </div>

          {tab === "upload" ? (
            <div>
              <Label className="text-xs">Selecionar imagem do computador</Label>
              <label className="mt-1 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border/40 bg-muted/10 p-6 cursor-pointer hover:border-primary/40 hover:bg-muted/20 transition-colors">
                <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
                <span className="text-xs text-muted-foreground">{uploading ? "Enviando..." : "Clique para selecionar • JPG ou PNG • max 5MB"}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileUpload} disabled={uploading} />
              </label>
            </div>
          ) : (
            <div>
              <Label className="text-xs">URL da imagem de capa</Label>
              <Input value={coverUrl} onChange={(e) => { setCoverUrl(e.target.value); setPreviewSrc(e.target.value); }} placeholder="https://exemplo.com/capa.jpg" className="mt-1" />
            </div>
          )}

          {previewSrc && (
            <div className="rounded-lg overflow-hidden aspect-video bg-muted/20 border border-border/20">
              <img src={previewSrc} alt="Preview" className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
            </div>
          )}

          <Button onClick={handleSubmit} disabled={update.isPending || !coverUrl.trim()} className="w-full">{update.isPending ? "Salvando..." : "Salvar Capa"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateModuleDialog({ open, onOpenChange, courseId }: { open: boolean; onOpenChange: (o: boolean) => void; courseId: string }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const create = useCreateModule();
  const handleSubmit = () => {
    if (!title.trim()) return;
    create.mutate({ title: title.trim(), description: description.trim(), course_id: courseId }, {
      onSuccess: () => { setTitle(""); setDescription(""); onOpenChange(false); },
    });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Criar Módulo</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label className="text-xs">Nome do módulo</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Estrutura de Contas" className="mt-1" /></div>
          <div><Label className="text-xs">Descrição</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1" rows={2} /></div>
          <Button onClick={handleSubmit} disabled={!title.trim() || create.isPending} className="w-full">{create.isPending ? "Criando..." : "Criar Módulo"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateLessonDialog({ open, onOpenChange, moduleId }: { open: boolean; onOpenChange: (o: boolean) => void; moduleId: string }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [content, setContent] = useState("");
  const [checklistText, setChecklistText] = useState("");
  const [linksText, setLinksText] = useState("");
  const create = useCreateLesson();
  const handleSubmit = () => {
    if (!title.trim()) return;
    const checklist = checklistText.split("\n").map((l) => l.trim()).filter(Boolean);
    const links = linksText.split("\n").map((l) => {
      const [label, url] = l.split("|").map((s) => s.trim());
      return label && url ? { label, url } : null;
    }).filter(Boolean) as { label: string; url: string }[];
    create.mutate({ module_id: moduleId, title: title.trim(), description: description.trim(), video_url: videoUrl.trim(), content: content.trim(), checklist, links }, {
      onSuccess: () => { setTitle(""); setDescription(""); setVideoUrl(""); setContent(""); setChecklistText(""); setLinksText(""); onOpenChange(false); },
    });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Adicionar Aula</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label className="text-xs">Título</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título da aula" className="mt-1" /></div>
          <VideoUploadField value={videoUrl} onChange={setVideoUrl} />
          <div><Label className="text-xs">Descrição</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1" rows={2} /></div>
          <div><Label className="text-xs">Checklist (um item por linha)</Label><Textarea value={checklistText} onChange={(e) => setChecklistText(e.target.value)} placeholder={"Assistir ao vídeo\nFazer exercício"} className="mt-1 font-mono text-xs" rows={3} /></div>
          <div><Label className="text-xs">Links (formato: Nome|URL, um por linha)</Label><Textarea value={linksText} onChange={(e) => setLinksText(e.target.value)} placeholder={"Documento|https://...\nPlanilha|https://..."} className="mt-1 font-mono text-xs" rows={3} /></div>
          <div><Label className="text-xs">Documentação / Conteúdo</Label><Textarea value={content} onChange={(e) => setContent(e.target.value)} className="mt-1" rows={4} /></div>
          <Button onClick={handleSubmit} disabled={!title.trim() || create.isPending} className="w-full">{create.isPending ? "Criando..." : "Adicionar Aula"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditLessonDialog({ open, onOpenChange, lesson }: { open: boolean; onOpenChange: (o: boolean) => void; lesson: any }) {
  const [title, setTitle] = useState(lesson.title || "");
  const [description, setDescription] = useState(lesson.description || "");
  const [videoUrl, setVideoUrl] = useState(lesson.video_url || "");
  const [content, setContent] = useState(lesson.content || "");
  const [checklistText, setChecklistText] = useState(
    Array.isArray(lesson.checklist) ? (lesson.checklist as string[]).join("\n") : ""
  );
  const [linksText, setLinksText] = useState(
    Array.isArray(lesson.links) ? (lesson.links as { label: string; url: string }[]).map((l: any) => `${l.label}|${l.url}`).join("\n") : ""
  );
  const update = useUpdateLesson();

  useEffect(() => {
    if (open) {
      setTitle(lesson.title || "");
      setDescription(lesson.description || "");
      setVideoUrl(lesson.video_url || "");
      setContent(lesson.content || "");
      setChecklistText(Array.isArray(lesson.checklist) ? (lesson.checklist as string[]).join("\n") : "");
      setLinksText(Array.isArray(lesson.links) ? (lesson.links as { label: string; url: string }[]).map((l: any) => `${l.label}|${l.url}`).join("\n") : "");
    }
  }, [open, lesson]);

  const handleSubmit = () => {
    if (!title.trim()) return;
    const checklist = checklistText.split("\n").map((l) => l.trim()).filter(Boolean);
    const links = linksText.split("\n").map((l) => {
      const [label, url] = l.split("|").map((s) => s.trim());
      return label && url ? { label, url } : null;
    }).filter(Boolean) as { label: string; url: string }[];
    update.mutate({
      id: lesson.id,
      title: title.trim(),
      description: description.trim(),
      video_url: videoUrl.trim(),
      content: content.trim(),
      checklist,
      links,
    }, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Editar Aula</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label className="text-xs">Título</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" /></div>
          <VideoUploadField value={videoUrl} onChange={setVideoUrl} />
          <div><Label className="text-xs">Descrição</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1" rows={2} /></div>
          <div><Label className="text-xs">Checklist (um item por linha)</Label><Textarea value={checklistText} onChange={(e) => setChecklistText(e.target.value)} className="mt-1 font-mono text-xs" rows={3} /></div>
          <div><Label className="text-xs">Links (formato: Nome|URL, um por linha)</Label><Textarea value={linksText} onChange={(e) => setLinksText(e.target.value)} className="mt-1 font-mono text-xs" rows={3} /></div>
          <div><Label className="text-xs">Documentação / Conteúdo</Label><Textarea value={content} onChange={(e) => setContent(e.target.value)} className="mt-1" rows={4} /></div>
          <AttachmentUploadField lessonId={lesson.id} />
          <Button onClick={handleSubmit} disabled={!title.trim() || update.isPending} className="w-full">{update.isPending ? "Salvando..." : "Salvar Alterações"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Comments ──

function CommentsSection({ lessonId }: { lessonId: string }) {
  const { data: comments, isLoading } = useLessonComments(lessonId);
  const addComment = useAddComment();
  const [text, setText] = useState("");
  const handleSend = () => {
    if (!text.trim()) return;
    addComment.mutate({ lesson_id: lessonId, content: text.trim() }, { onSuccess: () => setText("") });
  };
  return (
    <div className="mt-10 pt-8 border-t border-border/20">
      <h4 className="text-base font-semibold text-foreground mb-5 flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-muted-foreground" /> Comentários
      </h4>
      <div className="space-y-4 mb-5">
        {isLoading && <Skeleton className="h-16" />}
        {comments?.map((c) => (
          <div key={c.id} className="flex gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-[11px] font-bold text-primary">{c.user_name.charAt(0).toUpperCase()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className="text-sm font-medium text-foreground">{c.user_name}</span>
                <span className="text-[11px] text-muted-foreground">{new Date(c.created_at).toLocaleDateString("pt-BR")} às {new Date(c.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed">{c.content}</p>
            </div>
          </div>
        ))}
        {!isLoading && !comments?.length && <p className="text-sm text-muted-foreground">Nenhum comentário ainda.</p>}
      </div>
      <div className="flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Escrever um comentário..." className="text-sm" onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()} />
        <Button size="sm" onClick={handleSend} disabled={!text.trim() || addComment.isPending} className="shrink-0 px-4">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// Helper
function useCourseLessonsInline(moduleIds: string[]) {
  return useQuery({
    queryKey: ["academy-lessons-course-inline", moduleIds.join(",")],
    queryFn: async () => {
      if (!moduleIds.length) return [];
      const { data, error } = await (supabase as any)
        .from("academy_lessons").select("*").in("module_id", moduleIds).order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: moduleIds.length > 0,
  });
}

// ── Course View (Circle-inspired) ──

function CourseView({ courseId, onBack }: { courseId: string; onBack: () => void }) {
  const { isAdmin, displayName } = useAuth();
  const { data: courses } = useAcademyCourses();
  const { data: modules, isLoading: loadingModules } = useAcademyModules(courseId);
  const { data: progress } = useUserProgress();
  const toggleComplete = useToggleLessonComplete();
  const deleteModule = useDeleteModule();
  const deleteLesson = useDeleteLesson();

  const [showCreateModule, setShowCreateModule] = useState(false);
  const [createLessonForModule, setCreateLessonForModule] = useState<string | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [mobileLessonOpen, setMobileLessonOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState<any>(null);

  const course = courses?.find((c) => c.id === courseId);
  const moduleIds = modules?.map((m) => m.id) ?? [];
  const { data: allLessons } = useCourseLessonsInline(moduleIds);
  const completedIds = new Set(progress?.filter((p) => p.completed).map((p) => p.lesson_id) ?? []);
  const totalLessons = allLessons?.length ?? 0;
  const completedCount = allLessons?.filter((l: any) => completedIds.has(l.id)).length ?? 0;
  const pct = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;
  const firstName = displayName?.split(" ")[0] || "aluno";

  const lesson = allLessons?.find((l: any) => l.id === selectedLessonId);
  const checklist = lesson?.checklist as string[] | null;
  const links = lesson?.links as { label: string; url: string }[] | null;
  const lessons = allLessons ?? [];

  // Auto-expand first module on load
  useEffect(() => {
    if (modules?.length && expandedModules.size === 0) {
      setExpandedModules(new Set([modules[0].id]));
    }
  }, [modules]);

  const toggleModule = (modId: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      if (next.has(modId)) next.delete(modId); else next.add(modId);
      return next;
    });
  };

  const selectLesson = (id: string) => {
    setSelectedLessonId(id);
    setMobileLessonOpen(true);
  };

  // Next/prev
  const currentIndex = lessons.findIndex((l: any) => l.id === selectedLessonId);
  const nextLesson = currentIndex >= 0 && currentIndex < lessons.length - 1 ? lessons[currentIndex + 1] : null;
  const prevLesson = currentIndex > 0 ? lessons[currentIndex - 1] : null;

  // Lesson content renderer
  const renderLessonContent = () => {
    if (!lesson) {
      return (
        <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-4">
          <div className="h-16 w-16 rounded-full bg-muted/20 flex items-center justify-center">
            <Play className="h-7 w-7 text-muted-foreground/30" />
          </div>
          <p className="text-base font-medium text-foreground">Selecione uma aula</p>
          <p className="text-sm text-muted-foreground max-w-xs text-center">Escolha um módulo e aula na barra lateral para começar a estudar</p>
        </div>
      );
    }

    return (
      <motion.div key={lesson.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
        {/* Video */}
        {lesson.video_url && (
          <AcademyVideoPlayer src={lesson.video_url} />
        )}

        {/* Title area */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground tracking-tight mb-2">{lesson.title}</h1>
          {lesson.description && (
            <p className="text-base text-muted-foreground leading-relaxed">{lesson.description}</p>
          )}
        </div>

        {/* Checklist */}
        {checklist && checklist.length > 0 && (
          <div className="mb-8 rounded-xl border border-border/30 bg-card/40 p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-primary" /> Checklist Operacional
            </h3>
            <ul className="space-y-3">
              {checklist.map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-foreground/90">
                  <div className="h-5 w-5 rounded border border-border/40 shrink-0 mt-0.5 flex items-center justify-center text-[10px] text-muted-foreground font-medium">{i + 1}</div>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Links */}
        {links && links.length > 0 && (
          <div className="mb-8 rounded-xl border border-border/30 bg-card/40 p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <ExternalLink className="h-4 w-4 text-primary" /> Materiais de Apoio
            </h3>
            <div className="flex flex-wrap gap-2">
              {links.map((link, i) => (
                <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-primary hover:underline bg-primary/5 rounded-lg px-4 py-2 font-medium transition-colors">
                  <ExternalLink className="h-3.5 w-3.5" /> {link.label}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Attachments (downloads) */}
        <LessonAttachmentsDisplay lessonId={lesson.id} />

        {/* Content / Documentation */}
        {lesson.content && (
          <div className="mb-8 rounded-xl border border-border/30 bg-card/40 p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" /> Documentação
            </h3>
            <div className="text-sm text-foreground/85 whitespace-pre-wrap leading-relaxed">{lesson.content}</div>
          </div>
        )}

        {/* Complete button */}
        <div className="flex items-center justify-between py-6 border-t border-b border-border/20 mb-6">
          <div className="text-sm text-muted-foreground">
            {completedIds.has(lesson.id) ? "Aula concluída ✓" : "Marcar esta aula como concluída"}
          </div>
          <Button
            onClick={() => toggleComplete.mutate(lesson.id)}
            disabled={toggleComplete.isPending}
            variant={completedIds.has(lesson.id) ? "default" : "outline"}
            className={`gap-2 ${completedIds.has(lesson.id) ? "bg-emerald-600 hover:bg-emerald-700 border-emerald-600 text-white" : ""}`}
          >
            {completedIds.has(lesson.id) ? <><CheckCircle2 className="h-4 w-4" /> Concluída</> : <><CircleIcon className="h-4 w-4" /> Concluir aula</>}
          </Button>
        </div>

        {/* Next/Prev navigation */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          {prevLesson ? (
            <button
              onClick={() => selectLesson(prevLesson.id)}
              className="flex flex-col items-start p-4 rounded-xl border border-border/20 hover:border-border/40 hover:bg-accent/5 transition-all text-left group"
            >
              <span className="text-[11px] text-muted-foreground mb-1 flex items-center gap-1">
                <ArrowLeft className="h-3 w-3" /> Anterior
              </span>
              <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate w-full">{prevLesson.title}</span>
            </button>
          ) : <div />}
          {nextLesson ? (
            <button
              onClick={() => selectLesson(nextLesson.id)}
              className="flex flex-col items-end p-4 rounded-xl border border-border/20 hover:border-border/40 hover:bg-accent/5 transition-all text-right group col-start-2"
            >
              <span className="text-[11px] text-muted-foreground mb-1 flex items-center gap-1">
                Próxima <ChevronRight className="h-3 w-3" />
              </span>
              <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate w-full">{nextLesson.title}</span>
            </button>
          ) : <div />}
        </div>

        <CommentsSection lessonId={lesson.id} />
      </motion.div>
    );
  };

  return (
    <div className="flex flex-col h-full -mx-4 sm:-mx-6 -mt-4">
      <CreateModuleDialog open={showCreateModule} onOpenChange={setShowCreateModule} courseId={courseId} />
      {createLessonForModule && (
        <CreateLessonDialog open={!!createLessonForModule} onOpenChange={(o) => !o && setCreateLessonForModule(null)} moduleId={createLessonForModule} />
      )}
      {editingLesson && (
        <EditLessonDialog open={!!editingLesson} onOpenChange={(o) => !o && setEditingLesson(null)} lesson={editingLesson} />
      )}

      <div className="flex items-center justify-between px-5 py-3 border-b border-border/20 bg-background/80 backdrop-blur-sm sticky top-0 z-20 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground truncate">{course?.title}</h2>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {isAdmin && (
            <Button onClick={() => setShowCreateModule(true)} size="sm" variant="ghost" className="gap-1.5 text-xs h-8">
              <Plus className="h-3.5 w-3.5" /> Módulo
            </Button>
          )}
          <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
            <Progress value={pct} className="w-24 h-1.5" />
            <span className="font-medium text-foreground tabular-nums">{completedCount}/{totalLessons}</span>
          </div>
        </div>
      </div>

      {/* ── Split layout ── */}
      <div className="flex flex-1 min-h-0">

        {/* LEFT: Curriculum sidebar */}
        <div className="w-full lg:w-[320px] xl:w-[340px] shrink-0 border-r border-border/15 bg-background flex flex-col">
          {/* Welcome card */}
          <div className="p-5 border-b border-border/15">
            <p className="text-sm text-muted-foreground">Olá, <span className="font-medium text-foreground">{firstName}</span> 👋</p>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground">Progresso da jornada</span>
                  <span className="text-xs font-semibold text-foreground">{pct}%</span>
                </div>
                <Progress value={pct} className="h-2" />
              </div>
            </div>
            {pct === 100 && totalLessons > 0 && (
              <div className="flex items-center gap-1.5 mt-2.5 text-xs font-medium text-emerald-500">
                <Trophy className="h-3.5 w-3.5" /> Jornada completa!
              </div>
            )}
          </div>

          {/* Module list */}
          <ScrollArea className="flex-1">
            <div className="py-2">
              {loadingModules ? (
                <div className="px-4 space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 rounded-lg" />)}</div>
              ) : !modules?.length ? (
                <div className="text-center py-16 px-6">
                  <Layers className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">{isAdmin ? "Adicione o primeiro módulo." : "Sem módulos."}</p>
                </div>
              ) : (
                modules.map((mod, mi) => {
                  const modLessons = (allLessons ?? []).filter((l: any) => l.module_id === mod.id);
                  const modCompleted = modLessons.filter((l: any) => completedIds.has(l.id)).length;
                  const allDone = modLessons.length > 0 && modCompleted === modLessons.length;
                  const isExpanded = expandedModules.has(mod.id);

                  return (
                    <div key={mod.id}>
                      {/* Section header - Circle style */}
                      <button
                        onClick={() => toggleModule(mod.id)}
                        className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-accent/5 transition-colors"
                      >
                        <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground/50 transition-transform duration-200 shrink-0 ${isExpanded ? "rotate-90" : ""}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Seção {mi + 1}
                            </span>
                            {allDone && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                          </div>
                          <p className="text-sm font-medium text-foreground truncate mt-0.5">{mod.title}</p>
                        </div>
                        <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{modCompleted}/{modLessons.length}</span>
                      </button>

                      {/* Lessons */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="overflow-hidden"
                          >
                            <div className="pb-2">
                              {modLessons.map((l: any) => {
                                const isActive = selectedLessonId === l.id;
                                const isCompleted = completedIds.has(l.id);
                                return (
                                  <button
                                    key={l.id}
                                    onClick={() => selectLesson(l.id)}
                                    className={`w-full flex items-center gap-3 pl-12 pr-5 py-2.5 text-left transition-all group/item ${
                                      isActive
                                        ? "bg-primary/8 border-l-2 border-primary"
                                        : "hover:bg-accent/5 border-l-2 border-transparent"
                                    }`}
                                  >
                                    {isCompleted ? (
                                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                                    ) : isActive ? (
                                      <Play className="h-4 w-4 text-primary shrink-0" />
                                    ) : (
                                      <CircleIcon className="h-4 w-4 text-muted-foreground/25 shrink-0" />
                                    )}
                                    <span className={`text-sm flex-1 leading-snug ${
                                      isActive ? "text-primary font-medium" : isCompleted ? "text-muted-foreground" : "text-foreground/80"
                                    }`}>{l.title}</span>
                                    {l.video_url && <Video className="h-3 w-3 text-muted-foreground/25 shrink-0" />}
                                    {isAdmin && (
                                      <span className="flex items-center gap-1 shrink-0 opacity-0 group-hover/item:opacity-100 transition-all">
                                        <span
                                          onClick={(e) => { e.stopPropagation(); setEditingLesson(l); }}
                                          className="text-muted-foreground hover:text-primary transition-colors"
                                        >
                                          <Pencil className="h-3 w-3" />
                                        </span>
                                        <span
                                          onClick={(e) => { e.stopPropagation(); if (confirm("Remover aula?")) deleteLesson.mutate({ id: l.id, module_id: mod.id }); }}
                                          className="text-muted-foreground hover:text-destructive transition-colors"
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </span>
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                              {isAdmin && (
                                <button
                                  onClick={() => setCreateLessonForModule(mod.id)}
                                  className="w-full flex items-center gap-2 pl-12 pr-5 py-2 text-xs text-muted-foreground hover:text-primary transition-colors"
                                >
                                  <Plus className="h-3 w-3" /> Adicionar aula
                                </button>
                              )}
                              {isAdmin && (
                                <div className="pl-12 pr-5 pt-1">
                                  <button
                                    onClick={() => { if (confirm("Remover módulo?")) deleteModule.mutate(mod.id); }}
                                    className="text-[10px] text-muted-foreground/30 hover:text-destructive transition-colors"
                                  >
                                    Remover seção
                                  </button>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>

        {/* RIGHT: Lesson content (desktop) */}
        <div className="hidden lg:flex flex-1 flex-col min-w-0 bg-background">
          <ScrollArea className="flex-1">
            <div className="max-w-3xl mx-auto px-8 py-8">
              {renderLessonContent()}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Mobile lesson overlay */}
      <AnimatePresence>
        {mobileLessonOpen && selectedLessonId && lesson && (
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 250 }}
            className="lg:hidden fixed inset-0 z-50 bg-background overflow-y-auto"
          >
            <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border/20 px-4 py-3 flex items-center gap-3">
              <button onClick={() => setMobileLessonOpen(false)} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <ArrowLeft className="h-4 w-4" /> Módulos
              </button>
            </div>
            <div className="px-4 py-6">
              {renderLessonContent()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main School Component ──

export function AcademySchool() {
  const { isAdmin } = useAuth();
  const { data: courses, isLoading } = useAcademyCourses();
  const { data: allModules } = useAllAcademyModules();
  const { data: allLessonsData } = useAllAcademyLessons();
  const { data: progress } = useUserProgress();
  const [showCreateCourse, setShowCreateCourse] = useState(false);
  const [editCoverCourse, setEditCoverCourse] = useState<{ id: string; title: string; cover_url: string } | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const deleteCourse = useDeleteCourse();

  const completedIds = new Set(progress?.filter((p) => p.completed).map((p) => p.lesson_id) ?? []);

  if (selectedCourseId) {
    return <CourseView courseId={selectedCourseId} onBack={() => setSelectedCourseId(null)} />;
  }

  if (isLoading) {
    return <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-64 rounded-xl" />)}</div>;
  }

  return (
    <>
      <CreateCourseDialog open={showCreateCourse} onOpenChange={setShowCreateCourse} />
      {editCoverCourse && (
        <EditCoverDialog open={!!editCoverCourse} onOpenChange={(o) => !o && setEditCoverCourse(null)} course={editCoverCourse} />
      )}

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Jornadas</h1>
          <p className="text-sm text-muted-foreground mt-1">Central de treinamento da operação</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowCreateCourse(true)} size="sm" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Nova Jornada
          </Button>
        )}
      </div>

      {!courses?.length ? (
        <div className="flex flex-col items-center justify-center py-24 gap-5">
          <div className="h-20 w-20 rounded-2xl bg-muted/20 flex items-center justify-center">
            <GraduationCap className="h-10 w-10 text-muted-foreground/30" />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-semibold text-foreground mb-1">Nenhuma jornada cadastrada</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              {isAdmin ? 'Clique em "Nova Jornada" para criar o primeiro treinamento.' : "Aguarde o administrador adicionar conteúdo."}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {courses.map((course, idx) => {
            const courseModules = allModules?.filter((m) => m.course_id === course.id) ?? [];
            const courseModuleIds = courseModules.map((m) => m.id);
            const courseLessons = allLessonsData?.filter((l) => courseModuleIds.includes(l.module_id)) ?? [];
            const courseCompleted = courseLessons.filter((l) => completedIds.has(l.id)).length;
            const coursePct = courseLessons.length > 0 ? Math.round((courseCompleted / courseLessons.length) * 100) : 0;

            return (
              <motion.div key={course.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}>
                <div
                  className="cursor-pointer group rounded-xl border border-border/30 bg-card hover:border-border/60 hover:shadow-lg transition-all duration-200 relative overflow-hidden h-full flex flex-col"
                  onClick={() => setSelectedCourseId(course.id)}
                >
                  {isAdmin && (
                    <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditCoverCourse({ id: course.id, title: course.title, cover_url: course.cover_url }); }}
                        className="h-5 w-5 rounded-md bg-background/60 backdrop-blur-sm flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        title="Editar capa"
                      >
                        <ImageIcon className="h-2.5 w-2.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); if (confirm("Remover jornada?")) deleteCourse.mutate(course.id); }}
                        className="h-5 w-5 rounded-md bg-background/60 backdrop-blur-sm flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  )}

                  {/* Cover image */}
                  {course.cover_url ? (
                    <div className="aspect-video bg-muted/20 overflow-hidden">
                      <img src={course.cover_url} alt={course.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    </div>
                  ) : (
                    <div className="aspect-video bg-gradient-to-br from-primary/15 via-primary/5 to-transparent flex items-center justify-center">
                      <GraduationCap className="h-12 w-12 text-primary/30" />
                    </div>
                  )}

                  <div className="p-5 flex flex-col flex-1">
                    {/* Title */}
                    <h3 className="text-sm font-bold text-foreground tracking-tight group-hover:text-primary transition-colors uppercase">{course.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1">Jornadas</p>

                    {/* Progress */}
                    <div className="mt-auto pt-4">
                      <Progress value={coursePct} className="h-1.5 mb-2" />
                      <span className="text-xs text-muted-foreground">{coursePct}% Concluído</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </>
  );
}
