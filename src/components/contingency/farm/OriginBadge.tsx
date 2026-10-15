import { Sprout, Flame } from "lucide-react";
import type { AccountOrigin } from "./farmHelpers";
import { ORIGIN_META } from "./farmHelpers";

interface Props {
  origin: AccountOrigin;
  size?: "xs" | "sm";
  showLabel?: boolean;
}

export function OriginBadge({ origin, size = "xs", showLabel = true }: Props) {
  const meta = ORIGIN_META[origin];
  const Icon = origin === "aquecimento" ? Flame : Sprout;
  const padX = size === "xs" ? "px-1" : "px-1.5";
  const padY = size === "xs" ? "py-[1px]" : "py-0.5";
  const text = size === "xs" ? "text-[8px]" : "text-[9px]";
  const iconSize = size === "xs" ? "h-2 w-2" : "h-2.5 w-2.5";
  return (
    <span
      title={meta.tooltip}
      className={`inline-flex items-center gap-0.5 rounded-full border ${padX} ${padY} ${text} font-bold uppercase tracking-wider shrink-0 ${meta.tone}`}
    >
      <Icon className={iconSize} />
      {showLabel && <span>{meta.short}</span>}
    </span>
  );
}
