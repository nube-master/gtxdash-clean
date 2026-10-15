import { MetaAccountSelector } from "./MetaAccountSelector";
import { UtmAccountMapper } from "./UtmAccountMapper";
import { MetaTokenPermissionsPanel } from "./MetaTokenPermissionsPanel";
import { MetaTokenManagerPanel } from "./MetaTokenManagerPanel";
import { Separator } from "@/components/ui/separator";

export function IntegrationMetaPanel() {
  return (
    <div className="space-y-8">
      <MetaTokenManagerPanel />
      
      <Separator className="bg-border/50" />
      
      <div className="space-y-6">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          Sincronização de Dados
        </h3>
        <MetaAccountSelector />
        <MetaTokenPermissionsPanel />
        <UtmAccountMapper />
      </div>

      <div className="bg-muted/30 rounded-lg p-4 space-y-3 border border-border/50">
        <h4 className="text-sm font-semibold text-foreground">Como obter o Access Token:</h4>
        <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside">
          <li>Acesse <strong>developers.facebook.com</strong> → seu app → <strong>Ferramentas</strong> → <strong>Graph API Explorer</strong></li>
          <li>Selecione seu app e gere um <strong>User Access Token</strong></li>
          <li>Marque as permissões: <strong>ads_read</strong>, <strong>ads_management</strong>, <strong>read_insights</strong></li>
          <li>Clique em <strong>"Generate Access Token"</strong></li>
          <li>Para um token de longa duração, vá em <strong>Access Token Debugger</strong> → <strong>"Extend Access Token"</strong></li>
        </ol>
      </div>
    </div>
  );
}


