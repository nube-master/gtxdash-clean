// Shared helper: operações com RedTrack em STANDBY (cadastrado, mas sem sync/ingestão).
// Controlado pela feature flag `redtrack_standby` (feature_flags.operation_ids).
// Semântica: enabled=true + operation_ids=[...] → standby SOMENTE para essas operações.

export async function getRedTrackStandbyOps(supabase: any): Promise<Set<string>> {
  try {
    const { data } = await supabase
      .from("feature_flags")
      .select("enabled, operation_ids")
      .eq("key", "redtrack_standby")
      .maybeSingle();

    if (!data?.enabled) return new Set<string>();
    return new Set<string>((data.operation_ids ?? []).map((id: string) => String(id)));
  } catch (e) {
    console.warn("[redtrack-standby] could not load flag:", (e as Error).message);
    return new Set<string>();
  }
}
