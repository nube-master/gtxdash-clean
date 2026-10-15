import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate, useSearchParams } from "react-router-dom";
import { Loader2, Eye, EyeOff, TrendingUp, TrendingDown, Clock, ShieldCheck, Zap, BarChart3, Wallet, Users } from "lucide-react";
import { useCountUp } from "@/hooks/useCountUp";
import brandTile from "@/assets/brand/traffic-os-tile.svg.asset.json";

/* ── Animated live metric with count-up ── */
function AnimatedMetric({ label, target, suffix, prefix = "", trend, chartData }: { label: string; target: number; suffix?: string; prefix?: string; trend?: "up" | "down"; chartData: number[] }) {
  const value = useCountUp(target, 2000);
  const display = suffix === "x" ? value.toFixed(1) : suffix === "k" ? (value / 1000).toFixed(1) : Math.round(value).toString();
  
  return (
    <div className="flex flex-col gap-2 p-4 rounded-xl border border-white/5 bg-white/[0.02] min-w-[140px]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-mono tracking-[0.15em] uppercase text-muted-foreground/60">{label}</span>
        {trend && (
          <div className="flex items-center gap-0.5">
            {trend === "up" ? <TrendingUp className="h-2.5 w-2.5 text-[#24D67E]" /> : <TrendingDown className="h-2.5 w-2.5 text-[#F2354A]" />}
            <span className={`text-[9px] font-bold ${trend === "up" ? "text-[#24D67E]" : "text-[#F2354A]"}`}>
              {trend === "up" ? "+142%" : "-8%"}
            </span>
          </div>
        )}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-black font-sora tracking-tight text-white">{prefix}{display}{suffix}</span>
      </div>
      {/* Simple Mini Chart Bars */}
      <div className="flex items-end gap-[2px] h-6 mt-1">
        {chartData.map((v, i) => (
          <div 
            key={i} 
            className="flex-1 rounded-sm bg-white/10" 
            style={{ height: `${v}%`, opacity: 0.2 + (v / 100) * 0.8 }} 
          />
        ))}
      </div>
    </div>
  );
}

function FeatureCard({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
      <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-primary/10 border border-primary/20">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <span className="text-xs font-medium text-white/70">{text}</span>
    </div>
  );
}

