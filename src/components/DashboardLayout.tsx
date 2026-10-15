import { SidebarProvider } from "@/components/ui/sidebar";
import { SystemHealthAlert } from "@/components/dashboard/SystemHealthAlert";
import { MetaTokenAlert } from "@/components/dashboard/MetaTokenAlert";
import { SyncHealthBanner } from "@/components/dashboard/SyncHealthBanner";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PushOnboardingBanner } from "@/components/notifications/PushOnboardingBanner";

import { AppSidebar } from "@/components/AppSidebar";
import { Moon, Sun, RefreshCw, Search, Eclipse, Menu } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { useState, useCallback, useRef } from "react";
import { DateRangeSelector } from "@/components/header/DateRangeSelector";
import { useLiveSales } from "@/hooks/useLiveSales";
import { useDashboardTotals } from "@/hooks/useDashboardTotals";
import { LiveSalesButton } from "@/components/live/LiveSalesButton";
import { LiveSalesDrawer } from "@/components/live/LiveSalesDrawer";
import { LiveSalesToast } from "@/components/live/LiveSalesToast";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { PullToRefreshIndicator } from "@/components/PullToRefreshIndicator";
import { useQueryClient } from "@tanstack/react-query";
import { useMobilePerformance } from "@/hooks/useMobilePerformance";
import { MobileDrawer } from "@/components/mobile/MobileFab";
import { RevenueGoalBar } from "@/components/header/RevenueGoalBar";
import { CommandPalette } from "@/components/CommandPalette";
import { ShortcutsOverlay } from "@/components/ShortcutsOverlay";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { FocusModeProvider, FocusModeButton, useFocusMode } from "@/components/FocusMode";
import { StickyKpiBar } from "@/components/StickyKpiBar";
import { ScrollToTopFab } from "@/components/ScrollToTopFab";
import { IntegrationStatusBar } from "@/components/IntegrationStatusBar";
import { ChangelogModal } from "@/components/ChangelogModal";
import { ExchangeRateWidget } from "@/components/header/ExchangeRateWidget";
import { useVendorMapping } from "@/hooks/useVendorMapping";
import { SetupGuide } from "@/components/SetupGuide";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { OperationSelector } from "@/components/header/OperationSelector";
import { useOperationId } from "@/contexts/OperationContext";
import { CurrencySelector } from "@/components/header/CurrencySelector";
import { CurrencyProvider, useCurrency } from "@/contexts/CurrencyContext";
import { PacingFullscreenProvider, usePacingFullscreen } from "@/contexts/PacingFullscreenContext";
import { PacingDateRangeProvider } from "@/contexts/PacingDateRangeContext";
import { PacingLiveModeProvider } from "@/contexts/PacingLiveModeContext";


