import { Loader2, ArrowDown, Check } from "lucide-react";
import { useState, useEffect } from "react";

interface Props {
  pullDistance: number;
  isRefreshing: boolean;
  threshold?: number;
}

export function PullToRefreshIndicator({ pullDistance, isRefreshing, threshold = 80 }: Props) {
  const [showSuccess, setShowSuccess] = useState(false);
  const [wasRefreshing, setWasRefreshing] = useState(false);

  useEffect(() => {
    if (isRefreshing && !wasRefreshing) {
      setWasRefreshing(true);
    }
    if (!isRefreshing && wasRefreshing) {
      setWasRefreshing(false);
      setShowSuccess(true);
      const t = setTimeout(() => setShowSuccess(false), 1200);
      return () => clearTimeout(t);
    }
  }, [isRefreshing, wasRefreshing]);

  if (pullDistance <= 0 && !isRefreshing && !showSuccess) return null;

  const progress = Math.min(pullDistance / threshold, 1);
  const ready = progress >= 1;

  return (
    <div
      className="flex items-center justify-center gap-2 overflow-hidden transition-[height] duration-200 ease-out"
      style={{ height: showSuccess ? 40 : isRefreshing ? 48 : pullDistance > 0 ? Math.min(pullDistance, 64) : 0 }}
    >
      {showSuccess ? (
        <div className="flex items-center gap-1.5 animate-fade-in">
          <Check className="h-4 w-4 text-emerald-500" />
          <span className="text-[10px] font-medium text-emerald-500">Atualizado</span>
        </div>
      ) : isRefreshing ? (
        <div className="flex items-center gap-1.5">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-[10px] text-muted-foreground">Atualizando...</span>
        </div>
      ) : (
        <div
          className="transition-transform duration-150"
          style={{
            transform: `rotate(${ready ? 180 : progress * 180}deg)`,
            opacity: Math.min(progress * 1.5, 1),
          }}
        >
          <ArrowDown className={`h-5 w-5 ${ready ? "text-primary" : "text-muted-foreground"}`} />
        </div>
      )}
    </div>
  );
}
