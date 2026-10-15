import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import {
  useCreativeTeamOverrides,
  useUpsertCreativeTeamOverride,
  useDeleteCreativeTeamOverride,
  type CreativeTeamOverride,
  type OverrideInput,
} from "@/hooks/useCreativeTeamOverrides";

const EMPTY: OverrideInput = {
  creative_id: "",
  campaign_name_pattern: "",
  override_copy_writer: "",
  override_editor: "",
  reason: "",
};

export function CreativeTeamOverridesPanel({ isAdmin }: { isAdmin: boolean }) {
  const { data: overrides = [], isLoading } = useCreativeTeamOverrides();
  const upsert = useUpsertCreativeTeamOverride();
  const remove = useDeleteCreativeTeamOverride();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<OverrideInput>(EMPTY);

  const startCreate = () => {
    setForm(EMPTY);
    setOpen(true);
  };
  const startEdit = (ov: CreativeTeamOverride) => {
    setForm({
      id: ov.id,
      creative_id: ov.creative_id,
      campaign_name_pattern: ov.campaign_name_pattern ?? "",
      override_copy_writer: ov.override_copy_writer ?? "",
      override_editor: ov.override_editor ?? "",
      reason: ov.reason ?? "",
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.creative_id.trim()) {
      toast.error("Informe o Creative ID");
      return;
    }
    if (!form.override_copy_writer && !form.override_editor) {
      toast.error("Defina ao menos um override (copy ou editor)");
      return;
    }
    try {
      await upsert.mutateAsync(form);
      toast.success(form.id ? "Override atualizado" : "Override criado");
      setOpen(false);
    } catch (err: any) {
      toast.error("Erro ao salvar", { description: err?.message ?? "Tente novamente" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Remover este override? A atribuição voltará ao detectado pela nomenclatura.")) return;
    try {
      await remove.mutateAsync(id);
      toast.success("Override removido");
    } catch (err: any) {
      toast.error("Erro ao remover", { description: err?.message ?? "Tente novamente" });
    }
  };

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-400" />
            <div>
              <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                Correções Manuais — Copy / Editor
              </h3>
              <p className="text-[10px] text-muted-foreground/80 mt-0.5">
                Override aplicado na leitura. Não altera dados brutos do Meta. Reflete imediatamente em ranking, leaderboard e métricas por pessoa.
              </p>
            </div>
          </div>
          {isAdmin && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" onClick={startCreate} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  Novo override
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>{form.id ? "Editar override" : "Novo override de copy/editor"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Creative ID *</Label>
                    <Input
                      placeholder="ex: H02AD06"
                      value={form.creative_id}
                      onChange={(e) => setForm({ ...form, creative_id: e.target.value.toUpperCase() })}
                      className="font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground">Use o ID exato como aparece na tabela (com sufixo se for IMG, ex: IMG14-SP).</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Padrão de campanha (opcional)</Label>
                    <Input
                      placeholder="ex: BMGTX-C/A05  (vazio = vale para todas)"
                      value={form.campaign_name_pattern ?? ""}
                      onChange={(e) => setForm({ ...form, campaign_name_pattern: e.target.value })}
                      className="font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground">Se preenchido, override só vale quando o nome da campanha contiver esse texto.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Copy correto</Label>
                      <Input
                        placeholder="ex: Ian"
                        value={form.override_copy_writer ?? ""}
                        onChange={(e) => setForm({ ...form, override_copy_writer: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Editor correto</Label>
                      <Input
                        placeholder="ex: Iza"
                        value={form.override_editor ?? ""}
                        onChange={(e) => setForm({ ...form, override_editor: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Motivo (auditoria)</Label>
                    <Input
                      placeholder="ex: Gestor errou tag no upload, copy real é IAN"
                      value={form.reason ?? ""}
                      onChange={(e) => setForm({ ...form, reason: e.target.value })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                  <Button onClick={handleSave} disabled={upsert.isPending}>
                    {upsert.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {isLoading ? (
          <p className="text-xs text-muted-foreground">Carregando...</p>
        ) : overrides.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            Nenhum override ativo. A atribuição segue 100% pela nomenclatura das campanhas.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Creative ID</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Padrão Campanha</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Copy →</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Editor →</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Motivo</TableHead>
                  {isAdmin && <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {overrides.map((ov) => (
                  <TableRow key={ov.id} className="border-border">
                    <TableCell className="font-mono text-xs font-semibold">{ov.creative_id}</TableCell>
                    <TableCell className="font-mono text-[11px] text-muted-foreground">
                      {ov.campaign_name_pattern || <span className="italic">(todas)</span>}
                    </TableCell>
                    <TableCell>
                      {ov.override_copy_writer ? (
                        <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">{ov.override_copy_writer}</Badge>
                      ) : <span className="text-[10px] text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {ov.override_editor ? (
                        <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">{ov.override_editor}</Badge>
                      ) : <span className="text-[10px] text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-[11px] text-muted-foreground max-w-xs truncate" title={ov.reason}>
                      {ov.reason || "—"}
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(ov)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(ov.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
