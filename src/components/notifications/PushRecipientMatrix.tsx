import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, BellOff, ChevronDown, Loader2, Smartphone, SmartphoneNfc } from "lucide-react";
import { toast } from "sonner";
import { PUSH_NOTIFICATION_TYPES, PUSH_TYPE_GROUPS } from "@/lib/pushNotificationTypes";
import { usePushAdminRecipients, usePushAdminUsers, type PushAdminUser } from "@/hooks/usePushAdmin";

interface Props {
  operationId: string;
  operationName: string;
}

const ALL_TYPES = PUSH_NOTIFICATION_TYPES.map((t) => t.type);

export function PushRecipientMatrix({ operationId, operationName }: Props) {
  const { data: users, isLoading: loadingUsers } = usePushAdminUsers(operationId);
  const { rows, isLoading: loadingRows, toggle, setMany, copyFrom } =
    usePushAdminRecipients(operationId);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [copySource, setCopySource] = useState<Record<string, string>>({});

  const enabledSet = useMemo(
    () => new Set(rows.filter((r) => r.enabled).map((r) => `${r.user_id}::${r.notification_type}`)),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users ?? [];
    return (users ?? []).filter(
      (u) =>
        (u.display_name ?? "").toLowerCase().includes(q) ||
        (u.email ?? "").toLowerCase().includes(q),
    );
  }, [users, search]);

  const statusBadge = (u: PushAdminUser) => {
    if (Number(u.device_count) === 0) {
      return (
        <Badge variant="outline" className="border-amber-500/40 text-amber-500 gap-1">
          <AlertTriangle className="h-3 w-3" /> sem dispositivo
        </Badge>
      );
    }
    if (Number(u.recipient_count) === 0) {
      return (
        <Badge variant="outline" className="border-amber-500/40 text-amber-500 gap-1">
          <BellOff className="h-3 w-3" /> silencioso
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="border-emerald-500/40 text-emerald-500 gap-1">
        <SmartphoneNfc className="h-3 w-3" /> {u.recipient_count} tipos ativos
      </Badge>
    );
  };

  const handleToggle = (userId: string, type: string, on: boolean) => {
    toggle.mutate(
      { userId, type, on },
      {
        onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao salvar"),
      },
    );
  };

  if (loadingUsers || loadingRows) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando usuários…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Input
        placeholder="Buscar usuário por nome ou e-mail…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhum usuário encontrado nesta operação.
        </p>
      )}

      {filtered.map((u) => {
        const isOpen = expanded === u.user_id;
        return (
          <Card key={u.user_id} className="border-border/60">
            <CardContent className="p-0">
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : u.user_id)}
                className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
              >
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">
                    {u.display_name ?? u.email ?? u.user_id.slice(0, 8)}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {u.email ?? "—"} · {u.member_role ?? "membro"}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground hidden sm:flex items-center gap-1">
                    <Smartphone className="h-3 w-3" />
                    {u.device_count}
                  </span>
                  {statusBadge(u)}
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-border/60 p-4 space-y-4">
                  {Number(u.device_count) === 0 && (
                    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-muted-foreground">
                      Este usuário ainda não ativou notificações em nenhum dispositivo. Os tipos
                      marcados aqui só começam a chegar depois que ele ativar em
                      <span className="font-medium text-foreground"> App no celular e notificações</span>.
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={setMany.isPending}
                      onClick={() =>
                        setMany.mutate(
                          { userId: u.user_id, types: ALL_TYPES, on: true },
                          {
                            onSuccess: () => toast.success("Todos os tipos ativados"),
                            onError: (e) =>
                              toast.error(e instanceof Error ? e.message : "Falha ao ativar"),
                          },
                        )
                      }
                    >
                      Ativar tudo
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={setMany.isPending}
                      onClick={() =>
                        setMany.mutate(
                          { userId: u.user_id, types: [], on: false },
                          {
                            onSuccess: () => toast.success("Tipos removidos"),
                            onError: (e) =>
                              toast.error(e instanceof Error ? e.message : "Falha ao limpar"),
                          },
                        )
                      }
                    >
                      Limpar tudo
                    </Button>

                    <div className="flex items-center gap-2">
                      <Select
                        value={copySource[u.user_id] ?? ""}
                        onValueChange={(v) => setCopySource((s) => ({ ...s, [u.user_id]: v }))}
                      >
                        <SelectTrigger className="h-9 w-[210px] text-xs">
                          <SelectValue placeholder="Copiar preferências de…" />
                        </SelectTrigger>
                        <SelectContent>
                          {(users ?? [])
                            .filter((o) => o.user_id !== u.user_id)
                            .map((o) => (
                              <SelectItem key={o.user_id} value={o.user_id} className="text-xs">
                                {o.display_name ?? o.email} ({o.recipient_count})
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        disabled={!copySource[u.user_id] || copyFrom.isPending}
                        onClick={() =>
                          copyFrom.mutate(
                            { fromUserId: copySource[u.user_id], toUserId: u.user_id },
                            {
                              onSuccess: (n) => toast.success(`${n} preferências copiadas`),
                              onError: (e) =>
                                toast.error(e instanceof Error ? e.message : "Falha ao copiar"),
                            },
                          )
                        }
                      >
                        Copiar
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {PUSH_TYPE_GROUPS.map((group) => {
                      const items = PUSH_NOTIFICATION_TYPES.filter((t) => t.group === group);
                      if (items.length === 0) return null;
                      return (
                        <div key={group} className="space-y-2">
                          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {group} · {operationName}
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {items.map((t) => {
                              const on = enabledSet.has(`${u.user_id}::${t.type}`);
                              return (
                                <div
                                  key={t.type}
                                  className="flex items-start justify-between gap-3 rounded-md border border-border/50 p-3"
                                >
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium">{t.label}</div>
                                    <div className="text-xs text-muted-foreground">
                                      {t.description}
                                    </div>
                                  </div>
                                  <Switch
                                    checked={on}
                                    disabled={toggle.isPending}
                                    onCheckedChange={(v) => handleToggle(u.user_id, t.type, v)}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
