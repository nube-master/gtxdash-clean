import { useEffect, useState } from "react";
import { Palette } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { GlobePalette } from "./ViewerGlobe";
import { DEFAULT_PALETTE } from "./ViewerGlobe";

const STORAGE_KEY = "ao-vivo:globe-palette";

export const PALETTES: { id: string; name: string; palette: GlobePalette }[] = [
  {
    id: "system",
    name: "Sistema (auto)",
    palette: DEFAULT_PALETTE, // overwritten at runtime
  },
  {
    id: "brasa",
    name: "Brasa",
    palette: {
      ocean: "#1a1d24",
      oceanOpacity: 0.85,
      land: "rgba(180, 188, 200, 0.55)",
      pin: "hsl(1, 100%, 55%)",
      atmosphere: "hsl(1, 100%, 55%)",
    },
  },
  {
    id: "oceano",
    name: "Oceano",
    palette: {
      ocean: "#0b1a2e",
      oceanOpacity: 0.9,
      land: "rgba(160, 200, 230, 0.55)",
      pin: "hsl(210, 90%, 60%)",
      atmosphere: "hsl(210, 90%, 60%)",
    },
  },
  {
    id: "mata",
    name: "Mata",
    palette: {
      ocean: "#0e1a16",
      oceanOpacity: 0.88,
      land: "rgba(180, 220, 190, 0.55)",
      pin: "hsl(145, 70%, 50%)",
      atmosphere: "hsl(145, 70%, 50%)",
    },
  },
  {
    id: "mono",
    name: "Mono",
    palette: {
      ocean: "#15171b",
      oceanOpacity: 0.85,
      land: "rgba(200, 200, 200, 0.5)",
      pin: "hsl(0, 0%, 90%)",
      atmosphere: "hsl(0, 0%, 70%)",
    },
  },
];

/** Read --primary / --muted / --background from CSS to build the system palette */
function readSystemPalette(): GlobePalette {
  if (typeof window === "undefined") return DEFAULT_PALETTE;
  const styles = getComputedStyle(document.documentElement);
  // CSS vars come as "H S% L%" (space separated) — d3-color needs commas
  const toHsl = (raw: string, fallback: string) => {
    const v = (raw || "").trim() || fallback;
    const parts = v.split(/\s+/);
    return parts.length >= 3 ? `hsl(${parts[0]}, ${parts[1]}, ${parts[2]})` : `hsl(${fallback})`;
  };
  const toHsla = (raw: string, fallback: string, alpha: number) => {
    const v = (raw || "").trim() || fallback;
    const parts = v.split(/\s+/);
    return parts.length >= 3
      ? `hsla(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`
      : `hsla(${fallback}, ${alpha})`;
  };
  const primary = styles.getPropertyValue("--primary");
  const muted = styles.getPropertyValue("--muted-foreground");
  const bg = styles.getPropertyValue("--card") || styles.getPropertyValue("--background");
  return {
    ocean: toHsl(bg, "220, 14%, 7%"),
    oceanOpacity: 0.88,
    land: toHsla(muted, "220, 6%, 70%", 0.55),
    pin: toHsl(primary, "1, 100%, 55%"),
    atmosphere: toHsl(primary, "1, 100%, 55%"),
  };
}

export function useGlobePalette(): [GlobePalette, string, (id: string) => void] {
  const [id, setId] = useState<string>(() => {
    if (typeof window === "undefined") return "system";
    return localStorage.getItem(STORAGE_KEY) || "system";
  });
  const [palette, setPalette] = useState<GlobePalette>(() =>
    id === "system" ? readSystemPalette() : PALETTES.find((p) => p.id === id)?.palette ?? DEFAULT_PALETTE
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, id);
    if (id === "system") {
      setPalette(readSystemPalette());
      // re-read when theme toggles (class change on html)
      const obs = new MutationObserver(() => setPalette(readSystemPalette()));
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
      return () => obs.disconnect();
    } else {
      setPalette(PALETTES.find((p) => p.id === id)?.palette ?? DEFAULT_PALETTE);
    }
  }, [id]);

  return [palette, id, setId];
}

export function GlobePaletteSelector({ currentId, onSelect }: { currentId: string; onSelect: (id: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs gap-1.5">
          <Palette className="h-3 w-3" />
          Paleta
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-xs">Paleta do globo</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {PALETTES.map((p) => (
          <DropdownMenuItem
            key={p.id}
            onClick={() => onSelect(p.id)}
            className="flex items-center gap-2 text-xs"
          >
            <span
              className="h-3 w-3 rounded-full border"
              style={{
                background:
                  p.id === "system"
                    ? "hsl(var(--primary))"
                    : p.palette.pin,
              }}
            />
            <span className="flex-1">{p.name}</span>
            {currentId === p.id && <span className="text-primary">✓</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
