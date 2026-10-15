import { useEffect } from "react";
import { toast } from "sonner";
import { DollarSign } from "lucide-react";
import type { LiveSale } from "@/hooks/useLiveSales";
import { resolveProductName } from "@/lib/productNames";
import { getToastPreferences, playToastSound, resolveTemplate, type ToastLogo, type ToastAnimation } from "@/hooks/useToastPreferences";
import { extractProjectCode } from "@/lib/projectUtils";
import { useOperation } from "@/contexts/OperationContext";

function fmtCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function deriveProjectLabel(sale: LiveSale): string {
  if (sale.project && sale.project !== "Outros") return sale.project;
  if (sale.store === "redtrack") return resolveProductName(sale.offer_name, sale.product_name, "Projeto");
  const code = resolveProductName(null, sale.product_name, "");
  if (code) return code;
  return "Projeto";
}

function deriveSigla(sale: LiveSale): string {
  const code = extractProjectCode(sale.product_name || sale.offer_name || "");
  return code || "";
}

function deriveIsUS(sale: LiveSale): boolean {
  return sale.store === "redtrack" || sale.event_type === "purchase" || sale.event_type === "upsell";
}

export function LogoIcon({ logo, size = 18, customLogoUrl }: { logo: ToastLogo; size?: number; customLogoUrl?: string }) {
  if (logo === "custom" && customLogoUrl) {
    return (
      <img
        src={customLogoUrl}
        alt="Logo"
        className="object-contain rounded"
        style={{ width: size, height: size }}
      />
    );
  }
  const cls = "text-white/90";
  switch (logo) {
    case "fire": return <span style={{ fontSize: size - 2 }}>🔥</span>;
    case "dollar": return <DollarSign size={size} className={cls} />;
    case "rocket": return <span style={{ fontSize: size - 2 }}>🚀</span>;
    case "check": return <span style={{ fontSize: size - 2 }}>✅</span>;
    case "bolt": return <span style={{ fontSize: size - 2 }}>⚡</span>;
    case "gtx":
    default:
      return <DollarSign size={size} className={cls} />;
  }
}

export function SaleToastContent({
  titleLine,
  subtitleLine,
  logo,
  bgColor: _bgColor,
  textColor: _textColor,
  customLogoUrl,
  animation = "default",
  duration = 8,
  productName,
  countLabel,
  timeLabel,
  isUS = false,
}: {
  titleLine: string;
  subtitleLine: string;
  logo: ToastLogo;
  bgColor: string;
  textColor: string;
  customLogoUrl?: string;
  animation?: ToastAnimation;
  duration?: number;
  productName?: string;
  countLabel?: string;
  timeLabel?: string;
  isUS?: boolean;
}) {
  const flag = isUS ? "🇺🇸" : "🇧🇷";

  return (
    <div
      className="relative overflow-hidden rounded-lg w-[calc(100vw-32px)] sm:w-auto"
      style={{
        background: "hsl(220 12% 11% / 0.97)",
        backdropFilter: "blur(12px)",
        minWidth: "auto",
        maxWidth: 340,
        border: "1px solid hsl(220 8% 18%)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
      }}
    >
      <div className="px-3.5 py-2.5 flex items-center gap-3">
        {/* Compact status dot + flag */}
        <div className="flex flex-col items-center gap-0.5 shrink-0">
          <span className="text-base leading-none">{flag}</span>
          <div
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: "hsl(145 80% 42%)" }}
          />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span
              className="text-[11px] font-semibold uppercase tracking-wide"
              style={{ color: "hsl(0 0% 100%)" }}
            >
              {titleLine}
            </span>
          </div>
          <p
            className="text-[15px] font-bold font-mono tabular-nums leading-tight mt-0.5"
            style={{ color: "hsl(0 0% 100%)" }}
          >
            {subtitleLine}
          </p>
        </div>

        {/* Right meta */}
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          {countLabel && (
            <span
              className="text-[10px] font-mono font-semibold tabular-nums"
              style={{ color: "hsl(220 6% 50%)" }}
            >
              {countLabel}
            </span>
          )}
          {productName && (
            <span
              className="text-[9px] font-medium uppercase tracking-wider"
              style={{ color: "hsl(220 6% 40%)" }}
            >
              {productName}
            </span>
          )}
          {timeLabel && (
            <span
              className="text-[9px] font-mono tabular-nums"
              style={{ color: "hsl(220 6% 35%)" }}
            >
              {timeLabel}
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-[2px] w-full" style={{ background: "hsl(220 8% 14%)" }}>
        <div
          className="h-full rounded-full"
          style={{
            background: "hsl(1 100% 45%)",
            opacity: 0.7,
            animation: `toast-progress ${duration}s linear forwards`,
          }}
        />
      </div>
    </div>
  );
}

interface LiveSalesToastProps {
  latestSale: LiveSale | null;
  onConsumed: () => void;
  dailyCount?: number;
}

export function LiveSalesToast({ latestSale, onConsumed, dailyCount }: LiveSalesToastProps) {
  const { operation } = useOperation();
  useEffect(() => {
    if (!latestSale) return;

    const prefs = getToastPreferences(operation?.id);
    const project = deriveProjectLabel(latestSale);
    const sigla = deriveSigla(latestSale);
    const isUS = deriveIsUS(latestSale);
    const flag = isUS ? "🇺🇸" : "🇧🇷";
    const count = dailyCount ?? 0;
    const countStr = String(count).padStart(2, "0");
    const value = fmtCurrency(latestSale.revenue);
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    const rawProduct = latestSale.product_name || latestSale.offer_name || "";
    const vars = {
      projeto: project,
      sigla,
      produto: rawProduct,
      flag,
      contador: countStr,
      valor: value,
    };

    const titleLine = resolveTemplate(prefs.titleTemplate, vars);
    const subtitleLine = resolveTemplate(prefs.subtitleTemplate, vars);

    const productName = sigla || project || (rawProduct ? rawProduct.substring(0, 16) : "");
    const countLabel = count > 0 ? `#${countStr}` : "";

    if (prefs.soundEnabled) {
      playToastSound(prefs.sound);
    }

    // Haptic feedback em mobile (silencioso em desktop)
    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate([40, 30, 40]);
      }
    } catch {
      // ignore
    }

    toast.custom(
      () => (
        <SaleToastContent
          titleLine={titleLine}
          subtitleLine={subtitleLine}
          logo={prefs.logo}
          bgColor={prefs.bgColor}
          textColor={prefs.textColor}
          customLogoUrl={prefs.customLogoUrl}
          animation={prefs.animation}
          duration={prefs.duration}
          productName={productName}
          countLabel={countLabel}
          timeLabel={timeStr}
          isUS={isUS}
        />
      ),
      {
        duration: prefs.duration * 1000,
        position: prefs.position,
        unstyled: true,
        style: {
          borderRadius: "8px",
          overflow: "hidden",
        },
      }
    );

    onConsumed();
  }, [latestSale, onConsumed, dailyCount]);

  return null;
}
