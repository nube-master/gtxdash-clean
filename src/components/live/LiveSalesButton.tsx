import { Bell } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface LiveSalesButtonProps {
  count: number;
  hasNew: boolean;
  minutesSinceLastSale: number;
  onClick: () => void;
}

export function LiveSalesButton({ count, hasNew, minutesSinceLastSale, onClick }: LiveSalesButtonProps) {
  const isDrought = minutesSinceLastSale > 30;
  const showGlow = hasNew || isDrought;

  return (
    <button
      onClick={onClick}
      className="h-8 px-3 rounded-md text-xs border flex items-center gap-2 transition-all relative"
      style={{
        background: showGlow ? "rgba(255,30,30,0.08)" : "rgba(255,30,30,0.04)",
        borderColor: showGlow ? "rgba(255,30,30,0.3)" : "rgba(255,30,30,0.1)",
        boxShadow: isDrought
          ? "0 0 20px rgba(255,30,30,0.2)"
          : hasNew
            ? "0 0 12px rgba(255,30,30,0.15)"
            : "none",
        animation: isDrought ? "pulse 2s ease-in-out infinite" : "none",
      }}
    >
      <Bell className="h-3.5 w-3.5 text-primary" />
      <span className="text-foreground font-medium">Vendas Live</span>
      <AnimatePresence mode="wait">
        {count > 0 && (
          <motion.span
            key={count}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold"
            style={{
              background: "hsl(var(--primary))",
              color: "hsl(var(--primary-foreground))",
            }}
          >
            {count}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
