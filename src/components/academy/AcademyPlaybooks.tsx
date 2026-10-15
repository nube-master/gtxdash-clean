import { useState } from "react";
import { useAcademyPlaybooks, useCreatePlaybook, useUpdatePlaybook, useDeletePlaybook } from "@/hooks/useAcademyData";
import { useAuth } from "@/contexts/AuthContext";
import { ScrollText, ChevronRight, FileText, Plus, Trash2, Save, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PlaybookEditor } from "@/components/academy/PlaybookEditor";
import { motion } from "framer-motion";

const categories = [
  { value: "campanha", label: "Campanha" },
  { value: "escala", label: "Escala" },
  { value: "criativos", label: "Criativos" },
  { value: "estrutura", label: "Estrutura" },
  { value: "analise", label: "Análise" },
  { value: "geral", label: "Geral" },
];

const categoryLabels: Record<string, string> = Object.fromEntries(categories.map((c) => [c.value, c.label]));

function CreatePlaybookDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("geral");
  const [content, setContent] = useState("");
  const createPlaybook = useCreatePlaybook();

  const handleSubmit = () => {
    if (!title.trim()) return;
    createPlaybook.mutate({ title: title.trim(), category, content }, {
      onSuccess: () => { setTitle(""); setCategory("geral"); setContent(""); onOpenChange(false); },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Novo Playbook</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <Label className="text-xs">Título</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: SOP de Campanha" className="mt-1" />
            </div>
            <div className="w-40">
              <Label className="text-xs">Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Conteúdo</Label>
            <div className="mt-1">
              <PlaybookEditor content={content} onChange={setContent} placeholder="Comece a documentar o processo..." />
            </div>
          </div>
          <Button onClick={handleSubmit} disabled={!title.trim() || createPlaybook.isPending} className="w-full">
            {createPlaybook.isPending ? "Criando..." : "Criar Playbook"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AcademyPlaybooks() {
  const { isAdmin } = useAuth();
  const { data: playbooks, isLoading } = useAcademyPlaybooks();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editCategory, setEditCategory] = useState("geral");
  const updatePlaybook = useUpdatePlaybook();
  const deletePlaybook = useDeletePlaybook();

  const selected = playbooks?.find((p) => p.id === selectedId);

  const startEdit = () => {
    if (!selected) return;
    setEditTitle(selected.title);
    setEditCategory(selected.category);
    setEditContent(selected.content);
    setEditing(true);
  };

  const saveEdit = () => {
    if (!selected) return;
    updatePlaybook.mutate({ id: selected.id, title: editTitle.trim(), category: editCategory, content: editContent }, {
      onSuccess: () => setEditing(false),
    });
  };

  if (isLoading) {
    return <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>;
  }

  // ── Detail / Editor View ──
  if (selected) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => { setSelectedId(null); setEditing(false); }}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
          >
            <ChevronRight className="h-3.5 w-3.5 rotate-180" />
            Voltar aos playbooks
          </button>
          {isAdmin && !editing && (
            <div className="flex gap-2">
              <Button onClick={startEdit} size="sm" variant="outline" className="gap-1.5 text-xs">
                <Pencil className="h-3 w-3" /> Editar
              </Button>
              <Button
                onClick={() => { if (confirm("Remover este playbook?")) { deletePlaybook.mutate(selected.id); setSelectedId(null); } }}
                size="sm" variant="ghost" className="gap-1.5 text-xs text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}
          {editing && (
            <div className="flex gap-2">
              <Button onClick={() => setEditing(false)} size="sm" variant="ghost" className="text-xs">Cancelar</Button>
              <Button onClick={saveEdit} size="sm" className="gap-1.5 text-xs" disabled={updatePlaybook.isPending}>
                <Save className="h-3 w-3" /> {updatePlaybook.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          )}
        </div>

        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                {editing ? (
                  <div className="flex items-center gap-3">
                    <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="text-base font-bold flex-1" />
                    <Select value={editCategory} onValueChange={setEditCategory}>
                      <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div>
                    <CardTitle className="text-base font-bold">{selected.title}</CardTitle>
                    <Badge variant="outline" className="text-[10px] mt-1">{categoryLabels[selected.category] || selected.category}</Badge>
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {editing ? (
              <PlaybookEditor content={editContent} onChange={setEditContent} />
            ) : (
              <PlaybookEditor content={selected.content} editable={false} />
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Group by category ──
  const grouped = (playbooks ?? []).reduce<Record<string, typeof playbooks>>((acc, pb) => {
    const cat = pb.category || "geral";
    if (!acc[cat]) acc[cat] = [];
    acc[cat]!.push(pb);
    return acc;
  }, {});

  return (
    <>
      <CreatePlaybookDialog open={showCreate} onOpenChange={setShowCreate} />

      {isAdmin && (
        <div className="flex justify-end mb-4">
          <Button onClick={() => setShowCreate(true)} size="sm" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Novo Playbook
          </Button>
        </div>
      )}

      {!playbooks?.length ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <ScrollText className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Nenhum playbook cadastrado</h3>
          <p className="text-sm text-muted-foreground max-w-sm text-center">
            {isAdmin ? "Clique em \"Novo Playbook\" para começar." : "Aguarde o administrador adicionar conteúdo."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                {categoryLabels[cat] || cat}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {items!.map((pb, idx) => (
                  <motion.div key={pb.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }}>
                    <Card
                      className="cursor-pointer group hover:border-primary/30 transition-all bg-card/50 border-border/50"
                      onClick={() => setSelectedId(pb.id)}
                    >
                      <CardContent className="p-4 flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                          <ScrollText className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{pb.title}</p>
                          <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
                            {pb.content ? stripHtml(pb.content).slice(0, 80) : "Sem conteúdo"}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function stripHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || div.innerText || "";
}
