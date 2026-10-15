import { useState } from "react";
import { useAcademyKnowledge, useCreateKnowledge, useDeleteKnowledge } from "@/hooks/useAcademyData";
import { useAuth } from "@/contexts/AuthContext";
import { Lightbulb, ChevronRight, Search, Plus, Trash2, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { motion } from "framer-motion";

const knowledgeCategories = [
  { value: "conceito", label: "Conceito" },
  { value: "framework", label: "Framework" },
  { value: "insight", label: "Insight" },
  { value: "glossario", label: "Glossário" },
];

const categoryLabels: Record<string, string> = Object.fromEntries(knowledgeCategories.map((c) => [c.value, c.label]));

function CreateKnowledgeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("conceito");
  const [content, setContent] = useState("");
  const [tagsText, setTagsText] = useState("");
  const createKnowledge = useCreateKnowledge();

  const handleSubmit = () => {
    if (!title.trim()) return;
    const tags = tagsText.split(",").map((t) => t.trim()).filter(Boolean);
    createKnowledge.mutate({ title: title.trim(), category, content: content.trim(), tags }, {
      onSuccess: () => { setTitle(""); setCategory("conceito"); setContent(""); setTagsText(""); onOpenChange(false); },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Novo Conceito</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: ROAS" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Categoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {knowledgeCategories.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Descrição / Conteúdo</Label>
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Explique o conceito..." className="mt-1" rows={6} />
          </div>
          <div>
            <Label className="text-xs">Tags (separadas por vírgula)</Label>
            <Input value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="tráfego, métricas, performance" className="mt-1" />
          </div>
          <Button onClick={handleSubmit} disabled={!title.trim() || createKnowledge.isPending} className="w-full">
            {createKnowledge.isPending ? "Criando..." : "Criar Conceito"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AcademyKnowledgeBase() {
  const { isAdmin } = useAuth();
  const { data: entries, isLoading } = useAcademyKnowledge();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const deleteKnowledge = useDeleteKnowledge();
  const selected = entries?.find((e) => e.id === selectedId);

  const filtered = entries?.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.title.toLowerCase().includes(q) ||
      e.content.toLowerCase().includes(q) ||
      e.category.toLowerCase().includes(q) ||
      (e.tags as string[])?.some((t) => t.toLowerCase().includes(q))
    );
  });

  if (isLoading) {
    return <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>;
  }

  if (selected) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setSelectedId(null)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
          >
            <ChevronRight className="h-3.5 w-3.5 rotate-180" />
            Voltar à Knowledge Base
          </button>
          {isAdmin && (
            <Button
              onClick={() => { if (confirm("Remover este conceito?")) { deleteKnowledge.mutate(selected.id); setSelectedId(null); } }}
              size="sm" variant="ghost" className="gap-1.5 text-xs text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" /> Remover
            </Button>
          )}
        </div>

        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Lightbulb className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base font-bold">{selected.title}</CardTitle>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-[10px]">{categoryLabels[selected.category] || selected.category}</Badge>
                  {(selected.tags as string[])?.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed bg-muted/20 rounded-lg p-6 border border-border/20">
              {selected.content || "Conteúdo não disponível."}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <CreateKnowledgeDialog open={showCreate} onOpenChange={setShowCreate} />

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar conceitos, frameworks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-card/50 border-border/50"
          />
        </div>
        {isAdmin && (
          <Button onClick={() => setShowCreate(true)} size="sm" className="gap-1.5 shrink-0">
            <Plus className="h-3.5 w-3.5" /> Novo conceito
          </Button>
        )}
      </div>

      {!entries?.length ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Lightbulb className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Knowledge Base vazia</h3>
          <p className="text-sm text-muted-foreground max-w-sm text-center">
            {isAdmin ? "Clique em \"Novo conceito\" para começar." : "Aguarde o administrador adicionar conteúdo."}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered?.map((entry, idx) => (
              <motion.div key={entry.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}>
                <Card
                  className="cursor-pointer group hover:border-primary/30 transition-all bg-card/50 border-border/50"
                  onClick={() => setSelectedId(entry.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-primary/20 transition-colors">
                        <Lightbulb className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{entry.title}</p>
                        <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{entry.content?.slice(0, 100) || ""}</p>
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          <Badge variant="outline" className="text-[9px]">{categoryLabels[entry.category] || entry.category}</Badge>
                          {(entry.tags as string[])?.slice(0, 2).map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-[9px]">{tag}</Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
          {filtered?.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum resultado encontrado para "{search}"</p>
          )}
        </>
      )}
    </>
  );
}
