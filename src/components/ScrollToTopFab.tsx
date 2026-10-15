import { ArrowUp } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

export function ScrollToTopFab() {
  const [visible, setVisible] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    const container = document.getElementById("dashboard-content");
    if (!container) return;

    const handler = () => {
      setVisible(container.scrollTop > 400);
    };

    container.addEventListener("scroll", handler, { passive: true });
    return () => container.removeEventListener("scroll", handler);
  }, []);

  const scrollToTop = useCallback(() => {
    const container = document.getElementById("dashboard-content");
    container?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={scrollToTop}
      className={`fixed z-40 flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 active:scale-95 ${
        isMobile ? "bottom-20 right-4 h-10 w-10" : "bottom-6 right-6 h-9 w-9"
      }`}
      style={{ boxShadow: "0 4px 14px hsl(var(--primary) / 0.35)" }}
      title="Voltar ao topo"
      aria-label="Voltar ao topo"
    >
      <ArrowUp className="h-4 w-4" />
    </button>
  );
}
