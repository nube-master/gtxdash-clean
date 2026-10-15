import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload, Trash2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  offerId: string;
  currentUrl: string | null;
}

export function SpyCoverEditDialog({ open, onOpenChange, offerId, currentUrl }: Props) {
  const qc = useQueryClient();
  const [url, setUrl] = useState(currentUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const save = async (finalUrl: string | null) => {
    setSaving(true);
    const { error } = await supabase
      .from("spy_offers")
      .update({ hero_thumbnail_url: finalUrl })
      .eq("id", offerId);
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar capa: " + error.message);
      return;
    }
    toast.success("Capa atualizada");
    qc.invalidateQueries({ queryKey: ["spy-offers"] });
    qc.invalidateQueries({ queryKey: ["spy-offer", offerId] });
    onOpenChange(false);
  };

  const onUpload = async (file: File) => {
    // Validações comuns que costumam dar erro silencioso
    const MAX = 25 * 1024 * 1024; // 25MB
    if (file.size > MAX) {
      toast.error(`Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máx 25MB.`);
      return;
    }
    const nameLower = file.name.toLowerCase();
    const isHeic = nameLower.endsWith(".heic") || nameLower.endsWith(".heif") || file.type.includes("heic") || file.type.includes("heif");
    if (isHeic) {
      toast.error("Formato HEIC não é suportado pelo navegador. Converta para JPG ou PNG antes de enviar.");
      return;
    }
    const rawExt = (nameLower.split(".").pop() || "").replace(/[^a-z0-9]/g, "");
    const ext = rawExt && rawExt.length <= 5 ? rawExt : "jpg";
    const contentType = file.type && file.type.startsWith("image/") ? file.type : `image/${ext === "jpg" ? "jpeg" : ext}`;
    const path = `${offerId}/${Date.now()}.${ext}`;

    setUploading(true);
    const { error: upErr } = await supabase.storage
      .from("spy-offer-covers")
      .upload(path, file, { upsert: true, contentType, cacheControl: "3600" });
    if (upErr) {
      setUploading(false);
      console.error("[SpyCoverEdit] upload error", upErr);
      toast.error("Falha no upload: " + (upErr.message || JSON.stringify(upErr)));
      return;
    }
    const { data } = supabase.storage.from("spy-offer-covers").getPublicUrl(path);
    setUrl(data.publicUrl);
    setUploading(false);
    await save(data.publicUrl);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>Editar capa da oferta</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {url && (
            <div className="aspect-[4/5] w-full overflow-hidden rounded-md border border-border bg-muted max-h-64">
              <img src={url} alt="preview" className="h-full w-full object-cover" />
            </div>
          )}

          <div className="space-y-2">
            <Label>Enviar arquivo</Label>
            <label className="flex items-center justify-center h-20 border-2 border-dashed border-border rounded-md cursor-pointer hover:bg-muted/40 transition-colors">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUpload(f);
                }}
                disabled={uploading}
              />
              {uploading ? (
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Enviando…
                </span>
              ) : (
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Upload className="h-4 w-4" /> Clique para escolher imagem
                </span>
              )}
            </label>
          </div>

          <div className="space-y-2">
            <Label>Ou cole uma URL</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…/preview.jpg"
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          {currentUrl && (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => save(null)}
              disabled={saving}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Remover
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => save(url.trim() || null)} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
