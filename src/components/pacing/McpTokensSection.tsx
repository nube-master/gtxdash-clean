import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plug, Copy, Trash2, Plus, KeyRound } from "lucide-react";
import { toast } from "sonner";

type Token = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  last_used_at: string | null;
  created_at: string;
};

const ALL_SCOPES = [
  { id: "rules:read", label: "rules:read — listar/ler regras" },
  { id: "rules:write", label: "rules:write — criar/editar/remover regras" },
  { id: "groups:read", label: "groups:read — listar budget groups" },
  { id: "groups:write", label: "groups:write — criar/editar grupos" },
  { id: "log:read", label: "log:read — ler action log + stats" },
  { id: "campaigns:write", label: "campaigns:write — pausar/religar campanha" },
  { id: "settings:read", label: "settings:read — ler app_settings" },
];

function generateTokenPlain(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `gtx_${hex}`;
}

async function sha256(str: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timeAgo(iso: string | null): string {
  if (!iso) return "nunca";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

export function McpTokensSection() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newScopes, setNewScopes] = useState<string[]>(ALL_SCOPES.map((s) => s.id));
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("mcp_tokens")
      .select("id, name, prefix, scopes, last_used_at, created_at")
      .order("created_at", { ascending: false });
    if (error) toast.error("Erro carregando tokens: " + error.message);
    setTokens((data as Token[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) { toast.error("Dê um nome ao token"); return; }
    if (newScopes.length === 0) { toast.error("Selecione ao menos 1 scope"); return; }
    const plain = generateTokenPlain();
    const hash = await sha256(plain);
    const prefix = plain.slice(0, 12);
    const { error } = await supabase.from("mcp_tokens").insert({
      token_hash: hash, prefix, name: newName.trim(), scopes: newScopes,
    });
    if (error) { toast.error("Falha ao criar: " + error.message); return; }
    setCreatedToken(plain);
    setCreateOpen(false);
    setNewName("");
    setNewScopes(ALL_SCOPES.map((s) => s.id));
    load();
  };

  const handleRevoke = async (id: string) => {
    const { error } = await supabase.from("mcp_tokens").delete().eq("id", id);
    if (error) { toast.error("Falha ao revogar: " + error.message); return; }
    toast.success("Token revogado");
    load();
  };

  const copyText = (txt: string) => {
    navigator.clipboard.writeText(txt).then(() => toast.success("Copiado"));
  };

  return (
    <Card className="p-5 bg-card border-border/60">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Plug className="size-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wider">🔌 MCP Tokens</h2>
          <Badge variant="outline" className="text-[10px]">{tokens.length}</Badge>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="size-3.5 mr-1" /> Gerar novo token</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Gerar novo MCP Token</DialogTitle>
              <DialogDescription>
                Permite que clientes externos (Claude.ai, scripts) operem o Pacing Controller via API.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Nome</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="ex: Claude.ai — Gabriel"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs mb-2 block">Scopes</Label>
                <div className="space-y-1.5">
                  {ALL_SCOPES.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-xs cursor-pointer">
                      <Checkbox
                        checked={newScopes.includes(s.id)}
                        onCheckedChange={(v) => setNewScopes((p) => v ? [...p, s.id] : p.filter((x) => x !== s.id))}
                      />
                      <span>{s.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button onClick={handleCreate}>Gerar token</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <p className="text-xs text-muted-foreground mb-4">
        Endpoint MCP: <code className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded">POST /functions/v1/mcp-server</code> · Auth: <code className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded">Authorization: Bearer gtx_...</code>
      </p>

      {loading ? (
        <div className="text-xs text-muted-foreground">Carregando…</div>
      ) : tokens.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">Nenhum token criado ainda.</div>
      ) : (
        <div className="space-y-2">
          {tokens.map((t) => (
            <div key={t.id} className="flex items-start justify-between gap-3 rounded border border-border/60 bg-background px-3 py-2.5">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <KeyRound className="size-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium">{t.name}</span>
                  <code className="font-mono text-[11px] text-muted-foreground">{t.prefix}…</code>
                </div>
                <div className="text-[11px] text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                  <span>criado {new Date(t.created_at).toLocaleDateString("pt-BR")}</span>
                  <span>último uso: {timeAgo(t.last_used_at)}</span>
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {(t.scopes || []).map((s) => (
                    <Badge key={s} variant="outline" className="text-[9px] font-mono">{s}</Badge>
                  ))}
                </div>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                    <Trash2 className="size-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Revogar token "{t.name}"?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Qualquer cliente usando este token perde acesso imediatamente. Esta ação é irreversível.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleRevoke(t.id)}>Revogar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      )}

      {/* Modal mostrando o token recém-criado (única vez) */}
      <Dialog open={!!createdToken} onOpenChange={(o) => !o && setCreatedToken(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Token criado ✅</DialogTitle>
            <DialogDescription className="text-destructive font-medium">
              Esse token só será mostrado UMA vez. Copie e guarde em local seguro.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded border border-border bg-muted/40 p-3">
              <code className="font-mono text-xs break-all">{createdToken}</code>
            </div>
            <Button onClick={() => createdToken && copyText(createdToken)} className="w-full">
              <Copy className="size-3.5 mr-1.5" /> Copiar token
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatedToken(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
