import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, AlertTriangle, Loader2 } from "lucide-react";

// Local wrapper for the beta supabase.auth.oauth namespace.
type OAuthClient = { id?: string; name?: string; client_id?: string; logo_uri?: string };
type AuthorizationDetails = {
  client?: OAuthClient;
  scopes?: string[];
  redirect_url?: string;
  redirect_to?: string;
};
const oauth = (supabase.auth as any).oauth as {
  getAuthorizationDetails: (id: string) => Promise<{ data: AuthorizationDetails | null; error: any }>;
  approveAuthorization: (id: string) => Promise<{ data: { redirect_url?: string; redirect_to?: string } | null; error: any }>;
  denyAuthorization: (id: string) => Promise<{ data: { redirect_url?: string; redirect_to?: string } | null; error: any }>;
};

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) return setError("Missing authorization_id");
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/login?next=" + encodeURIComponent(next);
        return;
      }
      if (!oauth?.getAuthorizationDetails) {
        return setError("OAuth API não disponível no cliente Supabase.");
      }
      const { data, error } = await oauth.getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) return setError(error.message ?? String(error));
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauth.approveAuthorization(authorizationId)
      : await oauth.denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      return setError(error.message ?? String(error));
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      return setError("Servidor de autorização não retornou redirect.");
    }
    window.location.href = target;
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" /> Não foi possível carregar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!details) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  const clientName = details.client?.name ?? "Aplicação externa";
  const scopes = details.scopes ?? [];

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Autorizar {clientName}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm">
            <strong>{clientName}</strong> quer se conectar ao GTX Dash como você e usar as ferramentas MCP disponíveis.
          </p>

          {scopes.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Escopos: {scopes.join(", ")}
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" disabled={busy} onClick={() => decide(false)}>
              Negar
            </Button>
            <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>
              {busy ? "Processando..." : "Autorizar"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
