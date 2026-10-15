import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Offer } from "@/types/offers";

// Sessão: evita chamar capture-offer-preview várias vezes pra mesma oferta
const inflight = new Set<string>();

function normalizeUrl(raw?: string | null): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s || !s.includes(".")) return null;
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s.replace(/^\/+/, "")}`;
}

function resolveLiveUrl(o: Offer): string | null {
  return (
    normalizeUrl(o.sales_page_url) ||
    normalizeUrl(o.landing_pages?.[0]) ||
    normalizeUrl(o.vsl_url) ||
    normalizeUrl(o.link_checkout)
  );
}

function microlinkFor(url: string): string {
  return (
    `https://api.microlink.io/?url=${encodeURIComponent(url)}` +
    `&screenshot=true&meta=false&embed=screenshot.url` +
    `&viewport.width=1024&viewport.height=1280&waitUntil=networkidle0`
  );
}

export function OfferPreviewImage({ offer: o }: { offer: Offer }) {
  const liveUrl = resolveLiveUrl(o);
  const [src, setSrc] = useState<string | null>(
    o.preview_image_url || (liveUrl ? microlinkFor(liveUrl) : null),
  );
  const triggered = useRef(false);

  useEffect(() => {
    if (!liveUrl) return;
    if (o.preview_image_url) return; // já cacheado
    if (triggered.current) return;
    if (inflight.has(o.id)) return;
    triggered.current = true;
    inflight.add(o.id);

    // dispara captura em background; quando volta, troca pro asset do nosso bucket
    supabase.functions
      .invoke("capture-offer-preview", { body: { offer_id: o.id } })
      .then((r) => {
        const url = (r.data as any)?.url;
        if (url) setSrc(url);
      })
      .catch(() => {})
      .finally(() => inflight.delete(o.id));
  }, [o.id, o.preview_image_url, liveUrl]);

  if (!liveUrl) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground/40 font-mono uppercase tracking-widest">
        sem LP
      </div>
    );
  }

  return (
    <img
      src={src ?? microlinkFor(liveUrl)}
      alt={`${o.apelido_interno} preview`}
      className="absolute inset-0 w-full h-full object-cover object-top"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = "none";
      }}
    />
  );
}
