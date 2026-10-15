import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const META_API = "https://graph.facebook.com/v21.0";

async function fetchVideoSource(videoId: string, token: string): Promise<{ source: string | null; thumb: string | null }> {
  try {
    const res = await fetch(`${META_API}/${videoId}?fields=source,thumbnails&access_token=${token}`);
    const json = await res.json();
    if (res.ok) {
      return {
        source: json.source || null,
        thumb: json.thumbnails?.data?.[0]?.uri || null,
      };
    }
  } catch (e) {
    console.warn("fetchVideoSource failed for", videoId, e);
  }
  return { source: null, thumb: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { ad_name, account_id } = await req.json();
    if (!ad_name || !account_id) {
      return new Response(JSON.stringify({ error: "ad_name and account_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const META_TOKEN = Deno.env.get("META_ADS_ACCESS_TOKEN");
    if (!META_TOKEN) {
      return new Response(JSON.stringify({ error: "META_ADS_ACCESS_TOKEN not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const emptyResult = { thumbnail_url: null, video_url: null, preview_link: null };
    const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

    // Step 1: Find the ad → get creative fields
    const filterParam = JSON.stringify([
      { field: "name", operator: "CONTAIN", value: ad_name },
    ]);
    const adFields = [
      "name",
      "creative{id,thumbnail_url,image_url,video_id,object_story_spec,asset_feed_spec}",
      "preview_shareable_link",
      "full_picture",
    ].join(",");
    const adUrl = `${META_API}/act_${account_id}/ads?filtering=${encodeURIComponent(filterParam)}&fields=${adFields}&limit=3&access_token=${META_TOKEN}`;

    const adRes = await fetch(adUrl);
    const adJson = await adRes.json();

    if (!adRes.ok) {
      console.error("Meta API error (ads):", JSON.stringify(adJson));
      return new Response(JSON.stringify({ error: "Meta API error", details: adJson?.error?.message }), {
        status: 502, headers: jsonHeaders,
      });
    }

    const ads = adJson.data || [];
    if (ads.length === 0) {
      console.log("No ads found for ad_name:", ad_name, "account:", account_id);
      return new Response(JSON.stringify(emptyResult), { status: 200, headers: jsonHeaders });
    }

    const ad = ads[0];
    const adId = ad.id;
    const creative = ad.creative || {};
    const previewLink = ad.preview_shareable_link || null;
    // Prefer full_picture (full-res) over thumbnail_url (blurry low-res)
    let thumbnailUrl = ad.full_picture || creative.image_url || creative.thumbnail_url || null;
    let videoUrl: string | null = null;

    console.log("Ad found:", adId, "creative_id:", creative.id, "has_video_id:", !!creative.video_id,
      "has_object_story_spec:", !!creative.object_story_spec,
      "has_asset_feed_spec:", !!creative.asset_feed_spec);

    // Priority 1: Direct video_id on creative
    if (creative.video_id) {
      const { source, thumb } = await fetchVideoSource(creative.video_id, META_TOKEN);
      if (source) videoUrl = source;
      if (!thumbnailUrl && thumb) thumbnailUrl = thumb;
    }

    // Priority 2: object_story_spec.video_data.video_id
    if (!videoUrl && creative.object_story_spec?.video_data?.video_id) {
      const vid = creative.object_story_spec.video_data.video_id;
      console.log("Trying object_story_spec.video_data.video_id:", vid);
      const { source, thumb } = await fetchVideoSource(vid, META_TOKEN);
      if (source) videoUrl = source;
      if (!thumbnailUrl) {
        thumbnailUrl = creative.object_story_spec.video_data.image_url || thumb || null;
      }
    }

    // Priority 3: asset_feed_spec.videos (catalog/dynamic ads)
    if (!videoUrl && creative.asset_feed_spec?.videos?.length > 0) {
      const vid = creative.asset_feed_spec.videos[0].video_id;
      if (vid) {
        console.log("Trying asset_feed_spec.videos[0].video_id:", vid);
        const { source } = await fetchVideoSource(vid, META_TOKEN);
        if (source) videoUrl = source;
      }
    }

    // Priority 4: asset_feed_spec.images (catalog image fallback)
    if (!thumbnailUrl && creative.asset_feed_spec?.images?.length > 0) {
      thumbnailUrl = creative.asset_feed_spec.images[0].url || creative.asset_feed_spec.images[0].hash || null;
    }

    // Priority 5: If still no video, try the Ad Previews API (works for catalog/dynamic ads)
    if (!videoUrl && adId) {
      console.log("Trying Ad Previews API for ad:", adId);
      try {
        // Try INSTAGRAM_REELS format first (shows actual video for catalog ads)
        const previewRes = await fetch(
          `${META_API}/${adId}/previews?ad_format=INSTAGRAM_REELS&access_token=${META_TOKEN}`
        );
        const previewJson = await previewRes.json();
        if (previewRes.ok && previewJson.data?.[0]?.body) {
          // Extract video src from the iframe HTML
          const iframeHtml = previewJson.data[0].body as string;
          const videoMatch = iframeHtml.match(/src=["']([^"']*?\.mp4[^"']*?)["']/i)
            || iframeHtml.match(/video_url=([^&"']+)/i);
          if (videoMatch?.[1]) {
            const decoded = videoMatch[1].replace(/&amp;/g, "&");
            try {
              videoUrl = decodeURIComponent(decoded);
            } catch {
              videoUrl = decoded;
            }
            console.log("Extracted video URL from preview iframe");
          }

          // If no direct video URL, try to extract thumbnail/image
          if (!thumbnailUrl) {
            const imgMatch = iframeHtml.match(/background-image:\s*url\(["']?([^"')]+?)["']?\)/i)
              || iframeHtml.match(/<img[^>]*src=["']([^"']+?)["']/i);
            if (imgMatch?.[1]) {
              thumbnailUrl = imgMatch[1].replace(/&amp;/g, "&");
            }
          }
        }
      } catch (e) {
        console.warn("Ad Previews API fallback failed:", e);
      }
    }

    // Priority 6: Fetch creative directly by ID for any remaining fields
    if (!videoUrl && creative.id) {
      console.log("Fetching creative directly:", creative.id);
      try {
        const crRes = await fetch(
          `${META_API}/${creative.id}?fields=video_id,object_story_spec,asset_feed_spec,thumbnail_url,image_url,effective_object_story_id&access_token=${META_TOKEN}`
        );
        const crJson = await crRes.json();
        if (crRes.ok) {
          // Try video_id
          if (crJson.video_id) {
            const { source, thumb } = await fetchVideoSource(crJson.video_id, META_TOKEN);
            if (source) videoUrl = source;
            if (!thumbnailUrl && thumb) thumbnailUrl = thumb;
          }
          // Try object_story_spec
          if (!videoUrl && crJson.object_story_spec?.video_data?.video_id) {
            const { source } = await fetchVideoSource(crJson.object_story_spec.video_data.video_id, META_TOKEN);
            if (source) videoUrl = source;
            if (!thumbnailUrl && crJson.object_story_spec.video_data.image_url) {
              thumbnailUrl = crJson.object_story_spec.video_data.image_url;
            }
          }
          // Try asset_feed_spec
          if (!videoUrl && crJson.asset_feed_spec?.videos?.length > 0 && crJson.asset_feed_spec.videos[0].video_id) {
            const { source } = await fetchVideoSource(crJson.asset_feed_spec.videos[0].video_id, META_TOKEN);
            if (source) videoUrl = source;
          }
          // Thumbnail fallback
          if (!thumbnailUrl) {
            thumbnailUrl = crJson.thumbnail_url || crJson.image_url || null;
          }
        }
      } catch (e) {
        console.warn("Direct creative fetch failed:", e);
      }
    }

    console.log("Result — video_url:", !!videoUrl, "thumbnail_url:", !!thumbnailUrl);

    return new Response(
      JSON.stringify({ thumbnail_url: thumbnailUrl, video_url: videoUrl, preview_link: previewLink }),
      { status: 200, headers: jsonHeaders }
    );
  } catch (err) {
    console.error("get-creative-preview error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