function LayoutInner({ children }: { children: React.ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  const { currency } = useCurrency();
  const { user, displayName, avatarUrl, signOut: authSignOut } = useAuth();
  useKeyboardShortcuts();
  useVendorMapping(); // hydrate dynamic affiliate→project mapping
  const { isFocused } = useFocusMode();
  const { isFullscreen } = usePacingFullscreen();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const operationId = useOperationId();
  const perf = useMobilePerformance();
  const { dataUpdatedAt, refetch: refetchSky } = useDashboardTotals();
  const [skyRefreshing, setSkyRefreshing] = useState(false);
  

  const handleSkyRefresh = useCallback(async () => {
    if (skyRefreshing) return;
    setSkyRefreshing(true);
    try {
      // 1. Trigger Meta sync in background
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const syncBody = operationId ? { operation_id: operationId, full: true } : { full: false };
      fetch(`https://${projectId}.supabase.co/functions/v1/sync-meta-fast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(syncBody),
      }).catch(() => {}); // fire-and-forget
      fetch(`https://${projectId}.supabase.co/functions/v1/sync-meta-today`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(syncBody),
      }).catch(() => {}); // fire-and-forget

      // 2. Invalidate all data queries
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dashboard-totals"] }),
        queryClient.invalidateQueries({ queryKey: ["real-sales"] }),
        queryClient.invalidateQueries({ queryKey: ["traffic-data"] }),
        queryClient.invalidateQueries({ queryKey: ["vsl-data"] }),
        queryClient.invalidateQueries({ queryKey: ["planning-goals"] }),
        queryClient.invalidateQueries({ queryKey: ["prev-sales"] }),
        queryClient.invalidateQueries({ queryKey: ["prev-traffic"] }),
        queryClient.invalidateQueries({ queryKey: ["prev-vsl"] }),
        queryClient.invalidateQueries({ queryKey: ["real-sales-range"] }),
        queryClient.invalidateQueries({ queryKey: ["traffic-data-range"] }),
      ]);
      await refetchSky();
    } finally {
      setSkyRefreshing(false);
    }
  }, [skyRefreshing, queryClient, refetchSky, operationId]);
  const {
    sales, lastSaleAt, unreadCount, markAsRead,
    soundEnabled, toggleSound,
    latestNewSale, consumeLatestSale,
  } = useLiveSales();

  // --- Silent auto-refresh DISABLED to reduce DB load ---
  // Data refreshes only via Sky button or pull-to-refresh

  // --- Pull-to-refresh (mobile only) ---
  const lastPullRef = useRef(0);
  const handlePullRefresh = useCallback(async () => {
    // Cache guard: skip if refreshed within 10s
    const now = Date.now();
    if (now - lastPullRef.current < perf.cacheTtlMs) {
      // Still show spinner briefly for UX feedback
      await new Promise((r) => setTimeout(r, 400));
      return;
    }
    lastPullRef.current = now;

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["real-sales"] }),
      queryClient.invalidateQueries({ queryKey: ["traffic-data"] }),
      queryClient.invalidateQueries({ queryKey: ["vsl-data"] }),
      queryClient.invalidateQueries({ queryKey: ["prev-sales"] }),
      queryClient.invalidateQueries({ queryKey: ["prev-traffic"] }),
      queryClient.invalidateQueries({ queryKey: ["prev-vsl"] }),
      queryClient.invalidateQueries({ queryKey: ["planning-goals"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-totals"] }),
    ]);
    await new Promise((r) => setTimeout(r, 800));
  }, [queryClient, perf.cacheTtlMs]);

  const { pullDistance, isRefreshing } = usePullToRefresh({
    onRefresh: handlePullRefresh,
  });

  const minutesSinceLastSale = lastSaleAt
    ? (Date.now() - lastSaleAt.getTime()) / 60_000
    : Infinity;

  const handleOpenDrawer = useCallback(() => {
    setDrawerOpen(true);
    markAsRead();
  }, [markAsRead]);

  // --- New sale badge (red dot in header when unread > 0) ---
  const showNewSaleBadge = unreadCount > 0 && !drawerOpen;

  return (
    <SidebarProvider defaultOpen={false} className="dashboard-shell-provider">
      <div className={`dashboard-shell flex min-h-screen w-full overflow-hidden bg-background transition-all duration-300 ${isFocused ? "focus-mode" : ""} ${isFullscreen ? "pacing-fullscreen" : ""}`}>
        {!isFocused && <AppSidebar />}
        <main className="flex-1 min-w-0 flex flex-col min-h-screen">
          {!isFullscreen && <ImpersonationBanner />}
          {!isFullscreen && <SyncHealthBanner />}
          {!isFullscreen && (
            <header className={`flex items-center justify-between border-b sticky top-0 z-50 bg-background/80 backdrop-blur-xl transition-all duration-300 ${isFocused ? "h-10" : ""} ${isMobile ? "px-3 pb-1.5 pt-[calc(env(safe-area-inset-top,0px)+6px)]" : "px-6 h-[60px]"}`} style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="flex items-center gap-3 min-w-0">
                {isMobile && (
                  <button
                    onClick={() => setMobileMenuOpen(true)}
                    className="relative h-9 w-9 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors border border-border/50 bg-muted/30 shrink-0"
                    title="Menu"
                    aria-label="Abrir menu"
                  >
                    <Menu className="h-4 w-4" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 rounded-full bg-destructive text-destructive-foreground text-[8px] font-bold flex items-center justify-center">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                  </button>
                )}
                <Breadcrumbs />
                <OperationSelector />
              </div>

               <div className="flex items-center gap-1.5 md:gap-2 overflow-x-auto no-scrollbar">
                
                {!isMobile && (
                  <button
                    onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-border/50 bg-muted/30 hover:bg-muted/60 transition-colors cursor-pointer shrink-0"
                    title="Buscar (⌘K)"
                  >
                    <Search className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">Buscar...</span>
                    <kbd className="ml-1 text-[9px] font-mono text-muted-foreground/60 bg-muted/50 px-1 rounded">⌘K</kbd>
                  </button>
                )}
                {!isMobile && <RevenueGoalBar />}
                {!isMobile && <ExchangeRateWidget />}
                <CurrencySelector />
                <LiveSalesButton
                  count={unreadCount}
                  hasNew={unreadCount > 0}
                  minutesSinceLastSale={minutesSinceLastSale}
                  onClick={handleOpenDrawer}
                />

                <DateRangeSelector />



                {!isMobile && <FocusModeButton />}

                <button
                  onClick={toggleTheme}
                  className="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors border border-primary/10 bg-primary/5 shrink-0 group relative"
                  title={theme === "dark" ? "Light mode (L)" : theme === "light" ? "Midnight mode (L)" : "Dark mode (L)"}
                >
                  {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : theme === "light" ? <Eclipse className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                  <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[8px] font-mono text-muted-foreground/60 bg-popover border border-border rounded px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">L</span>
                </button>



              </div>
            </header>
          )}
          
          {!isFocused && !isFullscreen && <MetaTokenAlert />}
          {!isFocused && !isFullscreen && <SystemHealthAlert />}
          
          
          {/* Mobile KPI bar slot — filled by Overview via portal or context */}
          <div id="mobile-kpi-slot" />

          {/* Pull-to-refresh indicator (mobile) */}
          {isMobile && !isFullscreen && (
            <PullToRefreshIndicator
              pullDistance={pullDistance}
              isRefreshing={isRefreshing}
            />
          )}

          <div className={`flex-1 overflow-y-auto min-h-0 min-w-0 ${isFullscreen ? "px-0 py-0 overflow-x-hidden" : isMobile ? "px-3 py-4 pb-8 overflow-x-hidden" : "px-6 py-6 2xl:px-8 overflow-x-hidden"}`} id="dashboard-content">
            <div key={currency} className="mx-auto w-full h-full min-w-0 max-w-none">
              {!isFullscreen && <PushOnboardingBanner />}
              {children}
            </div>
          </div>
      </main>
      </div>

      {!isFullscreen && isMobile && (
        <MobileDrawer open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
      )}

      <LiveSalesDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        sales={sales}
        lastSaleAt={lastSaleAt}
        soundEnabled={soundEnabled}
        toggleSound={toggleSound}
      />

      <LiveSalesToast latestSale={latestNewSale} onConsumed={consumeLatestSale} dailyCount={sales.length} />
      <CommandPalette />
      <ShortcutsOverlay />
      {!isFullscreen && <ScrollToTopFab />}
      <ChangelogModal />
      <SetupGuide />
      
    </SidebarProvider>
  );
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <CurrencyProvider>
      <DateRangeProvider>
        <FocusModeProvider>
          <PacingFullscreenProvider>
            <PacingDateRangeProvider>
              <PacingLiveModeProvider>
                <LayoutInner>{children}</LayoutInner>
              </PacingLiveModeProvider>
            </PacingDateRangeProvider>
          </PacingFullscreenProvider>
        </FocusModeProvider>
      </DateRangeProvider>
    </CurrencyProvider>
  );
}
