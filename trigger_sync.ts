async function run() {
  const url = "https://taeduxiandktefcwgspx.functions.supabase.co/sync-meta-balance";
  const auth = "Bearer " + Deno.env.get("VITE_SUPABASE_ANON_KEY");
  
  console.log("Triggering Escola do Dólar (1dd606e3-dac2-4064-b863-9784307c9e98)...");
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Authorization": auth, "Content-Type": "application/json" },
    body: JSON.stringify({ operation_id: "1dd606e3-dac2-4064-b863-9784307c9e98" })
  });
  
  const text = await resp.text();
  console.log("Status:", resp.status);
  console.log("Body:", text);
}
run();
