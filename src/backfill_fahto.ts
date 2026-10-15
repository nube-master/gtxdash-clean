import { extractProjectCode, registerOfferProjects } from "./lib/projectUtils.ts";
import { supabase } from "./integrations/supabase/client.ts";

async function backfill() {
  const opId = "8707b3f8-ab41-4a63-902c-9ab97fe50c8a";
  
  const { data: offers } = await supabase
    .from("offers")
    .select("apelido_interno, produto_real, redtrack_offer_names")
    .eq("operation_id", opId);
  
  if (offers) {
    registerOfferProjects(offers as any);
  }

  console.log("Iniciando backfill project_slug para FAHTO...");

  const { data: sales } = await supabase
    .from("sales_data")
    .select("id, order_id, utm_campaign, store, product_name")
    .eq("operation_id", opId);

  if (sales) {
    console.log(`Processando ${sales.length} vendas em sales_data...`);
    for (const s of sales) {
      const projectSlug = extractProjectCode(s.utm_campaign, s.store, null, s.product_name);
      if (projectSlug && projectSlug !== "OUTROS") {
        await supabase.from("sales_data").update({ project_slug: projectSlug }).eq("id", s.id);
      }
    }
  }

  const { data: convs } = await (supabase
    .from("redtrack_conversions" as any) as any)
    .select("id, offer, rt_campaign, product")
    .eq("operation_id", opId);

  if (convs && Array.isArray(convs)) {
    console.log(`Processando ${convs.length} conversões em redtrack_conversions...`);
    for (const c of convs) {
      const projectSlug = extractProjectCode(c.rt_campaign, "redtrack", c.offer, c.product);
      if (projectSlug && projectSlug !== "OUTROS") {
        await (supabase.from("redtrack_conversions" as any) as any).update({ project_slug: projectSlug }).eq("id", c.id);
      }
    }
  }

  console.log("Backfill concluído!");
}

backfill().catch(console.error);
