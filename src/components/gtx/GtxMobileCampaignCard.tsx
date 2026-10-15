import { type GtxCampaignRow, type GtxDecision, GTX_DECISION_CONFIG } from "@/hooks/useGtxMetaData";

function fmt(v: number, type: "currency" | "number" | "percent" | "roas") {
  if (type === "currency") return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
  if (type === "number") return new Intl.NumberFormat("pt-BR").format(Math.round(v));
  if (type === "percent") return `${v.toFixed(1).replace(".", ",")}%`;
  if (type === "roas") return `${v.toFixed(2).replace(".", ",")}x`;
  return String(v);
}

const DECISION_DOT: Record<GtxDecision, string> = {
  ESCALAR: "bg-[#00c27a]",
  PROMOVER: "bg-[#38bdf8]",
  MANTER: "bg-[#6b9bd2]",
  OBSERVAR: "bg-[#e2b93b]",
  CORTAR: "bg-[#c0392b]",
};

interface Props {
  row: GtxCampaignRow;
  decision: GtxDecision;
  reason: string;
  onClick: () => void;
}

export function GtxMobileCampaignCard({ row, decision, reason, onClick }: Props) {
  const cfg = GTX_DECISION_CONFIG[decision];

  return (
    <div
      onClick={onClick}
      className="bg-card border border-border/20 rounded-2xl p-4 space-y-3 active:scale-[0.98] transition-transform cursor-pointer"
    >
      {/* Top: Status + Name + Decision */}
      <div className="flex items-start gap-2.5">
        <div className={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${row.status === "ACTIVE" ? "bg-emerald-400" : "bg-muted-foreground/20"}`} />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-mono font-semibold text-foreground/90 truncate leading-tight">
            {row.displayName}
          </p>
          <p className="text-[8px] font-mono text-muted-foreground/40 truncate mt-0.5">
            {row.accountName} · {row.phase}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <div className={`h-2 w-2 rounded-full ${DECISION_DOT[decision]}`} />
          <span className="text-[9px] font-mono font-bold text-muted-foreground">{cfg.label}</span>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-secondary/30 p-2.5">
          <span className="text-[7px] uppercase tracking-widest text-muted-foreground/50 block">Lucro</span>
          <span className={`text-sm font-bold font-data block mt-0.5 ${
            row.profit > 0 ? "text-[#00c27a]" : row.profit < 0 ? "text-[#c0392b]" : "text-muted-foreground/40"
          }`}>
            {row.spend > 0 ? fmt(row.profit, "currency") : "—"}
          </span>
        </div>
        <div className="rounded-xl bg-secondary/30 p-2.5">
          <span className="text-[7px] uppercase tracking-widest text-muted-foreground/50 block">ROAS</span>
          <span className="text-sm font-bold font-data text-foreground/80 block mt-0.5">
            {row.roas > 0 ? fmt(row.roas, "roas") : "—"}
          </span>
        </div>
        <div className="rounded-xl bg-secondary/30 p-2.5">
          <span className="text-[7px] uppercase tracking-widest text-muted-foreground/50 block">Vendas</span>
          <span className="text-sm font-bold font-data text-foreground block mt-0.5">
            {row.salesConfirmed}
          </span>
        </div>
      </div>

      {/* Bottom: Spend + Revenue + 3D dots */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <span className="text-[7px] uppercase text-muted-foreground/40 block">Gasto</span>
            <span className="text-[10px] font-data text-foreground/60">{fmt(row.spend, "currency")}</span>
          </div>
          <div>
            <span className="text-[7px] uppercase text-muted-foreground/40 block">Fat.</span>
            <span className="text-[10px] font-data text-foreground/70">{fmt(row.revenue, "currency")}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[7px] text-muted-foreground/30 mr-1">3D</span>
          {row.profit3D.map((p, i) => (
            <div
              key={i}
              className={`h-3 w-5 rounded-sm ${p > 0 ? "bg-[#00c27a]/40" : p < 0 ? "bg-[#c0392b]/25" : "bg-muted-foreground/10"}`}
              title={`D${i}: ${fmt(p, "currency")}`}
            />
          ))}
        </div>
      </div>

      {/* Reason */}
      {reason && (
        <p className="text-[8px] font-mono text-muted-foreground/50 truncate">
          → {reason}
        </p>
      )}
    </div>
  );
}
