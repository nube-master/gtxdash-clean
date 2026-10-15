import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperationId } from "@/contexts/OperationContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import { Card, CardContent } from "@/components/ui/card";
import { ShoppingCart, Building2, Landmark, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

export function InitiatedCheckoutsByAccount() {
  const operationId = useOperationId();
  const { dateRange } = useDateRange();
  const [start, end] = dateRange;

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["initiated-checkouts-by-account", start, end, operationId],
    queryFn: async () => {
      if (!operationId) return [];

      const { data, error } = await supabase
        .from("traffic_data")
        .select(`
          initiate_checkout,
          account_id,
          campaign_name,
          meta_ad_accounts (
            account_name,
            operation_id
          )
        `)
        .gte("date", start)
        .lte("date", end)
        .eq("meta_ad_accounts.operation_id", operationId)
        .ilike("campaign_name", "%top%");

      if (error) throw error;

      const accMap = new Map<string, number>();
      (data || []).forEach((row: any) => {
        const name = row.meta_ad_accounts?.account_name || "Conta Desconhecida";
        const val = Number(row.initiate_checkout || 0);
        if (val > 0) {
          accMap.set(name, (accMap.get(name) || 0) + val);
        }
      });

      return Array.from(accMap.entries())
        .map(([name, ics]) => ({ name, ics }))
        .sort((a, b) => b.ics - a.ics);
    },
    enabled: !!operationId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!accounts || accounts.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
        <ShoppingCart className="h-3.5 w-3.5" />
        Distribuição de ICs (Meta) por Conta
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {accounts.map((acc, i) => (
          <motion.div
            key={acc.name}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Card className="bg-card border border-border/50 hover:border-primary/30 transition-colors">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                    {acc.name.toLowerCase().includes("bm") || acc.name.toLowerCase().includes("c0") ? (
                      <Building2 className="h-4 w-4 text-primary" />
                    ) : (
                      <Landmark className="h-4 w-4 text-primary" />
                    )}
                  </div>
                  <div className="max-w-[150px] md:max-w-[200px]">
                    <p className="text-[11px] font-semibold text-foreground truncate" title={acc.name}>
                      {acc.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Campanhas [TOP]</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold font-data text-primary">{acc.ics}</p>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Checkouts</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
