import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const TABLE = "pacing_settings";

export type PacingSettingsMap = Record<string, any>;

export function usePacingSettings() {
  const [settings, setSettings] = useState<PacingSettingsMap>({});
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const { data, error } = await (supabase as any).from(TABLE).select("key,value");
    if (error) {
      toast.error("Erro ao carregar configurações");
      setLoading(false);
      return;
    }
    const map: PacingSettingsMap = {};
    for (const r of data as { key: string; value: any }[]) map[r.key] = r.value;
    setSettings(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const setKey = useCallback(
    async (key: string, value: any, opts: { silent?: boolean } = {}) => {
      setSettings((s) => ({ ...s, [key]: value }));
      const { error } = await (supabase as any)
        .from(TABLE)
        .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (error) {
        toast.error("Erro ao salvar", { description: error.message });
        fetchAll();
        return false;
      }
      if (!opts.silent) toast.success("Salvo automaticamente", { duration: 1500 });
      return true;
    },
    [fetchAll]
  );

  const setMany = useCallback(
    async (patch: PacingSettingsMap) => {
      setSettings((s) => ({ ...s, ...patch }));
      const rows = Object.entries(patch).map(([key, value]) => ({
        key,
        value,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await (supabase as any)
        .from(TABLE)
        .upsert(rows, { onConflict: "key" });
      if (error) {
        toast.error("Erro ao salvar configurações");
        fetchAll();
        return false;
      }
      toast.success("Configurações salvas");
      return true;
    },
    [fetchAll]
  );

  return { settings, loading, setKey, setMany, refetch: fetchAll };
}
