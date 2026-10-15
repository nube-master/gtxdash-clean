import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, CheckCircle2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

/**
 * Secure form to rotate META_ADS_ACCESS_TOKEN.
 * - Token is sent over HTTPS directly to the `update-meta-token` edge function.
 * - Edge function validates against Meta /me before persisting to app_settings.
 * - The value is never logged, never echoed back, and the input is masked.
 */
export function MetaTokenRotateCard() {
  const qc = useQueryClient();
  const [token, setToken] = useState("");
  const [show, setShow] = useState(false);

  const { data: status } = useQuery({
    queryKey: ["meta-token-status"],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value, updated_at")
        .eq("key", "meta_ads_access_token")
        .maybeSingle();
      const v = data?.value as any;
      return {
        rotated_at: v?.rotated_at ?? data?.updated_at ?? null,
        hasToken: !!v?.token,
      };
    },
    staleTime: 30_000,
  });

  const mutate = useMutation({
    mutationFn: async (rawToken: string) => {
      const clean = rawToken.trim();
      if (clean.length < 40) throw new Error("Token muito curto.");
      const { data, error } = await supabase.functions.invoke("update-meta-token", {
        body: { token: clean },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).details || (data as any).error);
      return data as { ok: boolean; meta_account: { id: string; name: string } };
    },
    onSuccess: (data) => {
      setToken("");
      setShow(false);
      toast.success(`Token atualizado · ${data.meta_account?.name ?? "Meta OK"}`);
      qc.invalidateQueries({ queryKey: ["meta-token-status"] });
      qc.invalidateQueries({ queryKey: ["meta-token-health"] });
    },
    onError: (err: any) => {
      const msg = err?.message || "Falha ao atualizar token.";
      // Strip any potential token echo defensively.
      toast.error(msg.includes("EAA") ? "Falha ao validar token no Meta." : msg);
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4" />
          Meta Access Token
        </CardTitle>
        <CardDescription>
          Cole um novo token gerado em Business Settings → System User. Ele é validado contra a API do Meta antes de ser salvo. Nunca cole no chat.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 text-xs">
          {status?.hasToken ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-muted-foreground">
                Token em uso · última rotação{" "}
                <span className="font-mono text-foreground">
                  {status.rotated_at
                    ? new Date(status.rotated_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
                    : "—"}
                </span>
              </span>
            </>
          ) : (
            <>
              <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-muted-foreground">Nenhum token rotacionado via formulário (usando variável de ambiente).</span>
            </>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutate.mutate(token);
          }}
          className="space-y-2"
          autoComplete="off"
        >
          <Label htmlFor="meta-token" className="text-xs">Novo token</Label>
          <div className="relative">
            <Input
              id="meta-token"
              type={show ? "text" : "password"}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="EAA..."
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              className="font-mono pr-10"
              disabled={mutate.isPending}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={show ? "Ocultar token" : "Mostrar token"}
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-[11px] text-muted-foreground">
              Permissões necessárias: <span className="font-mono">ads_read, ads_management, business_management, read_insights</span>
            </p>
            <Button type="submit" size="sm" disabled={mutate.isPending || token.trim().length < 40}>
              {mutate.isPending ? "Validando..." : "Atualizar token"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