export default function Login() {
  const { user, loading, signIn } = useAuth();
  const [searchParams] = useSearchParams();
  const isUnauthorized = searchParams.get("error") === "unauthorized";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#08080A]">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const rawNext = searchParams.get("next");
  const safeNext = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : null;
  if (user) return <Navigate to={safeNext ?? "/"} replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const { error: err } = await signIn(email, password);
    if (err) {
      setError(err);
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#08080A] text-foreground font-geist selection:bg-primary/30">
      
      {/* LEFT PANEL */}
      <div className="hidden lg:flex flex-1 flex-col relative overflow-hidden border-r border-[#212128] bg-[#08080A]">
        {/* Animated Background Logo & Radar (Fiel ao Cloud Design v11) */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {/* Subtle Outer Glow */}
          <div className="absolute w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px] mix-blend-screen" />
          
          {/* Orbit Line */}
          <div className="absolute w-[452px] h-[452px] rounded-full border border-primary/10 animate-[orbitA_46s_linear_infinite]">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_12px_rgba(255,85,102,0.8)]" />
          </div>

          {/* 3D Central Logo (6-Layer Extrusion from Prompt) */}
          <div className="relative w-[284px] h-[230px] animate-[hover3d_9s_ease-in-out_infinite]">
            {/* Deep Shadow/Glow */}
            <div className="absolute left-1/2 top-[52%] -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-[#D0182E]/30 blur-[30px]" />
            
            {/* 3D Layers (The Extrusion) */}
            {[
              { l: "5%", t: "15%",   c: "#5C0C16" },
              { l: "4%", t: "13.4%", c: "#7A0F1C" },
              { l: "3%", t: "11.8%", c: "#9A1424" },
              { l: "2%", t: "10.2%", c: "#B8182C" },
              { l: "1%", t: "8.6%",  c: "#CE1B31" },
            ].map((s, i) => (
              <div 
                key={i} 
                style={{ 
                  position: "absolute", left: s.l, top: s.t, width: "90%", height: "66%", 
                  background: s.c,
                  clipPath: "polygon(50% 0%, 100% 44%, 100% 76%, 50% 32%, 0% 76%, 0% 44%)" 
                }} 
              />
            ))}
            
            {/* Top Surface */}
            <div 
              style={{ 
                position: "absolute", left: 0, top: "7%", width: "90%", height: "66%", 
                background: "linear-gradient(142deg, #FF7A88 0%, #FF5566 34%, #D0182E 100%)",
                clipPath: "polygon(50% 0%, 100% 44%, 100% 76%, 50% 32%, 0% 76%, 0% 44%)" 
              }} 
            />
            {/* Specular Highlight */}
            <div 
              style={{ 
                position: "absolute", left: 0, top: "7%", width: "90%", height: "66%", 
                background: "linear-gradient(112deg, rgba(255,255,255,0.34) 0%, transparent 42%)",
                clipPath: "polygon(50% 0%, 100% 44%, 100% 76%, 50% 32%, 0% 76%, 0% 44%)" 
              }} 
            />

            {/* Inner Symbol Layers */}
            {[
              { l: "24%", t: "47.5%", c: "#4A0A12" },
              { l: "23%", t: "46%",   c: "#6B0D18" },
              { l: "22%", t: "44.5%", c: "#8C111F" },
            ].map((s, i) => (
              <div 
                key={"b" + i} 
                style={{ 
                  position: "absolute", left: s.l, top: s.t, width: "52%", height: "36%", 
                  background: s.c,
                  clipPath: "polygon(50% 0%, 100% 62%, 100% 100%, 50% 42%, 0% 100%, 0% 62%)" 
                }} 
              />
            ))}
            {/* Inner Symbol Top */}
            <div 
              style={{ 
                position: "absolute", left: "21%", top: "43%", width: "52%", height: "36%", 
                background: "linear-gradient(142deg, #E0344A 0%, #A3121F 100%)",
                clipPath: "polygon(50% 0%, 100% 62%, 100% 100%, 50% 42%, 0% 100%, 0% 62%)" 
              }} 
            />
          </div>
        </div>

        {/* Ambient Gradients Overlays */}
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/10 blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[-5%] right-[-5%] w-[40%] h-[40%] bg-primary/5 blur-[100px] rounded-full mix-blend-screen" />

        
        <div className="relative z-10 flex flex-col h-full p-12 xl:p-16 justify-between">
          {/* Header Logo */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center overflow-hidden">
               <img src={brandTile.url} alt="Traffic OS" className="h-6 w-6 object-contain" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-black tracking-tight font-sora text-white uppercase leading-none">TRAFFIC OS</span>
              <span className="text-[8px] font-bold tracking-[0.3em] text-muted-foreground/50 font-mono uppercase mt-1">OPERATING SYSTEM</span>
            </div>
          </div>

          {/* Main Hero Section */}
          <div className="max-w-xl space-y-12">
            <div className="space-y-6">
              <h1 className="text-6xl xl:text-7xl font-black font-sora tracking-tighter leading-[0.9] text-white">
                Control.<br />
                Optimize.<br />
                <span className="text-primary drop-shadow-[0_0_30px_rgba(242,53,74,0.4)]">Scale.</span>
              </h1>
              <p className="text-lg text-muted-foreground leading-relaxed max-w-md">
                Controle total da sua máquina de tráfego — do criativo ao caixa, num painel só.
              </p>
            </div>

            {/* Feature Grid */}
            <div className="grid grid-cols-2 gap-4">
              <FeatureCard icon={BarChart3} text="Dashboards e KPIs em tempo real" />
              <FeatureCard icon={Zap} text="Regras automáticas de kill e escala" />
              <FeatureCard icon={Wallet} text="Controle financeiro completo" />
              <FeatureCard icon={Users} text="Gestão de contas e contingência" />
            </div>
          </div>

          {/* Metrics & Footer */}
          <div className="space-y-10">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-[#24D67E] animate-pulse" />
                <span className="text-[10px] font-bold tracking-widest text-[#24D67E] uppercase font-mono">OPERAÇÃO AO VIVO</span>
                <span className="ml-auto text-[10px] font-mono text-muted-foreground/40 italic">02:10:14</span>
              </div>
              
              <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none">
                <AnimatedMetric label="FATURAMENTO HOJE" target={16700} prefix="R$ " suffix="k" chartData={[20, 45, 30, 60, 40, 80, 50, 90, 70, 100]} />
                <AnimatedMetric label="LUCRO" target={7300} prefix="R$ " suffix="k" trend="up" chartData={[10, 30, 20, 50, 30, 60, 40, 70, 50, 80]} />
                <AnimatedMetric label="ROAS MÉDIO" target={3.2} suffix="x" trend="up" chartData={[60, 55, 65, 70, 60, 75, 80, 70, 85, 90]} />
                <AnimatedMetric label="VENDAS" target={147} trend="up" chartData={[30, 40, 35, 50, 45, 60, 55, 75, 70, 90]} />
              </div>
            </div>

            <div className="flex items-center justify-between pt-8 border-t border-white/5">
              <span className="text-[10px] font-mono text-muted-foreground/30 uppercase tracking-widest">© 2026 TRAFFIC OS</span>
              <div className="flex items-center gap-6">
                <div className="flex flex-col items-end">
                  <span className="text-[9px] font-mono text-muted-foreground/40">v2.4.1 • 31 contas</span>
                  <span className="text-[9px] font-mono text-[#24D67E]/60 uppercase tracking-tighter">sync há 4s</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom decorative grid lines (from reference) */}
        <div className="absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-primary/5 to-transparent opacity-20 pointer-events-none" 
             style={{ backgroundImage: 'linear-gradient(rgba(255,85,102,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,85,102,0.1) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      </div>

      {/* RIGHT PANEL - Login Form */}
      <div className="w-[468px] flex flex-col items-center justify-center p-8 relative border-l border-[#212128] bg-[#0D0D10]">
        <div className="w-full max-w-[364px] space-y-12">
          
          {/* Header Mobile/Form */}
          <div className="flex flex-col items-center space-y-4 text-center">
             <div className="h-16 w-16 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center shadow-2xl relative group overflow-hidden">
                <div className="absolute inset-0 bg-[#2A1015] border border-[#FF556E]/24" />
                <img src={brandTile.url} alt="Traffic OS" className="h-10 w-10 object-contain relative z-10" />
             </div>
             <div className="space-y-1">
                <h2 className="text-[17px] font-black tracking-tight font-sora text-white uppercase">TRAFFIC OS</h2>
                <p className="text-[8px] font-bold tracking-[0.26em] text-[#7E7E8C] font-mono uppercase">OPERATING SYSTEM</p>
             </div>
             <div className="w-full h-[1px] bg-[#212128] mt-4" />
          </div>

          <div className="space-y-8">
            <div className="space-y-2">
              <h3 className="text-[26px] font-black font-sora text-white tracking-tight">Acessar plataforma</h3>
              <p className="text-[13px] text-[#A5A5B0]">Entre com suas credenciais para abrir o painel da operação.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-[11px] font-medium text-primary animate-in fade-in slide-in-from-top-1">
                  {error}
                </div>
              )}
              {isUnauthorized && (
                <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-[11px] font-medium text-primary">
                  Acesso não autorizado. Conta não cadastrada.
                </div>
              )}

              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[9px] font-black tracking-[0.14em] text-[#7E7E8C] uppercase font-mono px-1">E-mail</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="w-full h-[50px] px-4 bg-[#131318] border border-[#2E2E38] rounded-xl text-sm font-medium focus:outline-none focus:ring-1 focus:ring-[#FF556E]/40 focus:border-[#FF556E]/40 transition-all placeholder:text-[#A5A5B0]/20"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <label className="text-[9px] font-black tracking-[0.14em] text-[#7E7E8C] uppercase font-mono">Senha</label>
                    <button type="button" className="text-[9px] font-bold text-[#FF556E] hover:underline uppercase tracking-wider">Esqueci minha senha</button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full h-[50px] px-4 pr-12 bg-[#131318] border border-[#2E2E38] rounded-xl text-sm font-medium focus:outline-none focus:ring-1 focus:ring-[#FF556E]/40 focus:border-[#FF556E]/40 transition-all placeholder:text-[#A5A5B0]/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground/30 hover:text-white transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 px-1">
                  <button
                    type="button"
                    onClick={() => setRememberMe(!rememberMe)}
                    className={`h-4 w-4 rounded border transition-all flex items-center justify-center ${rememberMe ? 'bg-primary border-primary' : 'bg-white/5 border-white/10'}`}
                  >
                    {rememberMe && <div className="h-2 w-2 bg-white rounded-full" />}
                  </button>
                  <span className="text-[11px] text-muted-foreground font-medium">Manter conectado por 8 horas</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-[52px] bg-gradient-to-r from-[#FF5566] to-[#D0182E] text-white font-black text-[12px] uppercase tracking-[0.1em] rounded-xl hover:brightness-110 active:scale-[0.98] transition-all shadow-xl shadow-primary/20 flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    ENTRAR NA OPERAÇÃO
                    <TrendingUp className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-all translate-x-[-4px] group-hover:translate-x-0" />
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="flex items-center justify-center gap-3 py-4 pt-8 border-t border-[#212128]">
             <div className="h-[2px] w-2 rounded-full bg-[#24D67E]" />
             <span className="text-[9px] font-bold tracking-[0.14em] text-[#7E7E8C] font-mono uppercase">CONEXÃO SEGURA • CRIPTOGRAFADA</span>
          </div>
        </div>
      </div>
    </div>
  );
}

