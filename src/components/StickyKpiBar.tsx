import { useState, useEffect, useRef } from "react";
import { useDashboardTotals } from "@/hooks/useDashboardTotals";
import { useDateRange } from "@/contexts/DateRangeContext";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, TrendingDown } from "lucide-react";

function fmtCompact(v: number) {
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `R$ ${(v / 1_000).toFixed(1)}k`;
  return `R$ ${v.toFixed(0)}`;
}

export function StickyKpiBar() {
  const [visible, setVisible] = useState(false);
  const { data: sky } = useDashboardTotals();
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = document.getElementById("sticky-kpi-sentinel");
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(!entry.isIntersecting);
      },
      { threshold: 0, rootMargin: "-60px 0px 0px 0px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  if (!sky) return null;

  const revenue = sky.totalRevenue ?? 0;
  const spend = sky.totalSpend ?? 0;
  const profit = revenue - spend;
  const roas = spend > 0 ? revenue / spend : 0;
  const conversions = sky.totalConversions ?? 0;

  const items = [
    { label: "Receita", value: fmtCompact(revenue), color: "text-foreground" },
    { label: "Investido", value: fmtCompact(spend), color: "text-foreground" },
    { label: "Lucro", value: fmtCompact(profit), color: profit >= 0 ? "text-[#24D67E]" : "text-[#F2354A]" },
    { label: "ROAS", value: `${roas.toFixed(2)}x`, color: roas >= 1 ? "text-[#24D67E]" : "text-[#F2354A]" },
    { label: "Vendas", value: String(conversions), color: "text-foreground" },
  ];

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="fixed top-12 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-b border-border/30 hidden md:block shadow-sm"
        >
          <div className="max-w-[1680px] mx-auto px-6 py-1.5 flex items-center gap-6">
            {items.map((item) => (
              <div key={item.label} className="flex items-center gap-1.5">
                <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">{item.label}</span>
                <span className={`text-xs font-bold font-data ${item.color}`}>{item.value}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Place this sentinel div at the top of the dashboard KPI section */
export function StickyKpiSentinel() {
  return <div id="sticky-kpi-sentinel" className="h-0 w-0" />;
}
