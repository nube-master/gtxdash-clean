import { TrendingUp, DollarSign, ShoppingCart } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDashboardTotals } from "@/hooks/useDashboardTotals";

const fadeVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toFixed(0);
}

function fmtBrl(n: number): string {
  if (n >= 1000) return `R$${(n / 1000).toFixed(1)}k`;
  return `R$${n.toFixed(0)}`;
}

interface Props {
  collapsed: boolean;
}

export function SidebarMiniKpis({ collapsed }: Props) {
  const { data } = useDashboardTotals();
  const profit = data?.lucroBruto ?? 0;
  const roas = data?.roas ?? 0;
  const sales = data?.totalConversions ?? 0;
  const profitPositive = profit >= 0;

  const kpis = [
    {
      icon: DollarSign,
      label: "Lucro",
      value: fmtBrl(Math.abs(profit)),
      color: profitPositive ? "text-[#24D67E]" : "text-[#F2354A]",
      bgColor: profitPositive ? "bg-[#24D67E]/10" : "bg-[#F2354A]/10",
      prefix: profitPositive ? "+" : "-",
    },
    {
      icon: TrendingUp,
      label: "ROAS",
      value: `${roas.toFixed(2)}x`,
      color: roas >= 1 ? "text-[#24D67E]" : "text-[#F2354A]",
      bgColor: roas >= 1 ? "bg-[#24D67E]/10" : "bg-[#F2354A]/10",
    },
    {
      icon: ShoppingCart,
      label: "Vendas",
      value: fmt(sales),
      color: "text-foreground",
      bgColor: "bg-white/[0.04]",
    },
  ];

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1 px-1 py-1">
        {kpis.map((kpi) => (
          <Tooltip key={kpi.label}>
            <TooltipTrigger asChild>
              <div className={`h-7 w-7 rounded-md flex items-center justify-center ${kpi.bgColor}`}>
                <kpi.icon className={`h-3 w-3 ${kpi.color}`} />
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs font-mono">
              {kpi.label}: {kpi.prefix ?? ""}{kpi.value}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="mini-kpis"
        variants={fadeVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="px-2.5 pb-1"
      >
        <div className="grid grid-cols-3 gap-1">
          {kpis.map((kpi) => (
            <div
              key={kpi.label}
              className={`flex flex-col items-center gap-0.5 py-1.5 rounded-md ${kpi.bgColor}`}
            >
              <span className={`text-[10px] font-mono font-black tabular-nums ${kpi.color}`}>
                {kpi.prefix ?? ""}{kpi.value}
              </span>
              <span className="text-[8px] text-muted-foreground/60 uppercase tracking-wider">
                {kpi.label}
              </span>
            </div>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
