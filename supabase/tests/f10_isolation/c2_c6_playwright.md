# F10 C2 e C6 — Cenários UI (Playwright)

Ambos rodam com script em `/tmp/browser/f10/`. Snippets essenciais:

## C2 — SA sem op ativa

```python
await page.evaluate("localStorage.removeItem('tos_last_operation_id')")
await page.goto("http://localhost:8080/", wait_until="domcontentloaded")
assert "/select-operation" in page.url, f"esperado /select-operation, foi {page.url}"

# PostgREST direto sem session-var: retorna []
resp = await context.request.get(
    f"{SUPABASE_URL}/rest/v1/offers?select=id&limit=1",
    headers={"apikey": ANON_KEY, "Authorization": f"Bearer {sa_token}"}
)
assert resp.status == 200
assert await resp.json() == []
```

## C6 — Anon

```python
# limpa qualquer sessão
await context.clear_cookies()
await page.evaluate("localStorage.clear()")

await page.goto("http://localhost:8080/", wait_until="domcontentloaded")
assert "/login" in page.url

# talent_jobs ativa é pública
resp = await context.request.get(
    f"{SUPABASE_URL}/rest/v1/talent_jobs?is_active=eq.true&select=id",
    headers={"apikey": ANON_KEY}
)
assert resp.status == 200
assert len(await resp.json()) > 0, "talent_jobs pública deveria retornar rows"

# offers é privado — retorna []
resp = await context.request.get(
    f"{SUPABASE_URL}/rest/v1/offers?select=id&limit=1",
    headers={"apikey": ANON_KEY}
)
assert await resp.json() == []
```
