// resolveCampaignAccount — descobre a conta de anúncios REAL (e a operação dona)
// a partir do campaign_id, sem confiar cegamente no account_id enviado pelo frontend.
//
// Motivo: algumas telas (pacing/meta-ads) enviavam o próprio campaign_id no campo
// account_id. Isso quebrava a resolução de tenant (getOperationFromContext caía no
// fallback GTX) e o Meta respondia "Object does not exist or missing permissions"
// porque o pool de tokens era da operação errada.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export interface CampaignAccountContext {
  accountId: string;
  operationId: string | null;
  source: "db_campaign" | "input" | "unknown";
  inputWasCampaignId: boolean;
}

function svc() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

const norm = (v: string) => String(v || "").trim().replace(/^act_/, "");

export async function resolveCampaignAccount(
  campaignId: string,
  accountIdInput?: string | null,
): Promise<CampaignAccountContext> {
  const supabase = svc();
  const input = String(accountIdInput || "").trim();
  const inputWasCampaignId = !input || norm(input) === norm(campaignId);

  let dbAccountId: string | null = null;
  let operationId: string | null = null;

  try {
    const { data } = await supabase
      .from("meta_campaign_status")
      .select("account_id, operation_id")
      .eq("campaign_id", campaignId)
      .maybeSingle();
    if ((data as any)?.account_id) dbAccountId = String((data as any).account_id);
    if ((data as any)?.operation_id) operationId = String((data as any).operation_id);
  } catch (_) { /* ignore */ }

  const accountId = dbAccountId ?? (inputWasCampaignId ? "" : input);

  if (!operationId && accountId) {
    try {
      const bare = norm(accountId);
      const { data } = await supabase
        .from("meta_ad_accounts")
        .select("operation_id")
        .in("account_id", [bare, `act_${bare}`])
        .maybeSingle();
      if ((data as any)?.operation_id) operationId = String((data as any).operation_id);
    } catch (_) { /* ignore */ }
  }

  return {
    accountId,
    operationId,
    source: dbAccountId ? "db_campaign" : accountId ? "input" : "unknown",
    inputWasCampaignId,
  };
}
