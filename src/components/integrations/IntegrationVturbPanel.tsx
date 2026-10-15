import { useMemo, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOperation } from "@/contexts/OperationContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Download, RefreshCw, ArrowUpDown, Search, Save, Key } from "lucide-react";
import { VturbUtmDiagnostic } from "./VturbUtmDiagnostic";

type SortKey = "name" | "duration" | "created_at" | "views" | "folder";

interface VturbPlayer {
  id: string;
  name: string;
  folder: string | null;
  duration: number | null;
  created_at: string | null;
  views: number | null;
  already_imported: boolean;
}

export function IntegrationVturbPanel() {
  const { operationId } = useOperation();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [players, setPlayers] = useState<VturbPlayer[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [secretUsed, setSecretUsed] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [hideImported, setHideImported] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [testingKey, setTestingKey] = useState(false);

  useEffect(() => {
    if (operationId) {
      supabase
        .from("operations")
        .select("vturb_api_key")
        .eq("id", operationId)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.vturb_api_key) setApiKey(data.vturb_api_key);
          else setApiKey("");
        });
    }
  }, [operationId]);

  async function handleSaveKey() {
    if (!operationId) return;
    setSavingKey(true);
    try {
      const { error } = await supabase
        .from("operations")
        .update({ vturb_api_key: apiKey })
        .eq("id", operationId);
      if (error) throw error;
      toast.success("API Key do Vturb atualizada com sucesso");
    } catch (err: any) {
      toast.error("Erro ao salvar API Key: " + err.message);
    } finally {
      setSavingKey(false);
    }
  }

  async function handleTestKey() {
    if (!operationId) {
      toast.error("Selecione uma operação primeiro");
      return;
    }
    if (!apiKey.trim()) {
      toast.error("Insira uma API Key para testar");
      return;
    }

    setTestingKey(true);
    try {
      const { data, error } = await supabase.functions.invoke("vturb-list-players", {
        body: { 
          operation_id: operationId,
          test_api_key: apiKey.trim() 
        },
      });

      if (error) throw error;
      
      if (data?.error) {
        if (data.status === 401 || data.status === 403) {
          toast.error("Chave inválida ou sem permissão.");
        } else {
          toast.error(`Falha no teste: ${data.message || data.error}`);
        }
      } else {
        toast.success(`Conexão OK! ${data.count} vídeos encontrados.`);
      }
    } catch (err: any) {
      toast.error(`Erro ao testar API Key: ${err.message}`);
    } finally {
      setTestingKey(false);
    }
  }

  const filteredPlayers = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = players.filter((p) => {
      if (hideImported && p.already_imported) return false;
      if (!q) return true;
      return (
        p.name?.toLowerCase().includes(q) ||
        p.id?.toLowerCase().includes(q) ||
        (p.folder ?? "").toLowerCase().includes(q)
      );
    });
    const dir = sortDir === "asc" ? 1 : -1;
    list = [...list].sort((a, b) => {
      const av = (a as any)[sortKey];
      const bv = (b as any)[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "pt-BR", { numeric: true }) * dir;
    });
    return list;
  }, [players, search, sortKey, sortDir, hideImported]);

  async function loadPlayers() {
    if (!operationId) {
      toast.error("Selecione uma operação primeiro");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("vturb-list-players", {
        body: { operation_id: operationId },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.message || data.error);
        setPlayers([]);
      } else {
        setPlayers(data.players || []);
        setSecretUsed(data.secret_used);
        setSelected(new Set());
        setOpen(true);
        toast.success(`${data.count} vídeos encontrados no Vturb`);
      }
    } catch (err: any) {
      toast.error(`Falha ao listar: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function importSelected() {
    const toImport = players.filter((p) => selected.has(p.id));
    if (toImport.length === 0) {
      toast.error("Selecione ao menos 1 vídeo");
      return;
    }
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("vturb-import-players", {
        body: { operation_id: operationId, players: toImport },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.details || data.error);
      toast.success(`${data.imported} VSLs importadas para esta operação`);
      setOpen(false);
      loadPlayers();
    } catch (err: any) {
      toast.error(`Falha ao importar: ${err.message}`);
    } finally {
      setImporting(false);
    }
  }

  function toggleAll() {
    const available = filteredPlayers.filter((p) => !p.already_imported);
    const allSelected = available.length > 0 && available.every((p) => selected.has(p.id));
    const next = new Set(selected);
    if (allSelected) available.forEach((p) => next.delete(p.id));
    else available.forEach((p) => next.add(p.id));
    setSelected(next);
  }

  return (
    <div className="space-y-6">
      <div className="bg-muted/30 rounded-lg p-4 space-y-4 border border-border/50">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-primary" />
              <h4 className="text-sm font-semibold text-foreground">API Key do Vturb</h4>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                size="sm" 
                variant="outline" 
                onClick={handleTestKey} 
                disabled={testingKey || !operationId || !apiKey}
                className="h-8"
              >
                {testingKey ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                Testar
              </Button>
              <Button size="sm" variant="secondary" onClick={handleSaveKey} disabled={savingKey || !operationId} className="h-8">
                {savingKey ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                Salvar Key
              </Button>
            </div>
          </div>
          <Input
            type="password"
            placeholder="Insira sua API Key da Vturb..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="h-9"
          />
          <p className="text-[10px] text-muted-foreground">
            A API Key da conta é armazenada na operação. Se deixado em branco, o sistema tentará usar o segredo legado do backend.
          </p>
        </div>

        <div className="h-px bg-border/50" />

        <div className="flex items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-foreground">Importar VSLs do Vturb</h4>
            <p className="text-xs text-muted-foreground mt-1">
              Puxe todos os players disponíveis na conta e escolha quais monitorar nesta operação.
            </p>
          </div>
          <Button size="sm" onClick={loadPlayers} disabled={loading || !operationId}>
            {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
            Listar vídeos do Vturb
          </Button>
        </div>
      </div>

      <VturbUtmDiagnostic />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              Vídeos disponíveis no Vturb ({filteredPlayers.length}/{players.length})
              {secretUsed && <span className="text-xs text-muted-foreground ml-2">via {secretUsed}</span>}
            </DialogTitle>
          </DialogHeader>

          {/* Toolbar: busca + ordenação */}
          <div className="space-y-2 py-2 border-b">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, ID ou pasta..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-7 h-8 text-sm"
                />
              </div>
              <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                <SelectTrigger className="w-[160px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_at">Data de criação</SelectItem>
                  <SelectItem value="name">Nome</SelectItem>
                  <SelectItem value="duration">Duração</SelectItem>
                  <SelectItem value="views">Views</SelectItem>
                  <SelectItem value="folder">Pasta</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2"
                onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
                title={sortDir === "asc" ? "Crescente" : "Decrescente"}
              >
                <ArrowUpDown className="w-3.5 h-3.5 mr-1" />
                {sortDir === "asc" ? "↑" : "↓"}
              </Button>
            </div>
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-3">
                <button className="text-xs text-primary hover:underline" onClick={toggleAll}>
                  Selecionar todos (filtrados)
                </button>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                  <Checkbox
                    checked={hideImported}
                    onCheckedChange={(v) => setHideImported(!!v)}
                    className="h-3.5 w-3.5"
                  />
                  Esconder já importadas
                </label>
              </div>
              <span className="text-xs text-muted-foreground">{selected.size} selecionados</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 py-2">
            {filteredPlayers.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum vídeo encontrado</p>
            )}
            {filteredPlayers.map((p) => (
              <label
                key={p.id}
                className={`flex items-center gap-3 p-2 rounded hover:bg-muted/50 cursor-pointer ${
                  p.already_imported ? "opacity-50" : ""
                }`}
              >
                <Checkbox
                  checked={selected.has(p.id) || p.already_imported}
                  disabled={p.already_imported}
                  onCheckedChange={(v) => {
                    const next = new Set(selected);
                    if (v) next.add(p.id);
                    else next.delete(p.id);
                    setSelected(next);
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    ID: {p.id}
                    {p.folder && ` • 📁 ${p.folder}`}
                    {p.duration && ` • ${Math.round(p.duration)}s`}
                  </div>
                </div>
                {p.already_imported && (
                  <span className="text-xs text-green-500 whitespace-nowrap">✓ já importada</span>
                )}
              </label>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={loadPlayers} disabled={loading}>
              <RefreshCw className="w-4 h-4 mr-1" /> Recarregar
            </Button>
            <Button onClick={importSelected} disabled={importing || selected.size === 0}>
              {importing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              Importar {selected.size} vídeo(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
