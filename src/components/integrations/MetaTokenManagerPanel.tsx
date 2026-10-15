import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperationId } from "@/contexts/OperationContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, KeyRound, ShieldCheck, ShieldAlert, Trash2, Plus, AlertCircle, Info } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function MetaTokenManagerPanel() {
  const operationId = useOperationId();
  const qc = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newToken, setNewToken] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<any>(null);

  const { data: credentials, isLoading } = useQuery({
    queryKey: ["meta-operation-tokens", operationId],
    enabled: !!operationId,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("meta-token-manager", {
        body: { operation_id: operationId, mode: "list" }
      });
      if (error) throw error;
      return data.credentials as any[];
    }
  });

  const verifyMutation = useMutation({
    mutationFn: async () => {
      setVerifying(true);
      const { data, error } = await supabase.functions.invoke("meta-token-manager", {
        body: { operation_id: operationId, mode: "verify", token: newToken }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setVerifyResult(data);
    },
    onError: (err: any) => {
      toast.error(`Falha na verificação: ${err.message}`);
    },
    onSettled: () => setVerifying(false)
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("save-meta-token", {
        body: {
          mode: "save",
          operation_id: operationId,
          token: newToken,
          label: newLabel.trim().toLowerCase().replace(/\s+/g, "_"),
          account_ids: verifyResult.adaccounts.map((a: any) => a.account_id)
        }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Token vinculado com sucesso!");
      qc.invalidateQueries({ queryKey: ["meta-operation-tokens"] });
      qc.invalidateQueries({ queryKey: ["meta-accounts"] });
      setIsAddOpen(false);
      resetAdd();
    },
    onError: (err: any) => {
      toast.error(`Falha ao salvar: ${err.message}`);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke("meta-token-manager", {
        body: { operation_id: operationId, mode: "delete", credential_id: id }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Token removido.");
      qc.invalidateQueries({ queryKey: ["meta-operation-tokens"] });
    }
  });

  const resetAdd = () => {
    setNewToken("");
    setNewLabel("");
    setVerifyResult(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          Tokens vinculados à Operação
        </h3>
        <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) resetAdd(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-8 gap-2">
              <Plus className="h-3.5 w-3.5" />
              Vincular Novo
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Adicionar Token Meta Ads</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Apelido Interno (perfil)</Label>
                <Input 
                  placeholder="ex: perfil_luis, bm_reserva" 
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Access Token (Graph API)</Label>
                <Input 
                  type="password"
                  placeholder="EAAG..." 
                  value={newToken}
                  onChange={(e) => setNewToken(e.target.value)}
                />
              </div>
              
              {!verifyResult && (
                <Button 
                  className="w-full" 
                  onClick={() => verifyMutation.mutate()} 
                  disabled={verifying || !newToken || !newLabel}
                >
                  {verifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Testar & Buscar Contas"}
                </Button>
              )}

              {verifyResult && (
                <div className="space-y-4 animate-in fade-in zoom-in duration-200">
                  <div className={`p-3 rounded-lg border text-sm flex items-start gap-3 ${verifyResult.me.error ? 'border-destructive bg-destructive/10' : 'border-emerald-500/30 bg-emerald-500/5'}`}>
                    {verifyResult.me.error ? <AlertCircle className="h-4 w-4 text-destructive mt-0.5" /> : <ShieldCheck className="h-4 w-4 text-emerald-500 mt-0.5" />}
                    <div>
                      <div className="font-semibold">{verifyResult.me.error ? "Token Inválido" : `Usuário: ${verifyResult.me.name}`}</div>
                      <div className="text-muted-foreground text-xs">{verifyResult.me.error || `ID: ${verifyResult.me.id} • App: ${verifyResult.debug?.application || 'N/A'}`}</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase text-muted-foreground">Contas visíveis ({verifyResult.adaccounts?.length || 0})</Label>
                    <div className="max-h-[200px] overflow-y-auto border rounded-md">
                      <Table>
                        <TableBody>
                          {verifyResult.adaccounts?.map((acc: any) => (
                            <TableRow key={acc.id} className="h-8">
                              <TableCell className="py-1 text-xs">{acc.name}</TableCell>
                              <TableCell className="py-1 text-[10px] text-muted-foreground font-mono">act_{acc.account_id}</TableCell>
                              <TableCell className="py-1 text-right">
                                {acc.tasks?.includes('MANAGE') ? (
                                  <Badge className="bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/30 text-[9px]">MANAGE</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[9px]">READ</Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                          {!verifyResult.adaccounts?.length && (
                            <TableRow>
                              <TableCell colSpan={3} className="text-center py-4 text-muted-foreground text-xs">Nenhuma conta encontrada.</TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsAddOpen(false)}>Cancelar</Button>
              <Button 
                onClick={() => saveMutation.mutate()} 
                disabled={!verifyResult || verifyResult.me.error || saveMutation.isPending}
              >
                {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Vincular à Operação"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid gap-3">
          {credentials?.map((cred) => (
            <Card key={cred.id} className="bg-muted/30 border-border/50">
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${cred.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-destructive/10 text-destructive'}`}>
                    {cred.status === 'active' ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
                  </div>
                  <div>
                    <div className="text-sm font-semibold flex items-center gap-2">
                      {cred.profile_key}
                      <Badge variant="outline" className="text-[10px] h-4">{cred.metadata?.me_name || 'System User'}</Badge>
                    </div>
                    <div className="text-[10px] text-muted-foreground flex gap-2">
                      <span>ID: {cred.vault_secret_name?.split('_').pop() || '...'}</span>
                      <span>•</span>
                      <span>{cred.account_ids?.length || 0} contas vinculadas</span>
                    </div>
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => { if(confirm("Remover este token?")) deleteMutation.mutate(cred.id); }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
          {credentials?.length === 0 && (
            <div className="text-center py-8 rounded-lg border border-dashed border-border/60 bg-muted/20">
              <Info className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-30" />
              <p className="text-xs text-muted-foreground">Nenhum token personalizado vinculado.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
