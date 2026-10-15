import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperationId } from "@/contexts/OperationContext";

export interface CreativeTeamOverride {
  id: string;
  operation_id: string | null;
  creative_id: string;
  campaign_name_pattern: string | null;
  override_copy_writer: string | null;
  override_editor: string | null;
  reason: string;
  created_at: string;
  updated_at: string;
}

export interface OverrideInput {
  id?: string;
  creative_id: string;
  campaign_name_pattern?: string | null;
  override_copy_writer?: string | null;
  override_editor?: string | null;
  reason?: string;
}

/**
 * Fetches the list of copy/editor overrides for the current operation.
 */
export function useCreativeTeamOverrides() {
  const opId = useOperationId();
  return useQuery({
    queryKey: ["creative-team-overrides", opId],
    queryFn: async (): Promise<CreativeTeamOverride[]> => {
      let q = supabase.from("creative_team_overrides").select("*");
      if (opId) q = q.eq("operation_id", opId);
      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as CreativeTeamOverride[];
    },
    staleTime: 60_000,
  });
}

/**
 * Build a fast lookup index from the override list, keyed by normalized creative_id.
 * Each entry holds a sorted list of overrides (more specific patterns first).
 */
export function useCreativeTeamOverrideIndex() {
  const { data: overrides = [] } = useCreativeTeamOverrides();
  return useMemo(() => {
    const index = new Map<string, CreativeTeamOverride[]>();
    for (const ov of overrides) {
      const key = (ov.creative_id || "").toUpperCase().trim();
      if (!key) continue;
      const list = index.get(key) ?? [];
      list.push(ov);
      index.set(key, list);
    }
    // Specific patterns evaluated before global (null) ones
    for (const list of index.values()) {
      list.sort((a, b) => {
        const ap = (a.campaign_name_pattern || "").length;
        const bp = (b.campaign_name_pattern || "").length;
        return bp - ap;
      });
    }
    return index;
  }, [overrides]);
}

/**
 * Apply override on top of detected (copyWriter, editor).
 * - Looks up by creative_id (case-insensitive, exact match on the qualified ID,
 *   then on the base ID without person suffix).
 * - Honors campaign_name_pattern when present (case-insensitive substring match
 *   against any of the campaign names attached to the creative).
 * - NULL fields in the override do not overwrite the detected value.
 */
export function applyTeamOverride(
  detected: { copyWriter: string | null; editor: string | null },
  creativeId: string,
  campaignNames: Iterable<string>,
  index: Map<string, CreativeTeamOverride[]>,
): { copyWriter: string | null; editor: string | null; overrideApplied: boolean } {
  if (!index.size) return { ...detected, overrideApplied: false };
  const cid = (creativeId || "").toUpperCase().trim();
  const baseId = cid.replace(/-[A-Z0-9]+$/, "");

  const candidates = [...(index.get(cid) || []), ...(baseId !== cid ? index.get(baseId) || [] : [])];
  if (!candidates.length) return { ...detected, overrideApplied: false };

  const names = Array.from(campaignNames).map((n) => (n || "").toLowerCase());

  for (const ov of candidates) {
    const pattern = (ov.campaign_name_pattern || "").toLowerCase().trim();
    if (pattern) {
      const matches = names.some((n) => n.includes(pattern));
      if (!matches) continue;
    }
    return {
      copyWriter: ov.override_copy_writer ?? detected.copyWriter,
      editor: ov.override_editor ?? detected.editor,
      overrideApplied: true,
    };
  }

  return { ...detected, overrideApplied: false };
}

// ─── Mutations ──────────────────────────────────────────────────────────

/**
 * Invalidate every query that depends — directly or indirectly — on the
 * copy/editor attribution. Ensures ranking, charts and per-person metrics
 * recompute automatically the moment an override is saved or removed.
 */
function invalidateCreativeAttributionQueries(qc: ReturnType<typeof useQueryClient>) {
  // The override index itself
  qc.invalidateQueries({ queryKey: ["creative-team-overrides"] });
  // Primary feeds consumed by useCreativeData / leaderboards / charts
  qc.invalidateQueries({ queryKey: ["traffic-data"] });
  qc.invalidateQueries({ queryKey: ["real-sales"] });
  qc.invalidateQueries({ queryKey: ["creative-traffic"] });
  qc.invalidateQueries({ queryKey: ["traffic-3d"] });
  qc.invalidateQueries({ queryKey: ["sales-3d"] });
  // Aggregated views (weekly report, monthly leaderboard, lifecycle, cohort)
  qc.invalidateQueries({ queryKey: ["creative-weekly-report"] });
  qc.invalidateQueries({ queryKey: ["leaderboard-monthly"] });
  qc.invalidateQueries({ queryKey: ["creative-lifecycle-cb-daily"] });
  qc.invalidateQueries({ queryKey: ["creative-cohort"] });
}

export function useUpsertCreativeTeamOverride() {
  const qc = useQueryClient();
  const opId = useOperationId();
  return useMutation({
    mutationFn: async (input: OverrideInput) => {
      const payload = {
        operation_id: opId ?? null,
        creative_id: input.creative_id.toUpperCase().trim(),
        campaign_name_pattern: input.campaign_name_pattern?.trim() || null,
        override_copy_writer: input.override_copy_writer?.trim() || null,
        override_editor: input.override_editor?.trim() || null,
        reason: input.reason?.trim() || "",
      };
      if (input.id) {
        const { error } = await supabase.from("creative_team_overrides").update(payload).eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("creative_team_overrides").upsert(payload, {
          onConflict: "operation_id,creative_id,campaign_name_pattern",
        });
        if (error) throw error;
      }
    },
    onSuccess: () => invalidateCreativeAttributionQueries(qc),
  });
}

export function useDeleteCreativeTeamOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("creative_team_overrides").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateCreativeAttributionQueries(qc),
  });
}
