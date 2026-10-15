import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search,
  ShieldAlert,
  ShieldCheck,
  Power,
  PowerOff,
  Activity,
  Loader2,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";

type EventKind = "orphan_open" | "orphan_resolved" | "status_change";

interface TimelineEvent {
  at: string;
  kind: EventKind;
  account_id: string;
  account_name: string;
  detail: string;
  raw?: any;
}

function statusLabel(s: number | null | undefined) {
  switch (s) {
    case 1: return "ACTIVE";
    case 2: return "DISABLED";
    case 3: return "UNSETTLED";
    case 7: return "PENDING_RISK";
    case 8: return "PENDING_SETTLEMENT";
    case 9: return "IN_GRACE_PERIOD";
    case 100: return "PENDING_CLOSURE";
    case 101: return "CLOSED";
    default: return s == null ? "—" : `STATUS_${s}`;
  }
}

function KindIcon({ kind }: { kind: EventKind }) {
  if (kind === "orphan_open")
    return <ShieldAlert className="h-4 w-4 text-red-500" />;
  if (kind === "orphan_resolved")
    return <ShieldCheck className="h-4 w-4 text-emerald-500" />;
  return <Activity className="h-4 w-4 text-sky-500" />;
}

export function AccountTimelinePanel() {
  const [search, setSearch] = useState("");
  const [selectedAcc, setSelectedAcc] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["account-timeline-events"],
    queryFn: async () => {
      const [alertsRes, statusRes] = await Promise.all([
        supabase
          .from("meta_permission_alerts")
          .select(
            "account_id,account_name,status,first_detected_at,resolved_at,last_seen_at,alert_type,system_user_label,details",
          )
          .eq("alert_type", "account_orphaned")
          .not("account_id", "is", null)
          .order("first_detected_at", { ascending: false })
          .limit(1000),
        supabase
          .from("account_status_log")
          .select("account_id,account_name,old_status,new_status,changed_at")
          .order("changed_at", { ascending: false })
          .limit(1000),
      ]);
      if (alertsRes.error) throw alertsRes.error;
      if (statusRes.error) throw statusRes.error;

      const events: TimelineEvent[] = [];

      for (const a of alertsRes.data ?? []) {
        events.push({
          at: a.first_detected_at as string,
          kind: "orphan_open",
          account_id: a.account_id as string,
          account_name: (a.account_name as string) ?? "—",
          detail: `entrou em órfã (sync ${a.system_user_label ?? "?"} não retornou)`,
          raw: a,
        });
        if (a.status === "resolved" && a.resolved_at) {
          events.push({
            at: a.resolved_at as string,
            kind: "orphan_resolved",
            account_id: a.account_id as string,
            account_name: (a.account_name as string) ?? "—",
            detail: `saiu de órfã — voltou pro inventário`,
            raw: a,
          });
        }
      }
      for (const s of statusRes.data ?? []) {
        events.push({
          at: s.changed_at as string,
          kind: "status_change",
          account_id: s.account_id as string,
          account_name: (s.account_name as string) ?? "—",
          detail: `is_active: ${statusLabel(s.old_status as number)} → ${statusLabel(s.new_status as number)}`,
          raw: s,
        });
      }
      events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      return events;
    },
    staleTime: 60_000,
  });

  const events = data ?? [];

  const accountsIndex = useMemo(() => {
    const map = new Map<
      string,
      { account_id: string; account_name: string; count: number; last: string }
    >();
    for (const e of events) {
      const cur = map.get(e.account_id);
      if (!cur) {
        map.set(e.account_id, {
          account_id: e.account_id,
          account_name: e.account_name,
          count: 1,
          last: e.at,
        });
      } else {
        cur.count += 1;
        if (new Date(e.at) > new Date(cur.last)) cur.last = e.at;
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.last).getTime() - new Date(a.last).getTime(),
    );
  }, [events]);

  const filtered = accountsIndex.filter((a) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      a.account_name.toLowerCase().includes(q) || a.account_id.includes(q)
    );
  });

  const timeline = selectedAcc
    ? events.filter((e) => e.account_id === selectedAcc)
    : [];

  const selectedMeta = accountsIndex.find((a) => a.account_id === selectedAcc);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Linha do tempo por conta
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Cada entrada/saída de órfã (últimos alertas do watchdog) e cada mudança de
          is_active detectada pelos syncs. Clique numa conta pra ver o histórico.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando eventos…
          </div>
        ) : (
          <div className="grid md:grid-cols-[320px_1fr] gap-4">
            {/* Left: accounts list */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input
                  placeholder="Buscar conta (nome ou ID)"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-7 h-8 text-xs"
                />
              </div>
              <ScrollArea className="h-[460px] rounded border">
                <div className="p-1">
                  {filtered.length === 0 && (
                    <p className="text-xs text-muted-foreground p-3">
                      Nenhuma conta com eventos.
                    </p>
                  )}
                  {filtered.map((a) => {
                    const isSel = a.account_id === selectedAcc;
                    return (
                      <button
                        key={a.account_id}
                        onClick={() => setSelectedAcc(a.account_id)}
                        className={`w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted transition ${
                          isSel ? "bg-muted" : ""
                        }`}
                      >
                        <div className="font-medium truncate">
                          {a.account_name || "—"}
                        </div>
                        <div className="flex items-center justify-between mt-0.5">
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {a.account_id}
                          </span>
                          <Badge
                            variant="outline"
                            className="text-[10px] h-4 px-1"
                          >
                            {a.count} evt
                          </Badge>
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {formatDistanceToNow(new Date(a.last), {
                            locale: ptBR,
                            addSuffix: true,
                          })}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
              <p className="text-[10px] text-muted-foreground">
                {accountsIndex.length} contas · {events.length} eventos totais
              </p>
            </div>

            {/* Right: timeline */}
            <div>
              {!selectedAcc ? (
                <div className="h-[460px] flex items-center justify-center text-sm text-muted-foreground border rounded">
                  Selecione uma conta pra ver a linha do tempo.
                </div>
              ) : (
                <>
                  <div className="mb-3">
                    <div className="text-sm font-medium">
                      {selectedMeta?.account_name}
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground">
                      act_{selectedAcc}
                    </div>
                  </div>
                  <ScrollArea className="h-[420px] pr-3">
                    <ol className="relative border-l border-muted ml-2">
                      {timeline.map((e, i) => (
                        <li key={i} className="mb-4 ml-4">
                          <span className="absolute -left-2 flex h-4 w-4 items-center justify-center rounded-full bg-background ring-2 ring-muted">
                            <KindIcon kind={e.kind} />
                          </span>
                          <div className="flex items-center gap-2 flex-wrap">
                            <time className="text-[11px] font-mono text-muted-foreground">
                              {format(new Date(e.at), "dd/MM HH:mm:ss", {
                                locale: ptBR,
                              })}
                            </time>
                            <span className="text-[10px] text-muted-foreground">
                              (
                              {formatDistanceToNow(new Date(e.at), {
                                locale: ptBR,
                                addSuffix: true,
                              })}
                              )
                            </span>
                          </div>
                          <p className="text-xs mt-0.5">{e.detail}</p>
                        </li>
                      ))}
                    </ol>
                  </ScrollArea>
                </>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
