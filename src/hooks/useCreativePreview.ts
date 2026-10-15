import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface PreviewData {
  thumbnail_url: string | null;
  video_url: string | null;
  preview_link: string | null;
}

// Global cache shared across all cards and the detail modal
const previewCache = new Map<string, PreviewData>();
const pendingFetches = new Map<string, Promise<PreviewData>>();

export function getPreviewCache() {
  return previewCache;
}

export function useCreativePreview(
  adName: string | undefined,
  accountId: string | undefined,
  enabled: boolean
) {
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !adName || !accountId) return;

    const cacheKey = `${adName}|${accountId}`;
    if (fetchedRef.current === cacheKey) return;
    fetchedRef.current = cacheKey;

    // Check cache
    if (previewCache.has(cacheKey)) {
      setPreview(previewCache.get(cacheKey)!);
      return;
    }

    // Deduplicate in-flight requests
    if (pendingFetches.has(cacheKey)) {
      pendingFetches.get(cacheKey)!.then((result) => {
        setPreview(result);
      });
      return;
    }

    setLoading(true);

    const fetchPromise = supabase.functions
      .invoke("get-creative-preview", {
        body: { ad_name: adName, account_id: accountId },
      })
      .then(({ data, error }) => {
        const result: PreviewData = error
          ? { thumbnail_url: null, video_url: null, preview_link: null }
          : (data as PreviewData);
        previewCache.set(cacheKey, result);
        return result;
      })
      .catch(() => {
        const empty: PreviewData = { thumbnail_url: null, video_url: null, preview_link: null };
        return empty;
      })
      .finally(() => {
        pendingFetches.delete(cacheKey);
        setLoading(false);
      });

    pendingFetches.set(cacheKey, fetchPromise);
    fetchPromise.then((result) => setPreview(result));
  }, [enabled, adName, accountId]);

  return { preview, loading };
}
