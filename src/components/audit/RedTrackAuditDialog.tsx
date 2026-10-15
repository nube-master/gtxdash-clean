import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Eye, ArrowRight, AlertCircle, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";

export function RedTrackAuditDialog() {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: auditData, isLoading } = useQuery({
    queryKey: ["redtrack-audit-data"],
    queryFn: async () => {
      // Pega os últimos eventos da RedTrack e tenta cruzar com sales_data
      const { data: events, error: evError } = await supabase
        .from("redtrack_events")
        .select("*")
        .in("event_type", ["purchase", "upsell", "sale"])
        .order("occurred_at", { ascending: false })
        .limit(50);

      if (evError) throw evError;

      const clickIds = events.map(e => e.clickid).filter(Boolean);
      const transactionIds = events.map(e => e.transaction_id).filter(Boolean);
      
      // Busca em sales_data por clickid (prefixo rt:) ou receipt
      const { data: sales, error: sError } = await supabase
        .from("sales_data")
        .select("*")
        .or(`order_id.ilike.rt:%,order_id.in.(${transactionIds.join(',')})`)
        .order("created_at", { ascending: false });

      if (sError) console.warn("Sales fetch error:", sError);

      return events.map(ev => {
        const rp = (ev.raw_payload as any) || {};
        const receipt = String(rp.p_sub1 || rp.receipt || rp.order_id || "").trim();
        
        // Tenta achar a venda correspondente
        const sale = sales?.find(s => 
          s.order_id === `rt:${ev.clickid}` || 
          s.order_id === `rt:${ev.transaction_id}` ||
          (receipt && s.order_id.includes(receipt))
        );

        return {
          event: ev,
          sale: sale || null,
          receipt
        };
      });
    }
  });

  const filtered = useMemo(() => {
    if (!auditData) return [];
    if (!searchTerm) return auditData;
    const s = searchTerm.toLowerCase();
    return auditData.filter(item => 
      item.event.clickid?.toLowerCase().includes(s) ||
      item.event.offer_name?.toLowerCase().includes(s) ||
      item.receipt.toLowerCase().includes(s) ||
      item.sale?.order_id.toLowerCase().includes(s)
    );
  }, [auditData, searchTerm]);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Eye className="h-4 w-4" />
          Auditoria RedTrack
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Auditoria de Atribuição RedTrack
            <Badge variant="outline" className="text-[10px]">DEBUG</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por ClickID, Receipt ou Campanha..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <ScrollArea className="flex-1 border rounded-md">
          <Table>
            <TableHeader className="bg-muted/50 sticky top-0 z-10">
              <TableRow>
                <TableHead className="w-[200px]">Evento RedTrack (Raw)</TableHead>
                <TableHead className="w-[100px]">Platform/Offer</TableHead>
                <TableHead className="w-[50px] text-center"></TableHead>
                <TableHead className="w-[200px]">Venda Processada (Parsed)</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                    Carregando dados de auditoria...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                    Nenhum evento encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((item, idx) => (
                  <TableRow key={idx} className={!item.sale ? "bg-red-500/5" : ""}>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="text-[10px] font-mono text-muted-foreground truncate">
                          ID: {item.event.clickid || item.event.transaction_id}
                        </div>
                        <div className="text-[11px] font-medium leading-tight">
                          {item.event.product_name || "Sem Nome"}
                        </div>
                        <div className="text-[9px] text-muted-foreground italic">
                          Receipt: {item.receipt || "N/A"}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-[10px] space-y-0.5">
                        <div className="font-bold text-primary truncate max-w-[120px]" title={item.event.offer_name}>
                          {item.event.offer_name?.split('|')[1] || "???"}
                        </div>
                        <div className="text-muted-foreground truncate max-w-[120px]">
                          {item.event.offer_name?.split('|')[2] || "???"}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <ArrowRight className="h-4 w-4 text-muted-foreground inline" />
                    </TableCell>
                    <TableCell>
                      {item.sale ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className="text-[9px] h-4 px-1 py-0 uppercase">
                              {item.sale.store}
                            </Badge>
                            <span className="text-[11px] font-bold text-emerald-600">
                              {item.sale.product_name}
                            </span>
                          </div>
                          <div className="text-[9px] text-muted-foreground truncate max-w-[180px]">
                            {item.sale.utm_campaign}
                          </div>
                        </div>
                      ) : (
                        <div className="text-[10px] text-red-500 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          Não Atribuída
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.sale ? (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1 text-[10px] text-emerald-600">
                            <CheckCircle2 className="h-3 w-3" />
                            Sincronizado
                          </div>
                          {item.sale.store === 'clickbank' && (
                            <div className="text-[9px] text-amber-600 font-medium">
                              ⚠️ Detectado como ClickBank
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-[9px] text-muted-foreground">
                          Aguardando Sync / Erro no Parsing
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
        <div className="mt-4 p-3 bg-muted/30 rounded text-[10px] text-muted-foreground border border-dashed">
          <strong>Lógica de Correção:</strong> Se a Plataforma Raw no RedTrack contiver "sphere", "cod" ou "auravita", 
          o processador deve forçar <code className="bg-muted px-1">store: 'sphere'</code> e mapear o produto 
          correto, ignorando inferências de fallback para ClickBank.
        </div>
      </DialogContent>
    </Dialog>
  );
}
