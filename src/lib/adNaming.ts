/**
 * Ad naming resolution utilities.
 * Centralizes hierarchical identification from multiple sources.
 */

import { extractCreativeIdFromText, isValidCreativePattern } from "./creativeUtils";

export function resolveCreativeAdNameHierarchy(
  metaAdName: string | null | undefined,
  rtAd: string | null | undefined,
  rtSub4: string | null | undefined,
  utmContent: string | null | undefined,
  campaignBracketFallback?: string | null | undefined
): string {
  const isSujo = (val: any) => 
    !val || 
    typeof val !== 'string' || 
    /^v3_|^[a-f0-9]{8}-|^[a-z0-9]{20}/i.test(val) || 
    /[,&]/.test(val) ||
    val === "[OVERVIEW]";

  // 1. Meta Real Name (Authoritative)
  if (!isSujo(metaAdName) && isValidCreativePattern(metaAdName)) {
    const id = extractCreativeIdFromText(metaAdName);
    if (id) return id;
  }

  // 2. RedTrack rt_ad (clickSub4 / rt_ad)
  if (!isSujo(rtAd) && isValidCreativePattern(rtAd)) {
    const id = extractCreativeIdFromText(rtAd);
    if (id) return id;
  }

  // 3. RedTrack sub4
  if (!isSujo(rtSub4) && isValidCreativePattern(rtSub4)) {
    const id = extractCreativeIdFromText(rtSub4);
    if (id) return id;
  }

  // 4. utm_content
  if (!isSujo(utmContent) && isValidCreativePattern(utmContent)) {
    const id = extractCreativeIdFromText(utmContent);
    if (id) return id;
  }

  // 5. Campaign Bracket Fallback
  if (campaignBracketFallback && isValidCreativePattern(campaignBracketFallback)) {
     const id = extractCreativeIdFromText(campaignBracketFallback);
     if (id) return id;
  }

  return "SEM_ID";
}
