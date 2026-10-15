import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export function ImpersonationBanner() {
  const [impersonation, setImpersonation] = useState<{ id: string; name: string } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const raw = localStorage.getItem("sa_impersonate");
    if (raw) {
      try { setImpersonation(JSON.parse(raw)); } catch { /* ignore */ }
    }
  }, []);

  if (!impersonation) return null;

  const handleExit = () => {
    localStorage.removeItem("sa_impersonate");
    navigate("/super-admin");
    window.location.reload();
  };

  return (
    <div className="sticky top-0 z-[60] flex items-center justify-center gap-3 px-4 py-1.5 text-xs font-medium"
      style={{ background: "hsl(45 93% 47%)", color: "hsl(0 0% 10%)" }}
    >
      <span>Você está visualizando a operação: <strong>{impersonation.name}</strong></span>
      <Button
        variant="outline"
        size="sm"
        className="h-6 text-[10px] px-2 bg-white/80 hover:bg-white border-black/20"
        onClick={handleExit}
      >
        <X className="h-3 w-3 mr-1" /> Voltar ao Super Admin
      </Button>
    </div>
  );
}
