import { AlertCircle } from "lucide-react";
import { useSyncHealth } from "@/hooks/useSyncHealth";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function SyncHealthBanner() {
  const { data: health } = useSyncHealth();

  if (health?.status !== "critical") return null;

  return (
    <div className="px-6 py-2 bg-red-500/10 border-b border-red-500/20">
      <div className="flex items-center gap-2 text-red-500 text-xs font-medium">
        <AlertCircle className="w-3.5 h-3.5" />
        <span>Sync Meta pausado — verificar token ou permissões.</span>
      </div>
    </div>
  );
}
