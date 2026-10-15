import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { OperationProvider } from "@/contexts/OperationContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { DashboardLayout } from "@/components/DashboardLayout";
import { lazy, Suspense, Component, type ReactNode, type ErrorInfo } from "react";
import { useOperation, type OperationFeature } from "@/contexts/OperationContext";
import { Loader2 } from "lucide-react";
import { PageTransition } from "@/components/PageTransition";

// ── Error Boundary for lazy-loaded routes ──
class LazyErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[LazyErrorBoundary]", error, info);
    const msg = String(error?.message || "");
    const isChunkError =
      /Importing a module script failed|Failed to fetch dynamically imported module|Loading chunk \d+ failed|ChunkLoadError/i.test(msg);
    if (isChunkError) {
      const KEY = "lov-chunk-reload";
      const lastReload = Number(sessionStorage.getItem(KEY) || 0);
      if (Date.now() - lastReload > 30_000) {
        sessionStorage.setItem(KEY, String(Date.now()));
        window.location.reload();
      }
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <p className="text-sm text-muted-foreground">Erro ao carregar a página.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded text-xs font-medium uppercase tracking-wider bg-primary text-primary-foreground"
          >
            Recarregar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Eager: Overview (primary screen, always loaded) ──
import Overview from "./pages/Overview";
import OAuthConsent from "./pages/OAuthConsent";

// ── Lazy: Secondary pages (loaded on navigation) ──
const Analytics = lazy(() => import("./pages/Analytics"));
const Assets = lazy(() => import("./pages/Assets"));
const Campaigns = lazy(() => import("./pages/Campaigns"));
const MetaAds = lazy(() => import("./pages/MetaAds"));
const Creatives = lazy(() => import("./pages/Creatives"));
const CentralFinanceira = lazy(() => import("./pages/CentralFinanceira"));
const ProfitAudit = lazy(() => import("./pages/ProfitAudit"));
const Vsls = lazy(() => import("./pages/Vsls"));
const PerformanceVsl = lazy(() => import("./pages/PerformanceVsl"));
const AoVivo = lazy(() => import("./pages/AoVivo"));
const Vendas = lazy(() => import("./pages/Vendas"));
const WarRoomReports = lazy(() => import("./pages/WarRoomReports"));
const NotificacoesPushcut = lazy(() => import("./pages/NotificacoesPushcut"));
const NotificationsPage = lazy(() => import("./pages/Notifications"));
const NotificationUsers = lazy(() => import("./pages/NotificationUsers"));
const Planning = lazy(() => import("./pages/Planning"));
const CashFlow = lazy(() => import("./pages/CashFlow"));
const Reconciliation = lazy(() => import("./pages/Reconciliation"));
const DashboardCOD = lazy(() => import("./pages/DashboardCOD"));
const CODImport = lazy(() => import("./pages/CODImport"));
import { CODAccessGuard } from "./components/guards/CODAccessGuard";
import { AdminOnlyGuard } from "./components/guards/AdminOnlyGuard";
const Offers = lazy(() => import("./pages/Offers"));
const Spy = lazy(() => import("./pages/Spy"));
const SpyOfferDetail = lazy(() => import("./pages/SpyOfferDetail"));
const Pacing = lazy(() => import("./pages/Pacing"));
const PacingRules = lazy(() => import("./pages/PacingRules"));
const PacingBudgetGroups = lazy(() => import("./pages/PacingBudgetGroups"));
const PacingCampaign = lazy(() => import("./pages/PacingCampaign"));
const PacingHistory = lazy(() => import("./pages/PacingHistory"));
const PacingDailyReport = lazy(() => import("./pages/PacingDailyReport"));
const PacingSettings = lazy(() => import("./pages/PacingSettings"));
const PacingScoreRules = lazy(() => import("./pages/PacingScoreRules"));
const PacingTagAudit = lazy(() => import("./pages/PacingTagAudit"));
const PacingAdsets = lazy(() => import("./pages/PacingAdsets"));
const PacingHierarchy = lazy(() => import("./pages/PacingHierarchy"));
const McpTest = lazy(() => import("./pages/McpTest"));
const Connect = lazy(() => import("./pages/Connect"));
const McpConsent = lazy(() => import("./pages/McpConsent"));

const GtxMetaIA = lazy(() => import("./pages/GtxMetaIA"));
const Jarvis = lazy(() => import("./pages/Jarvis"));
const Academy = lazy(() => import("./pages/Academy"));
const TalentBank = lazy(() => import("./pages/TalentBank"));

const Integrations = lazy(() => import("./pages/Integrations"));
const MediaChannels = lazy(() => import("./pages/MediaChannels"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const Profile = lazy(() => import("./pages/Profile"));
const SuperAdmin = lazy(() => import("./pages/SuperAdmin"));
const DashboardConsolidado = lazy(() => import("./pages/DashboardConsolidado"));
const OperationDetail = lazy(() => import("./pages/OperationDetail"));
const SystemHealth = lazy(() => import("./pages/SystemHealth"));
const AuditTokens = lazy(() => import("./pages/AuditTokens"));
const Login = lazy(() => import("./pages/Login"));
const SelectOperation = lazy(() => import("./pages/SelectOperation"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const NotFound = lazy(() => import("./pages/NotFound"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfUse = lazy(() => import("./pages/TermsOfUse"));
const Careers = lazy(() => import("./pages/Careers"));
const Pricing = lazy(() => import("./pages/Pricing"));

// ── Suspense fallback ──
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,       // 10s — reduce redundant fetches
      gcTime: 5 * 60_000,     // 5 min cache retention
      refetchOnWindowFocus: false, // Avoid mobile tab-switch storms
      retry: 1,                // Reduce retry overhead
    },
  },
});

function FeatureGate({ feature, children }: { feature: OperationFeature; children: ReactNode }) {
  const { isFeatureEnabled } = useOperation();
  if (!isFeatureEnabled(feature)) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="text-4xl">🚧</div>
        <p className="text-sm font-medium text-foreground">Funcionalidade em desenvolvimento</p>
        <p className="text-xs text-muted-foreground">Esta aba estará disponível em breve para sua operação.</p>
      </div>
    );
  }
  return <>{children}</>;
}

function AppRoutes() {
  const location = useLocation();

  return (
    <LazyErrorBoundary key={location.pathname}>
      <Suspense fallback={<PageLoader />}>
        <PageTransition>
          <Routes>
            <Route path="/" element={<FeatureGate feature="dashboard"><Overview /></FeatureGate>} />
            <Route path="/dashboard/consolidado" element={<DashboardConsolidado />} />
            <Route path="/dashboard/consolidado/operacao/:opId" element={<OperationDetail />} />
            <Route path="/dashboard/cod" element={<CODAccessGuard><DashboardCOD /></CODAccessGuard>} />
            <Route path="/dashboard-cod/import" element={<CODAccessGuard><AdminOnlyGuard><CODImport /></AdminOnlyGuard></CODAccessGuard>} />
            <Route path="/dashboard/cod/import" element={<CODAccessGuard><AdminOnlyGuard><CODImport /></AdminOnlyGuard></CODAccessGuard>} />
            <Route path="/analytics" element={<FeatureGate feature="analytics"><Analytics /></FeatureGate>} />
            <Route path="/campaigns" element={<FeatureGate feature="campaigns"><Campaigns /></FeatureGate>} />
            <Route path="/offers" element={<Offers />} />
            <Route path="/spy" element={<Spy />} />
            <Route path="/spy/:offerId" element={<SpyOfferDetail />} />
            <Route path="/pacing" element={<FeatureGate feature="pacing_controller"><Pacing /></FeatureGate>} />
            <Route path="/pacing/regras" element={<FeatureGate feature="pacing_controller"><PacingRules /></FeatureGate>} />
            <Route path="/pacing/budget-groups" element={<FeatureGate feature="pacing_controller"><PacingBudgetGroups /></FeatureGate>} />
            <Route path="/pacing/campanha/:id" element={<FeatureGate feature="pacing_controller"><PacingCampaign /></FeatureGate>} />
            <Route path="/pacing/historico" element={<FeatureGate feature="pacing_controller"><PacingHistory /></FeatureGate>} />
            <Route path="/pacing/relatorio" element={<FeatureGate feature="pacing_controller"><PacingDailyReport /></FeatureGate>} />
            <Route path="/pacing/settings" element={<FeatureGate feature="pacing_controller"><PacingSettings /></FeatureGate>} />

            <Route path="/pacing/score-rules" element={<FeatureGate feature="pacing_controller"><PacingScoreRules /></FeatureGate>} />
            <Route path="/pacing/tag-audit" element={<FeatureGate feature="pacing_controller"><PacingTagAudit /></FeatureGate>} />
            <Route path="/pacing/adsets" element={<FeatureGate feature="pacing_controller"><PacingAdsets /></FeatureGate>} />
            <Route path="/pacing/hierarchy" element={<FeatureGate feature="pacing_controller"><PacingHierarchy /></FeatureGate>} />
            <Route path="/assets" element={<FeatureGate feature="contingencia"><Assets /></FeatureGate>} />

            <Route path="/vendas" element={<FeatureGate feature="vendas"><Vendas /></FeatureGate>} />
            <Route path="/war-room" element={<FeatureGate feature="war_room"><WarRoomReports /></FeatureGate>} />
            <Route path="/notificacoes-pushcut" element={<NotificacoesPushcut />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/notification-users" element={<NotificationUsers />} />
            <Route path="/meta-ads" element={<MetaAds />} />
            <Route path="/creatives" element={<FeatureGate feature="creatives"><Creatives /></FeatureGate>} />
            <Route path="/unit-economics" element={<FeatureGate feature="central_financeira"><CentralFinanceira /></FeatureGate>} />
            <Route path="/profit-audit" element={<FeatureGate feature="central_financeira"><ProfitAudit /></FeatureGate>} />
            <Route path="/vsls" element={<FeatureGate feature="vsls"><Vsls /></FeatureGate>} />
            <Route path="/performance-vsl" element={<FeatureGate feature="performance_vsl"><PerformanceVsl /></FeatureGate>} />
            <Route path="/ao-vivo" element={<FeatureGate feature="ao_vivo"><AoVivo /></FeatureGate>} />
            <Route path="/planning" element={<FeatureGate feature="planning"><Planning /></FeatureGate>} />
            <Route path="/cashflow" element={<FeatureGate feature="cashflow"><CashFlow /></FeatureGate>} />
            <Route path="/financial/reconciliation" element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <Reconciliation />
              </ProtectedRoute>
            } />
            <Route path="/gtx-meta-ia" element={<FeatureGate feature="meta_ia"><GtxMetaIA /></FeatureGate>} />
            <Route path="/jarvis" element={<FeatureGate feature="jarvis"><Jarvis /></FeatureGate>} />
            <Route path="/academy" element={<FeatureGate feature="academy"><Academy /></FeatureGate>} />
            <Route path="/talent-bank" element={<FeatureGate feature="talent_bank"><TalentBank /></FeatureGate>} />
            <Route path="/media-channels" element={<MediaChannels />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/super-admin" element={<SuperAdmin />} />
            <Route path="/super-admin/system-health" element={<SystemHealth />} />
            <Route path="/super-admin/audit-tokens" element={<AuditTokens />} />
            
            <Route path="/integrations" element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <Integrations />
              </ProtectedRoute>
            } />
            <Route path="/admin/users" element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <AdminUsers />
              </ProtectedRoute>
            } />
            <Route path="/mcp-test" element={<McpTest />} />
            <Route path="/mcp-consent" element={<McpConsent />} />
            <Route path="/connect" element={<Connect />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </PageTransition>
      </Suspense>
    </LazyErrorBoundary>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <OperationProvider>
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
              <Route path="/login" element={<Login />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<TermsOfUse />} />
              <Route path="/careers/:slug" element={<Careers />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/onboarding" element={
                <ProtectedRoute skipOnboardingCheck>
                  <Onboarding />
                </ProtectedRoute>
              } />
              <Route path="/select-operation" element={
                <ProtectedRoute skipOnboardingCheck>
                  <SelectOperation />
                </ProtectedRoute>
              } />

              <Route path="/*" element={
                <ProtectedRoute>
                  <DashboardLayout>
                    <AppRoutes />
                  </DashboardLayout>
                </ProtectedRoute>
              } />
            </Routes>
          </Suspense>
        </BrowserRouter>
        </OperationProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
