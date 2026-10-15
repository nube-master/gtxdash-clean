import { useEffect, useState } from "react";
import { Bell, Check, Flame, TrendingUp, Plus as PlusIcon, Sparkles, Rocket, LineChart } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useOperationId } from "@/contexts/OperationContext";
import { shouldSkipRtPayload } from "@/lib/realtimeTenantGuard";

type SpyAlertRow = {
  id: string;
  offer_id: string | null;
  event_type: "escalando" | "new_ads" | "score_jump" | "new_offer" | "constant_growth" | "emerging_growth" | "daily_digest" | "dead_offer";
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
  pushcut_sent: boolean;
};

const ICONS: Record<SpyAlertRow["event_type"], React.ReactNode> = {
  escalando: <Flame className="h-3.5 w-3.5 text-orange-500" />,
  new_ads: <PlusIcon className="h-3.5 w-3.5 text-blue-500" />,
  score_jump: <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />,
  new_offer: <Sparkles className="h-3.5 w-3.5 text-purple-500" />,
  constant_growth: <Rocket className="h-3.5 w-3.5 text-rose-500" />,
  emerging_growth: <LineChart className="h-3.5 w-3.5 text-cyan-500" />,
  daily_digest: <Sparkles className="h-3.5 w-3.5 text-amber-500" />,
  dead_offer: <TrendingUp className="h-3.5 w-3.5 text-zinc-500 rotate-180" />,
};

export function SpyAlertsBell() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const operationId = useOperationId();

  const { data: alerts = [] } = useQuery({
    queryKey: ["spy_alerts", operationId],
    queryFn: async () => {
      let q: any = supabase
        .from("spy_alerts")
        .select("id, offer_id, event_type, title, body, read_at, created_at, pushcut_sent")
        .order("created_at", { ascending: false })
        .limit(50);
      if (operationId) q = q.eq("operation_id", operationId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as SpyAlertRow[];
    },
    refetchInterval: 60_000,
  });

  // realtime — Bloco 4: guard por operation_id (evita flash cross-tenant no sininho)
  useEffect(() => {
    if (!operationId) return;
    const ch = supabase
      .channel(`spy_alerts_rt-${operationId}`)
      .on(
        "postgres_changes", 
        { 
          event: "INSERT", 
          schema: "public", 
          table: "spy_alerts",
          filter: `operation_id=eq.${operationId}`
        }, 
        (payload: any) => {
          if (shouldSkipRtPayload(payload, operationId, "SpyAlertsBell")) return;
          qc.invalidateQueries({ queryKey: ["spy_alerts", operationId] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc, operationId]);

  const unreadCount = alerts.filter((a) => !a.read_at).length;

  const markAllRead = useMutation({
    mutationFn: async () => {
      const ids = alerts.filter((a) => !a.read_at).map((a) => a.id);
      if (!ids.length) return;
      await supabase.from("spy_alerts").update({ read_at: new Date().toISOString() }).in("id", ids);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["spy_alerts"] }),
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="relative">
          <Bell className="h-3.5 w-3.5" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 text-[10px] bg-orange-500 hover:bg-orange-500 text-white border-0">
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0">
        <div className="flex items-center justify-between border-b border-border p-3">
          <div>
            <p className="text-sm font-semibold">Alertas Spy</p>
            <p className="text-[11px] text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} não lido${unreadCount > 1 ? "s" : ""}` : "Tudo em dia"}
            </p>
          </div>
          {unreadCount > 0 && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => markAllRead.mutate()}>
              <Check className="h-3 w-3 mr-1" /> Marcar lidos
            </Button>
          )}
        </div>
        <ScrollArea className="h-[420px]">
          {alerts.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              Nenhum alerta ainda. Eles aparecem quando ofertas escalam, ganham score ou novas ads.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {alerts.map((a) => (
                <li
                  key={a.id}
                  className={`px-3 py-2.5 hover:bg-muted/40 ${!a.read_at ? "bg-primary/5" : ""}`}
                >
                  <Link
                    to={a.offer_id ? `/spy/${a.offer_id}` : "/spy"}
                    onClick={() => setOpen(false)}
                    className="flex gap-2.5"
                  >
                    <div className="mt-0.5">{ICONS[a.event_type]}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{a.title}</p>
                      <p className="text-[11px] text-muted-foreground line-clamp-2">{a.body}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: ptBR })}
                        </span>
                        {a.pushcut_sent && (
                          <span className="text-[10px] text-emerald-600">📲 Pushcut enviado</span>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
