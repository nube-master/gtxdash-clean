import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, AlertTriangle } from "lucide-react";

const SCOPE_LABELS: Record<string, string> = {
  "rules:read": "Ler regras de pacing",
  "rules:write": "Criar/editar/remover regras de pacing",
  "groups:read": "Ler budget groups",
  "groups:write": "Criar/editar budget groups",
  "log:read": "Ler logs de ações automáticas",
  "campaigns:write": "Pausar/religar campanhas Meta Ads",
  "settings:read": "Ler configurações da aplicação",
};

const MCP_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mcp-server`;

export default function McpConsent() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [sessionReady, setSessionReady] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [userEmail, setUserEmail] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const client_id = params.get("client_id") || "";
  const client_name = params.get("client_name") || "Aplicação desconhecida";
  const redirect_uri = params.get("redirect_uri") || "";
  const scope = params.get("scope") || "";
  const state = params.get("state") || "";
  const code_challenge = params.get("code_challenge") || "";
  const code_challenge_method = params.get("code_challenge_method") || "S256";

  const scopes = useMemo(() => scope.split(/\s+/).filter(Boolean), [scope]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setIsAuthed(!!data.session);
      setUserEmail(data.session?.user.email || "");
      setSessionReady(true);
    });
  }, []);

  const decide = async (action: "approve" | "deny") => {
    setLoading(true);
    setError("");
    try {
      const { data: sess } = await supabase.auth.getSession();
      const jwt = sess.session?.access_token;
      if (!jwt) throw new Error("Sessão inválida — faça login novamente.");
      const res = await fetch(`${MCP_BASE}/authorize/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          action,
          client_id,
          redirect_uri,
          scope,
          state,
          code_challenge,
          code_challenge_method,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error_description || json.error || "Falha");
      if (json.redirect) {
        window.location.href = json.redirect;
      } else {
        throw new Error("Resposta sem URL de redirect");
      }
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  };

  if (!sessionReady) return null;

  if (!isAuthed) {
    const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" /> Login necessário</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Para autorizar <strong>{client_name}</strong> a acessar sua conta, faça login primeiro.
            </p>
            <Button className="w-full" onClick={() => navigate(`/auth?return_to=${returnTo}`)}>
              Fazer login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!client_id || !redirect_uri) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardHeader><CardTitle>Parâmetros inválidos</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">Faltam client_id ou redirect_uri.</p></CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Autorizar acesso ao GTX Dash
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="text-sm">
            <strong>{client_name}</strong> está pedindo permissão para acessar sua conta
            (<span className="text-muted-foreground">{userEmail}</span>):
          </div>

          <ul className="space-y-2">
            {scopes.length === 0 && (
              <li className="text-sm text-muted-foreground">Nenhum scope solicitado.</li>
            )}
            {scopes.map((s) => (
              <li key={s} className="flex items-start gap-2 text-sm">
                <span className="text-green-500">✓</span>
                <div>
                  <div>{SCOPE_LABELS[s] || s}</div>
                  <Badge variant="outline" className="mt-1 text-[10px]">{s}</Badge>
                </div>
              </li>
            ))}
          </ul>

          <div className="text-xs text-muted-foreground border rounded p-2 break-all">
            Redirect: {redirect_uri}
          </div>

          {error && (
            <div className="text-sm text-destructive border border-destructive/40 rounded p-2">{error}</div>
          )}

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              disabled={loading}
              onClick={() => decide("deny")}
            >
              Negar
            </Button>
            <Button
              className="flex-1"
              disabled={loading}
              onClick={() => decide("approve")}
            >
              {loading ? "Processando..." : "Autorizar"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
