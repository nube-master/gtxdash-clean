import { Component, useEffect, useMemo, useRef, useState, lazy, Suspense, type ReactNode } from "react";
import { resolveGeo } from "@/lib/geoCoords";
import * as THREE from "three";
import { Globe2 } from "lucide-react";

const Globe = lazy(() => import("react-globe.gl").then((m) => ({ default: m.default })));

class GlobeErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: unknown) { console.warn("[ViewerGlobe] WebGL falhou, usando fallback:", err); }
  render() { return this.state.hasError ? this.props.fallback : this.props.children; }
}

type LocAgg = { country: string; state: string | null; count: number };

export type GlobePalette = {
  ocean: string; // hex/rgb
  oceanOpacity: number;
  land: string; // rgba/hex for hex polygon dots
  pin: string; // hex/hsl for pins + rings
  atmosphere: string;
};

interface Props {
  locations: LocAgg[];
  size?: number;
  palette?: GlobePalette;
}

const COUNTRIES_URL =
  "//unpkg.com/three-globe/example/country-polygons/ne_110m_admin_0_countries.geojson";

export const DEFAULT_PALETTE: GlobePalette = {
  ocean: "#1a1d24",
  oceanOpacity: 0.85,
  land: "rgba(180, 188, 200, 0.55)",
  pin: "hsl(1, 100%, 55%)",
  atmosphere: "hsl(1, 100%, 55%)",
};

/**
 * 3D globe with configurable palette (ocean / continents / pins).
 */
export function ViewerGlobe({ locations, size = 480, palette = DEFAULT_PALETTE }: Props) {
  const globeRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [countries, setCountries] = useState<any[]>([]);
  const [containerSize, setContainerSize] = useState(size);

  useEffect(() => {
    fetch(COUNTRIES_URL)
      .then((r) => r.json())
      .then((d) => setCountries(d.features || []))
      .catch(() => setCountries([]));
  }, []);

  // Measure container and keep globe responsive
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      const s = Math.min(Math.floor(rect.width), size);
      setContainerSize(s > 0 ? s : size);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => { ro.disconnect(); window.removeEventListener("resize", update); };
  }, [size]);

  const points = useMemo(() => {
    return locations
      .map((l) => {
        const geo = resolveGeo(l.country, l.state);
        if (!geo) return null;
        return {
          lat: geo.lat,
          lng: geo.lng,
          count: l.count,
          label: `${l.state ?? l.country}: ${l.count} ao vivo`,
        };
      })
      .filter(Boolean) as { lat: number; lng: number; count: number; label: string }[];
  }, [locations]);

  const rings = useMemo(
    () =>
      points.map((p) => ({
        lat: p.lat,
        lng: p.lng,
        maxR: 4 + Math.min(p.count, 20) * 0.4,
        propagationSpeed: 2,
        repeatPeriod: 1400,
      })),
    [points]
  );

  const globeMaterial = useMemo(() => {
    return new THREE.MeshPhongMaterial({
      color: new THREE.Color(palette.ocean),
      transparent: true,
      opacity: palette.oceanOpacity,
      shininess: 8,
    });
  }, [palette.ocean, palette.oceanOpacity]);

  useEffect(() => {
    if (!globeRef.current) return;
    const controls = globeRef.current.controls?.();
    if (controls) {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.6;
      controls.enableZoom = false;
    }
    globeRef.current.pointOfView?.({ lat: 25, lng: -60, altitude: 2.2 }, 0);
  }, []);

  // Convert pin color to rgba ring color
  const pinRingFn = useMemo(() => {
    const c = palette.pin;
    return (t: number) => {
      // accept hsl(...) or #hex
      if (c.startsWith("hsl")) {
        const m = c.match(/hsl\(\s*(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)%[,\s]+(\d+(?:\.\d+)?)%/);
        if (m) return `hsla(${m[1]}, ${m[2]}%, ${m[3]}%, ${1 - t})`;
      }
      return c;
    };
  }, [palette.pin]);

  return (
    <div
      ref={containerRef}
      className="relative aspect-square w-full mx-auto overflow-hidden rounded-full"
      style={{ maxWidth: size }}
    >
      <div
        className="absolute inset-0 rounded-full"
        style={{ background: `radial-gradient(circle at 50% 50%, ${palette.atmosphere}33, transparent 70%)` }}
      />
      <GlobeErrorBoundary
        fallback={
          <div className="absolute inset-0 grid place-items-center text-center text-xs text-muted-foreground gap-2 p-4">
            <Globe2 className="h-8 w-8 opacity-50 mx-auto" />
            <div>Globo 3D indisponível<br/><span className="opacity-70">(WebGL bloqueado pelo navegador)</span></div>
          </div>
        }
      >
        <Suspense fallback={<div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">carregando globo…</div>}>
          <Globe
            ref={globeRef}
            width={containerSize}
            height={containerSize}
            backgroundColor="rgba(0,0,0,0)"
            globeMaterial={globeMaterial}
            showAtmosphere
            atmosphereColor={palette.atmosphere}
            atmosphereAltitude={0.2}
            hexPolygonsData={countries}
            hexPolygonResolution={3}
            hexPolygonMargin={0.3}
            hexPolygonUseDots
            hexPolygonColor={() => palette.land}
            pointsData={points}
            pointLat="lat"
            pointLng="lng"
            pointColor={() => palette.pin}
            pointAltitude={(d: any) => 0.02 + Math.min(d.count, 50) * 0.008}
            pointRadius={(d: any) => 0.4 + Math.min(d.count, 30) * 0.05}
            pointLabel="label"
            pointsMerge={false}
            ringsData={rings}
            ringColor={() => pinRingFn}
            ringMaxRadius="maxR"
            ringPropagationSpeed="propagationSpeed"
            ringRepeatPeriod="repeatPeriod"
          />
        </Suspense>
      </GlobeErrorBoundary>
    </div>
  );
}
