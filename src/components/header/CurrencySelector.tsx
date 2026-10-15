import { Check, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useCurrency, CURRENCY_META, type CurrencyCode } from "@/contexts/CurrencyContext";

const ORDER: CurrencyCode[] = ["BRL", "USD", "EUR"];

export function CurrencySelector() {
  const { currency, setCurrency } = useCurrency();
  const meta = CURRENCY_META[currency];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer shrink-0"
          title="Moeda de exibição"
        >
          <span className="text-xs leading-none">{meta.flag}</span>
          <span className="text-[10px] font-mono font-bold tabular-nums text-foreground">
            {currency}
          </span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="min-w-[160px]">
        {ORDER.map((code) => {
          const m = CURRENCY_META[code];
          const active = code === currency;
          return (
            <DropdownMenuItem
              key={code}
              onClick={() => setCurrency(code)}
              className="flex items-center justify-between gap-2 cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <span className="text-sm leading-none">{m.flag}</span>
                <span className="text-xs font-mono font-bold">{code}</span>
                <span className="text-[10px] text-muted-foreground">{m.label}</span>
              </span>
              {active && <Check className="h-3 w-3 text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
