async function test() {
  const EDD_OP = "1dd606e3-dac2-4064-b863-9784307c9e98";
  
  // We need tokens. We can't use the shared helper easily because it needs ENV.
  // Let's try to fetch accounts first via pure fetch to the Edge Function 
  // with a manual trigger and look at the logs again.
  
  const url = "https://taeduxiandktefcwgspx.functions.supabase.co/sync-meta-balance";
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + Deno.env.get("VITE_SUPABASE_ANON_KEY"),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ operation_id: EDD_OP })
  });
  
  const result = await resp.json();
  console.log("Sync Response:", JSON.stringify(result, null, 2));
}

test();
