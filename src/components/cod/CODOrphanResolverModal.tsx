import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Link } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operationId?: string;
}

export function CODOrphanResolverModal({ open, onOpenChange, operationId }: Props) {
  const queryClient = useQueryClient();
  
  const { data: orphans, isLoading } = useQuery({
    queryKey: ["cod-orphans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orphan_orders")
        .select("*")
        .is("resolved_at", null)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const resolveMutation = useMutation({
    mutationFn: async (affiliateNickname: string) => {
      if (!operationId) throw new Error("Operação não selecionada");

      // 1. Criar mapping
      const { error: mapError } = await supabase
        .from("affiliate_mappings")
        .insert({
          nickname: affiliateNickname,
          operation_id: operationId,
          platform: "shphere"
        });
      
      if (mapError && !mapError.message.includes("unique constraint")) throw mapError;

      // 2. Marcar órfãos como resolvidos
      const { error: resolveError } = await supabase
        .from("orphan_orders")
        .update({ 
          resolved_at: new Date().toISOString(),
          resolved_operation_id: operationId 
        })
        .is("resolved_at", null)
        .contains("raw_payload", { afiliado: { nickname: affiliateNickname } });

      if (resolveError) throw resolveError;

      // Nota: O reprocessamento real dos pedidos deve ser feito via Edge Function ou manualmente se necessário,
      // aqui estamos apenas limpando a UI e garantindo futuros mapeamentos.
      return affiliateNickname;
    },
    onSuccess: (nickname) => {
      toast.success(`Afiliado ${nickname} vinculado com sucesso!`);
      queryClient.invalidateQueries({ queryKey: ["cod-orphans"] });
      queryClient.invalidateQueries({ queryKey: ["cod-daily"] });
    },
    onError: (err: any) => {
      toast.error("Erro ao vincular: " + err.message);
    }
  });

  const uniqueAffiliates = orphans?.reduce((acc: any[], curr: any) => {
    const nickname = curr.raw_payload?.afiliado?.nickname || curr.raw_payload?.affiliate_username || "Desconhecido";
    const existing = acc.find(a => a.nickname === nickname);
    if (existing) {
      existing.count++;
    } else {
      acc.push({ nickname, count: 1 });
    }
    return acc;
  }, []) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            Pedidos sem Mapeamento
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 mt-4">
          <p className="text-xs text-muted-foreground">
            Estes afiliados enviaram pedidos que não foram atribuídos a nenhuma operação.
            Vincule-os à operação atual para processar pedidos futuros.
          </p>

          <div className="space-y-2">
            {isLoading ? (
              <div className="text-center py-4 text-xs text-muted-foreground">Carregando...</div>
            ) : uniqueAffiliates.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground">Tudo limpo! Nenhum órfão pendente.</div>
            ) : (
              uniqueAffiliates.map((aff) => (
                <div key={aff.nickname} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
                  <div>
                    <div className="text-sm font-medium">{aff.nickname}</div>
                    <div className="text-[10px] text-muted-foreground">{aff.count} pedidos aguardando</div>
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => resolveMutation.mutate(aff.nickname)}
                    disabled={resolveMutation.isPending}
                  >
                    <Link className="h-3.5 w-3.5" />
                    Vincular
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
