import { useEffect, useRef, useState } from "react";
import { ChevronRight, FolderOpen, Upload, Trash2, Download, Loader2, FileText, Image as ImageIcon, Video, File as FileIcon, Plus, Eye, Music } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

type FileRow = {
  id: string;
  offer_id: string;
  folder: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

const DEFAULT_FOLDERS = ["Ads", "Transcrição", "VSL"];
const ACCEPT = "application/pdf,video/*,image/*,audio/*,.pdf,.mp4,.mov,.webm,.mkv,.avi,.m4v,.txt,.doc,.docx";
const BUCKET = "spy-offer-files";

function fmtSize(b?: number | null) {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function iconFor(mime?: string | null) {
  const m = mime ?? "";
  if (m.startsWith("image/")) return ImageIcon;
  if (m.startsWith("video/")) return Video;
  if (m.startsWith("text/") || m.includes("pdf") || m.includes("document")) return FileText;
  return FileIcon;
}

export function SpyOfferFolders({ offerId }: { offerId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [preview, setPreview] = useState<{ url: string; row: FileRow } | null>(null);

  const { data: files = [], isLoading } = useQuery({
    queryKey: ["spy-offer-files", offerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("spy_offer_files")
        .select("*")
        .eq("offer_id", offerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FileRow[];
    },
  });

  const byFolder = new Map<string, FileRow[]>();
  for (const f of files) {
    if (!byFolder.has(f.folder)) byFolder.set(f.folder, []);
    byFolder.get(f.folder)!.push(f);
  }
  const folderNames = Array.from(new Set([...DEFAULT_FOLDERS, ...byFolder.keys()]));

  const upload = useMutation({
    mutationFn: async ({ folder, file }: { folder: string; file: File }) => {
      const { data: offerRow, error: offerErr } = await supabase
        .from("spy_offers")
        .select("operation_id")
        .eq("id", offerId)
        .maybeSingle();
      if (offerErr || !offerRow) throw new Error("Não foi possível identificar a operação da oferta.");

      const safe = file.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.\-]+/g, "_");
      const safeFolder = folder.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.\-]+/g, "_");
      const path = `${offerId}/${safeFolder}/${crypto.randomUUID()}-${safe}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (up.error) throw up.error;

      const { data: userRes } = await supabase.auth.getUser();
      const { error: insErr } = await supabase.from("spy_offer_files").insert({
        offer_id: offerId,
        operation_id: offerRow.operation_id,
        folder,
        file_name: file.name,
        storage_path: path,
        mime_type: file.type || null,
        size_bytes: file.size,
        uploaded_by: userRes?.user?.id ?? null,
      });
      if (insErr) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw insErr;
      }
    },
    onSuccess: () => {
      toast.success("Arquivo enviado");
      qc.invalidateQueries({ queryKey: ["spy-offer-files", offerId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha no upload"),
  });

  const remove = useMutation({
    mutationFn: async (row: FileRow) => {
      await supabase.storage.from(BUCKET).remove([row.storage_path]);
      const { error } = await supabase.from("spy_offer_files").delete().eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Arquivo removido");
      qc.invalidateQueries({ queryKey: ["spy-offer-files", offerId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao remover"),
  });

  async function signUrl(row: FileRow) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(row.storage_path, 60 * 60);
    if (error || !data?.signedUrl) {
      toast.error("Não foi possível gerar o link");
      return null;
    }
    return data.signedUrl;
  }
  async function download(row: FileRow) {
    const url = await signUrl(row);
    if (url) window.open(url, "_blank");
  }
  async function openPreview(row: FileRow) {
    const url = await signUrl(row);
    if (url) setPreview({ url, row });
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Pastas ({folderNames.length})</h3>
        </div>
        {!newFolderOpen ? (
          <Button size="sm" variant="ghost" onClick={() => setNewFolderOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Nova pasta
          </Button>
        ) : (
          <div className="flex items-center gap-1.5">
            <Input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Nome da pasta"
              className="h-7 text-xs w-40"
            />
            <Button
              size="sm"
              onClick={() => {
                const n = newFolderName.trim();
                if (!n) return;
                setOpen((o) => ({ ...o, [n]: true }));
                setNewFolderName("");
                setNewFolderOpen(false);
              }}
            >
              Criar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setNewFolderOpen(false); setNewFolderName(""); }}>
              Cancelar
            </Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-1.5">
          {folderNames.map((name) => {
            const list = byFolder.get(name) ?? [];
            const isOpen = open[name] ?? false;
            return (
              <FolderRow
                key={name}
                name={name}
                files={list}
                isOpen={isOpen}
                onToggle={() => setOpen((o) => ({ ...o, [name]: !isOpen }))}
                onUpload={(file) => upload.mutate({ folder: name, file })}
                onDelete={(row) => {
                  if (confirm(`Remover "${row.file_name}"?`)) remove.mutate(row);
                }}
                onDownload={download}
                onPreview={openPreview}
                uploading={upload.isPending}
              />
            );
          })}
        </div>
      )}

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle className="truncate">{preview?.row.file_name}</DialogTitle>
          </DialogHeader>
          {preview && <PreviewBody url={preview.url} mime={preview.row.mime_type} name={preview.row.file_name} />}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function PreviewBody({ url, mime, name }: { url: string; mime: string | null; name: string }) {
  const m = mime ?? "";
  const lower = name.toLowerCase();
  const isVideo = m.startsWith("video/") || /\.(mp4|webm|mov|mkv|m4v|avi)$/i.test(lower);
  const isImage = m.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(lower);
  const isAudio = m.startsWith("audio/") || /\.(mp3|wav|m4a|ogg)$/i.test(lower);
  const isPdf = m.includes("pdf") || lower.endsWith(".pdf");
  const isText = m.startsWith("text/") || /\.(txt|md|srt|vtt|csv|log)$/i.test(lower);
  const isDocx = m.includes("officedocument.wordprocessingml") || lower.endsWith(".docx");

  if (isVideo) return <video src={url} controls autoPlay className="w-full max-h-[75vh] rounded-md bg-black" />;
  if (isImage) return <img src={url} alt={name} className="w-full max-h-[75vh] object-contain rounded-md" />;
  if (isAudio) return <audio src={url} controls autoPlay className="w-full" />;
  if (isPdf) return <iframe src={url} title={name} className="w-full h-[75vh] rounded-md bg-background" />;
  if (isText) return <TextPreview url={url} />;
  if (isDocx) return <DocxPreview url={url} />;
  return (
    <div className="text-sm text-muted-foreground py-6 text-center">
      Pré-visualização indisponível para este tipo de arquivo.{" "}
      <a href={url} target="_blank" rel="noreferrer" className="underline">Abrir em nova aba</a>
    </div>
  );
}

function TextPreview({ url }: { url: string }) {
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(url).then((r) => r.text()).then((t) => { if (alive) setText(t); })
      .catch((e) => { if (alive) setErr(e?.message ?? "Erro ao ler arquivo"); });
    return () => { alive = false; };
  }, [url]);
  if (err) return <div className="text-sm text-destructive py-6 text-center">{err}</div>;
  if (text === null) return <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;
  return <pre className="w-full max-h-[75vh] overflow-auto text-xs whitespace-pre-wrap rounded-md bg-muted/30 p-4 leading-relaxed">{text}</pre>;
}

function DocxPreview({ url }: { url: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const buf = await (await fetch(url)).arrayBuffer();
        const mammoth = await import("mammoth/mammoth.browser");
        const res = await (mammoth as any).convertToHtml({ arrayBuffer: buf });
        if (alive) setHtml(res.value ?? "");
      } catch (e: any) {
        if (alive) setErr(e?.message ?? "Falha ao renderizar .docx");
      }
    })();
    return () => { alive = false; };
  }, [url]);
  if (err) return <div className="text-sm text-destructive py-6 text-center">{err} · <a href={url} target="_blank" rel="noreferrer" className="underline">Baixar</a></div>;
  if (html === null) return <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;
  return <div className="w-full max-h-[75vh] overflow-auto rounded-md bg-background p-6 text-sm leading-relaxed prose prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: html }} />;
}


function FolderRow({
  name, files, isOpen, onToggle, onUpload, onDelete, onDownload, onPreview, uploading,
}: {
  name: string;
  files: FileRow[];
  isOpen: boolean;
  onToggle: () => void;
  onUpload: (f: File) => void;
  onDelete: (f: FileRow) => void;
  onDownload: (f: FileRow) => void;
  onPreview: (f: FileRow) => void;
  uploading: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const canPreview = (f: FileRow) => {
    const m = f.mime_type ?? "";
    const n = f.file_name.toLowerCase();
    return m.startsWith("video/") || m.startsWith("image/") || m.startsWith("audio/")
      || m.includes("pdf") || m.startsWith("text/") || m.includes("officedocument.wordprocessingml")
      || /\.(mp4|webm|mov|mkv|m4v|avi|png|jpe?g|gif|webp|svg|mp3|wav|m4a|ogg|pdf|txt|md|srt|vtt|csv|log|docx)$/i.test(n);
  };
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 hover:bg-muted/40 cursor-pointer" onClick={onToggle}>
        <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
        <FolderOpen className="h-4 w-4 text-blue-400" />
        <span className="text-sm font-medium flex-1">{name}</span>
        <span className="text-[11px] text-muted-foreground">{files.length} arquivo{files.length === 1 ? "" : "s"}</span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7"
          onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = "";
          }}
        />
      </div>
      {isOpen && (
        <div className="border-t border-border bg-muted/20 p-2 space-y-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="w-full border border-dashed border-border rounded-md py-4 px-3 text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground transition flex items-center justify-center gap-2"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Enviar arquivo (PDF, vídeo, imagem…)
          </button>
          {files.length > 0 && (
            <ul className="space-y-1.5">
              {files.map((f) => {
                const preview = canPreview(f);
                const meta = fileMeta(f.mime_type, f.file_name);
                return (
                  <li key={f.id} className="group flex items-center gap-3 px-3 py-2.5 rounded-md border border-border bg-background/60 hover:bg-muted/40 transition">
                    <div className={cn("h-9 w-9 rounded-md flex items-center justify-center shrink-0", meta.iconBg)}>
                      <meta.Icon className={cn("h-4 w-4", meta.iconColor)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => preview ? onPreview(f) : onDownload(f)}
                          className={cn("text-sm font-medium truncate text-left", preview && "hover:underline")}
                          title={f.file_name}
                        >
                          {f.file_name}
                        </button>
                        <span className={cn("text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded", meta.badgeBg, meta.badgeText)}>
                          {meta.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">{meta.subtitle} · {fmtSize(f.size_bytes)}</p>
                    </div>
                    {preview && (
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => onPreview(f)} title="Pré-visualizar">
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => onDownload(f)} title="Baixar">
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive opacity-0 group-hover:opacity-100 transition" onClick={() => onDelete(f)} title="Remover">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function fileMeta(mime: string | null, name: string) {
  const m = (mime ?? "").toLowerCase();
  const lower = name.toLowerCase();
  const ext = lower.split(".").pop() ?? "";

  if (m.startsWith("video/") || /\.(mp4|webm|mov|mkv|m4v|avi)$/i.test(lower)) {
    return { Icon: Video, iconBg: "bg-purple-500/10", iconColor: "text-purple-400", badge: ext.toUpperCase() || "VIDEO", badgeBg: "bg-purple-500/15", badgeText: "text-purple-300", subtitle: "Reproduza vídeos com controles completos" };
  }
  if (m.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(lower)) {
    return { Icon: ImageIcon, iconBg: "bg-emerald-500/10", iconColor: "text-emerald-400", badge: ext.toUpperCase() || "IMG", badgeBg: "bg-emerald-500/15", badgeText: "text-emerald-300", subtitle: "Visualize imagens em alta resolução" };
  }
  if (m.startsWith("audio/") || /\.(mp3|wav|m4a|ogg)$/i.test(lower)) {
    return { Icon: Music, iconBg: "bg-amber-500/10", iconColor: "text-amber-400", badge: ext.toUpperCase() || "AUDIO", badgeBg: "bg-amber-500/15", badgeText: "text-amber-300", subtitle: "Reproduza áudios com controles" };
  }
  if (m.includes("pdf") || lower.endsWith(".pdf")) {
    return { Icon: FileText, iconBg: "bg-rose-500/10", iconColor: "text-rose-400", badge: "PDF", badgeBg: "bg-rose-500/15", badgeText: "text-rose-300", subtitle: "Abra o documento no visualizador" };
  }
  if (m.includes("officedocument.wordprocessingml") || lower.endsWith(".docx") || lower.endsWith(".doc")) {
    return { Icon: FileText, iconBg: "bg-blue-500/10", iconColor: "text-blue-400", badge: "DOCX", badgeBg: "bg-blue-500/15", badgeText: "text-blue-300", subtitle: "Leia transcrições e documentos Word" };
  }
  if (m.startsWith("text/") || /\.(txt|md|srt|vtt|csv|log)$/i.test(lower)) {
    return { Icon: FileText, iconBg: "bg-sky-500/10", iconColor: "text-sky-400", badge: ext.toUpperCase() || "TXT", badgeBg: "bg-sky-500/15", badgeText: "text-sky-300", subtitle: "Leia o conteúdo de texto inline" };
  }
  return { Icon: FileIcon, iconBg: "bg-muted", iconColor: "text-muted-foreground", badge: ext.toUpperCase() || "FILE", badgeBg: "bg-muted", badgeText: "text-muted-foreground", subtitle: "Baixar arquivo" };
}

