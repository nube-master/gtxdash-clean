import { Card, CardContent } from "@/components/ui/card";
import { useMarketPulseData } from "@/hooks/useMarketPulseData";
import { TrendingUp, TrendingDown, AlertTriangle, Shield, ShieldAlert } from "lucide-react";
import { KpiHelpIcon } from "@/components/KpiHelpIcon";
import { motion } from "framer-motion";

function fmtCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
}

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      delay: i * 0.1,
      duration: 0.4,
      ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number],
    },
  }),
};

const valueVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: {
      delay: i * 0.1 + 0.25,
      duration: 0.3,
      ease: "easeOut" as const,
    },
  }),
};

export function MarketPulse() {
  const { data, isLoading } = useMarketPulseData();

  if (isLoading || !data) {
    return (
      <div>
        <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
          📡 Market Pulse <KpiHelpIcon term="Market Pulse" className="inline ml-1" />
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="bg-card border border-border animate-pulse">
              <CardContent className="p-4 h-20" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const riskConfig = {
    baixo: { label: "Baixo", icon: Shield, color: "text-wr-positive", bg: "bg-wr-positive/10 border-wr-positive/30" },
    medio: { label: "Médio", icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-400/10 border-amber-400/30" },
    alto: { label: "Alto", icon: ShieldAlert, color: "text-destructive", bg: "bg-destructive/10 border-destructive/30" },
  }[data.riskLevel];

  const isVarPositive = data.variationVsAvg7 >= 0;

  const cards = [
    {
      label: "ROAS Hoje",
      cardClass: "bg-card border border-border",
      content: (
        <p className={`text-xl font-bold font-data mt-1 ${data.roasToday >= 1.5 ? "text-wr-positive" : data.roasToday >= 1 ? "text-amber-400" : "text-destructive"}`}>
          {data.roasToday.toFixed(2)}x
        </p>
      ),
    },
    {
      label: "ROAS 3 Dias",
      cardClass: "bg-card border border-border",
      content: (
        <p className={`text-xl font-bold font-data mt-1 ${data.roas3 >= 1.5 ? "text-wr-positive" : data.roas3 >= 1 ? "text-amber-400" : "text-destructive"}`}>
          {data.roas3.toFixed(2)}x
        </p>
      ),
    },
    {
      label: "Lucro Hoje",
      cardClass: "bg-card border border-border",
      content: (
        <p className={`text-xl font-bold font-data mt-1 ${data.lucroToday >= 0 ? "text-wr-positive" : "text-destructive"}`}>
          {fmtCurrency(data.lucroToday)}
        </p>
      ),
    },
    {
      label: "vs Média 7d",
      cardClass: "bg-card border border-border",
      content: (
        <div className="flex items-center gap-1.5 mt-1">
          {isVarPositive ? <TrendingUp className="h-4 w-4 text-wr-positive" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
          <p className={`text-xl font-bold font-data ${isVarPositive ? "text-wr-positive" : "text-destructive"}`}>
            {isVarPositive ? "+" : ""}{data.variationVsAvg7.toFixed(1)}%
          </p>
        </div>
      ),
    },
    {
      label: "Risco",
      cardClass: `border ${riskConfig.bg}`,
      content: (
        <div className="flex items-center gap-2 mt-1">
          <riskConfig.icon className={`h-5 w-5 ${riskConfig.color}`} />
          <p className={`text-xl font-bold font-data ${riskConfig.color}`}>
            {riskConfig.label}
          </p>
        </div>
      ),
    },
  ];

  return (
    <div>
      <motion.h2
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
        className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3"
      >
        📡 Market Pulse — Tempo Real <KpiHelpIcon term="Market Pulse" className="inline ml-1" />
      </motion.h2>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {cards.map((card, i) => (
          <motion.div
            key={card.label}
            custom={i}
            initial="hidden"
            animate="visible"
            variants={cardVariants}
          >
            <Card className={card.cardClass}>
              <CardContent className="p-4">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{card.label}</span>
                <motion.div custom={i} initial="hidden" animate="visible" variants={valueVariants}>
                  {card.content}
                </motion.div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
