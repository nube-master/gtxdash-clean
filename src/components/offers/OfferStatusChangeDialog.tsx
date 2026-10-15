import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import type { Offer, OfferStatus } from "@/types/offers";

const STATUS_LABEL: Record<OfferStatus, string> = {
  ativa: "Ativa", em_teste: "Em teste", pausada: "Pausada", morta: "Morta", arquivada: "Arquivada",
};

interface Props {
  offer: Offer;
  newStatus: OfferStatus;
  onClose: () => void;
  onSaved: () => void;
}

export function OfferStatusChangeDialog({ offer, newStatus, onClose, onSaved }: Props) {
  const isMorte = newStatus === "morta";
  const [motivo, setMotivo] = useState("");
  const [dataMorte, setDataMorte] = useState(format(new Date(), "yyyy-MM-dd"));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const updates: Partial<Offer> = { status: newStatus };
    if (isMorte) {
      updates.motivo_morte = motivo || null;
      updates.data_morte = dataMorte;
    }
    const { error } = await supabase.from("offers").update(updates as any).eq("id", offer.id);
    setSaving(false);
    if (error) {
      toast.error("Erro ao mudar status");
      return;
    }
    toast.success(`Status alterado para "${STATUS_LABEL[newStatus]}"`);
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mudar status para "{STATUS_LABEL[newStatus]}"</DialogTitle>
          <DialogDescription>
            <span className="font-mono font-semibold">{offer.apelido_interno}</span> — {offer.produto_real}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {isMorte && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="data_morte">Data da morte</Label>
                <Input
                  id="data_morte"
                  type="date"
                  value={dataMorte}
                  onChange={(e) => setDataMorte(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="motivo">Por que está mudando para Morta?</Label>
                <Textarea
                  id="motivo"
                  rows={3}
                  placeholder="Ex: Saturação + queda de ROI por 3 dias seguidos"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                />
              </div>
            </>
          )}
          {!isMorte && (
            <p className="text-sm text-muted-foreground">
              Confirme a mudança de status. A alteração será registrada automaticamente no histórico.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
