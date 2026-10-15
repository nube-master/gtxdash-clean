import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  BellRing,
  CheckCircle2,
  Phone,
  Share,
  AlertTriangle,
  Loader2,
  Smartphone,
  Trash2,
  BellOff,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWebPush, isIOS, isStandalone } from "@/hooks/useWebPush";
import { usePushDevices, useMyPushRecipients } from "@/hooks/usePushDevices";
import { useOperation } from "@/contexts/OperationContext";
import { pushTypeLabel } from "@/lib/pushNotificationTypes";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const fmtDate = (v?: string | null) =>
  v ? new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";

export default function Notifications() {
  const { isSupported, permission, isSubscribed, loading, subscribe, unsubscribe, test } =
    useWebPush();
  const { devices, currentEndpoint, removeDevice, refetch: refetchDevices } = usePushDevices();
  const { data: myRecipients } = useMyPushRecipients();
  const { operations } = useOperation();
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const installed = isStandalone();
  const ios = isIOS();
  // iOS só permite web push quando o site está instalado na tela inicial
  const needsIOSInstall = ios && !installed;

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const { data: history } = useQuery({
    queryKey: ["push-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("push_notification_history")
        .select("id, notification_type, title, status, sent_at")
        .order("sent_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      return data ?? [];
    },
  });

  const opNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of operations ?? []) map.set(o.id, o.name);
    return map;
  }, [operations]);

  const receivingByOp = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const r of myRecipients ?? []) {
      const key = r.operation_id ?? "—";
      map.set(key, [...(map.get(key) ?? []), pushTypeLabel(r.notification_type)]);
    }
    return [...map.entries()];
  }, [myRecipients]);

  const handleSubscribe = async () => {
    try {
      await subscribe();
      refetchDevices();
      toast.success("Notificações ativadas neste aparelho");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao ativar notificações");
    }
  };

  const handleUnsubscribe = async () => {
    try {
      await unsubscribe();
      refetchDevices();
      toast.success("Notificações desativadas neste aparelho");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao desativar");
    }
  };

  const handleTest = async () => {
    try {
      await test();
      toast.success("Teste enviado — confira a notificação");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar teste");
    }
  };

  const handleInstall = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  };

  return (
    <div className="full-width-page w-full space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          App no celular e notificações
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Instale o Traffic OS como atalho no celular e ative avisos de vendas, comissões e lembretes.
        </p>
      </div>

      {/* BLOCO 1 — Instalar no celular */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Phone className="h-4 w-4 text-muted-foreground" />
            Instalar no celular (atalho)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {installed ? (
            <div className="flex items-center gap-2 text-emerald-500 font-medium">
              <CheckCircle2 className="h-4 w-4" />
              App instalado — você já está usando
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-md border border-border/60 p-3 space-y-1">
                <div className="font-medium flex items-center gap-2">
                  <Share className="h-4 w-4" /> iPhone / iPad
                </div>
                <p className="text-muted-foreground">
                  Toque no botão Share → “Add to Home Screen” e abra o app pelo ícone.
                </p>
              </div>
              <div className="rounded-md border border-border/60 p-3 space-y-2">
                <div className="font-medium">Android</div>
                {installEvent ? (
                  <Button size="sm" onClick={handleInstall}>
                    Install App
                  </Button>
                ) : (
                  <p className="text-muted-foreground">
                    Abra o menu do navegador → “Instalar app” / “Adicionar à tela inicial”.
                  </p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* BLOCO 2 — Meu dispositivo */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            {isSubscribed ? (
              <BellRing className="h-4 w-4 text-primary" />
            ) : (
              <Bell className="h-4 w-4 text-muted-foreground" />
            )}
            Meu dispositivo
            <Badge
              variant="outline"
              className={
                isSubscribed
                  ? "border-emerald-500/40 text-emerald-500"
                  : permission === "denied"
                    ? "border-destructive/40 text-destructive"
                    : "border-border text-muted-foreground"
              }
            >
              {isSubscribed ? "Ativo" : permission === "denied" ? "Bloqueado" : "Desativado"}
            </Badge>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Receba avisos direto no celular — mesmo com o app fechado.
          </p>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {/* Status atual do dispositivo */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div className="rounded-md border border-border/60 p-2">
              <div className="text-[10px] uppercase text-muted-foreground">Permissão</div>
              <div className="font-medium">
                {permission === "granted"
                  ? "Liberada"
                  : permission === "denied"
                    ? "Negada"
                    : permission === "unsupported"
                      ? "Não suportada"
                      : "Não pedida"}
              </div>
            </div>
            <div className="rounded-md border border-border/60 p-2">
              <div className="text-[10px] uppercase text-muted-foreground">App instalado</div>
              <div className="font-medium">{installed ? "Sim" : "Não"}</div>
            </div>
            <div className="rounded-md border border-border/60 p-2">
              <div className="text-[10px] uppercase text-muted-foreground">Dispositivo</div>
              <div className="font-medium">{isSubscribed ? "Cadastrado" : "Não cadastrado"}</div>
            </div>
          </div>

          {!isSupported && !needsIOSInstall ? (
            <p className="text-muted-foreground">Este navegador não suporta notificações push.</p>
          ) : needsIOSInstall ? (
            <Alert className="border-amber-500/40 bg-amber-500/10">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <AlertTitle className="text-amber-500">Instale o app primeiro (iPhone/iPad)</AlertTitle>
              <AlertDescription className="text-muted-foreground space-y-2">
                <p>
                  No iPhone, a Apple só permite notificações quando o site está na tela inicial.
                  Faça assim (leva 20 segundos):
                </p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>
                    Toque no ícone <span className="font-medium">Compartilhar</span> (quadrado com
                    seta pra cima) na barra do Safari.
                  </li>
                  <li>
                    Escolha <span className="font-medium">“Adicionar à Tela de Início”</span> (Add to
                    Home Screen) e confirme.
                  </li>
                  <li>Feche o Safari e abra o Traffic OS pelo ícone novo.</li>
                  <li>Volte nesta tela e toque em “Ativar notificações”.</li>
                </ol>
                <p className="text-xs">Requer iOS 16.4 ou superior.</p>
                <Button size="sm" variant="outline" className="min-h-[44px]" disabled>
                  Instalar app primeiro
                </Button>
              </AlertDescription>
            </Alert>
          ) : permission === "denied" ? (
            <Alert className="border-amber-500/40 bg-amber-500/10">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <AlertTitle className="text-amber-500">Permissão negada</AlertTitle>
              <AlertDescription className="text-muted-foreground space-y-1">
                <p>Libere as notificações manualmente e volte aqui:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>
                    <span className="font-medium">iPhone/iPad:</span> Ajustes → Notificações → Traffic
                    OS → Permitir notificações.
                  </li>
                  <li>
                    <span className="font-medium">Android/Chrome:</span> ícone do cadeado na barra de
                    endereço → Permissões → Notificações → Permitir.
                  </li>
                  <li>
                    <span className="font-medium">Desktop:</span> cadeado ao lado da URL → Notificações
                    → Permitir → recarregue a página.
                  </li>
                </ul>
              </AlertDescription>
            </Alert>
          ) : isSubscribed ? (
            <div className="flex flex-col sm:flex-row flex-wrap gap-2">
              <Button className="min-h-[44px] w-full sm:w-auto" onClick={handleTest} disabled={loading}>
                Enviar teste
              </Button>
              <Button
                variant="outline"
                className="min-h-[44px] w-full sm:w-auto"
                onClick={handleUnsubscribe}
                disabled={loading}
              >
                Desativar neste dispositivo
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Button
                size="lg"
                className="w-full sm:w-auto min-h-[48px] text-base"
                onClick={handleSubscribe}
                disabled={loading}
              >
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {permission === "granted"
                  ? "Cadastrar este dispositivo"
                  : "Ativar notificações neste dispositivo"}
              </Button>
              <p className="text-xs text-muted-foreground">
                {permission === "granted"
                  ? "Permissão já liberada — falta só registrar este aparelho para receber os avisos."
                  : "Vamos pedir sua permissão de notificações agora. Toque em “Permitir” quando o aviso do sistema aparecer."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* BLOCO 3 — Meus dispositivos */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-muted-foreground" />
            Meus dispositivos ({devices.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {devices.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum dispositivo cadastrado ainda.</p>
          ) : (
            devices.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border/60 p-3"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
                    {d.device_label ?? "Dispositivo"}
                    {currentEndpoint === d.endpoint && (
                      <Badge variant="outline" className="border-primary/40 text-primary text-[10px]">
                        ESTE
                      </Badge>
                    )}
                    {!d.enabled && (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        inativo
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Ativo desde {fmtDate(d.created_at)}
                    {d.last_used_at ? ` · último envio ${fmtDate(d.last_used_at)}` : ""}
                  </div>
                  <div className="text-[10px] text-muted-foreground/70 truncate max-w-[420px]">
                    {d.endpoint}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive shrink-0"
                  disabled={removeDevice.isPending}
                  onClick={() =>
                    removeDevice.mutate(d, {
                      onSuccess: () => toast.success("Dispositivo removido"),
                      onError: (e) =>
                        toast.error(e instanceof Error ? e.message : "Falha ao remover"),
                    })
                  }
                >
                  <Trash2 className="h-4 w-4 mr-1" /> Remover
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* BLOCO 4 — O que eu recebo */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">O que eu recebo hoje</CardTitle>
          <p className="text-sm text-muted-foreground">
            Quem liga e desliga estes alertas é o administrador da operação.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {receivingByOp.length === 0 ? (
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <BellOff className="h-4 w-4 mt-0.5 text-amber-500" />
              Nenhum alerta liberado ainda — peça ao administrador da operação para liberar.
            </div>
          ) : (
            receivingByOp.map(([opId, types]) => (
              <div key={opId} className="rounded-md border border-border/60 p-3">
                <div className="text-sm font-medium">{opNameById.get(opId) ?? "Operação"}</div>
                <div className="text-xs text-muted-foreground mt-1">{types.join(" · ")}</div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* BLOCO 5 — Histórico */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Histórico (últimas 25)</CardTitle>
        </CardHeader>
        <CardContent>
          {!history || history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma notificação enviada ainda.</p>
          ) : (
            <>
              <div className="space-y-2 md:hidden">
                {history.map((h) => (
                  <div key={h.id} className="rounded-md border border-border/60 p-3 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium break-words">{h.title ?? "—"}</span>
                      <Badge
                        variant="outline"
                        className={
                          h.status === "sent"
                            ? "border-emerald-500/40 text-emerald-500 shrink-0"
                            : "border-destructive/40 text-destructive shrink-0"
                        }
                      >
                        {h.status ?? "—"}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {pushTypeLabel(h.notification_type)} · {fmtDate(h.sent_at as string)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground text-xs border-b border-border/60">
                      <th className="text-left py-2 pr-3 font-medium">Data/hora</th>
                      <th className="text-left py-2 pr-3 font-medium">Tipo</th>
                      <th className="text-left py-2 pr-3 font-medium">Título</th>
                      <th className="text-left py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id} className="border-b border-border/30 last:border-0">
                        <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(h.sent_at as string)}</td>
                        <td className="py-2 pr-3">{pushTypeLabel(h.notification_type)}</td>
                        <td className="py-2 pr-3">{h.title ?? "—"}</td>
                        <td className="py-2">
                          <Badge
                            variant="outline"
                            className={
                              h.status === "sent"
                                ? "border-emerald-500/40 text-emerald-500"
                                : "border-destructive/40 text-destructive"
                            }
                          >
                            {h.status ?? "—"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
