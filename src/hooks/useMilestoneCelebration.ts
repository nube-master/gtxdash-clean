import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Canvas-based confetti celebration.
 * Call `fire()` to trigger a burst of confetti particles.
 */
export function useConfetti() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999";
    document.body.appendChild(canvas);
    canvasRef.current = canvas;
    return () => {
      document.body.removeChild(canvas);
    };
  }, []);

  const fire = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ["#FF1E1E", "#00FF88", "#FFD700", "#FF6B6B", "#4ECDC4", "#FF1E1E", "#FFA500"];
    const particles: Array<{
      x: number; y: number; vx: number; vy: number;
      w: number; h: number; color: string; rotation: number; rotSpeed: number;
      life: number; gravity: number; drag: number;
    }> = [];

    // Create particles from center-top
    for (let i = 0; i < 120; i++) {
      const angle = (Math.random() * Math.PI * 2);
      const speed = 4 + Math.random() * 8;
      particles.push({
        x: canvas.width / 2,
        y: canvas.height * 0.3,
        vx: Math.cos(angle) * speed * (0.5 + Math.random()),
        vy: Math.sin(angle) * speed * (0.5 + Math.random()) - 4,
        w: 4 + Math.random() * 6,
        h: 3 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.3,
        life: 1,
        gravity: 0.12 + Math.random() * 0.05,
        drag: 0.98 + Math.random() * 0.015,
      });
    }

    let animId: number;
    function animate() {
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
      let alive = false;

      for (const p of particles) {
        if (p.life <= 0) continue;
        alive = true;

        p.vy += p.gravity;
        p.vx *= p.drag;
        p.vy *= p.drag;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotSpeed;
        p.life -= 0.008;

        ctx!.save();
        ctx!.translate(p.x, p.y);
        ctx!.rotate(p.rotation);
        ctx!.globalAlpha = Math.max(0, p.life);
        ctx!.fillStyle = p.color;
        ctx!.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx!.restore();
      }

      if (alive) {
        animId = requestAnimationFrame(animate);
      } else {
        ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
      }
    }

    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, []);

  return { fire };
}

/**
 * Milestone celebration hook.
 * Watches sales count and triggers confetti at milestones.
 */
export function useMilestoneCelebration(salesCount: number, revenue: number) {
  const { fire } = useConfetti();
  const celebrated = useRef<Set<string>>(new Set());

  useEffect(() => {
    const milestones = [
      { key: "sales-5", check: salesCount >= 5, label: "5 vendas no dia! 🎯" },
      { key: "sales-10", check: salesCount >= 10, label: "10 vendas no dia! 🔥" },
      { key: "sales-20", check: salesCount >= 20, label: "20 vendas! Dia épico! 🚀" },
      { key: "sales-50", check: salesCount >= 50, label: "50 vendas! LENDÁRIO! 💎" },
      { key: "rev-10k", check: revenue >= 10_000, label: "R$10K faturados! 💰" },
      { key: "rev-50k", check: revenue >= 50_000, label: "R$50K faturados! 🏆" },
      { key: "rev-100k", check: revenue >= 100_000, label: "R$100K no dia! 👑" },
    ];

    for (const m of milestones) {
      if (m.check && !celebrated.current.has(m.key)) {
        celebrated.current.add(m.key);
        // Store in session so we don't re-celebrate on refresh
        const stored = sessionStorage.getItem("wr-celebrated") || "";
        if (!stored.includes(m.key)) {
          sessionStorage.setItem("wr-celebrated", stored + "," + m.key);
          fire();
          // We import toast dynamically to avoid circular deps
          import("sonner").then(({ toast }) => {
            toast.success(m.label, {
              duration: 5000,
              style: { background: "hsl(220 14% 7%)", border: "1px solid hsl(1 100% 45% / 0.3)", color: "hsl(220 10% 92%)" },
            });
          });
        } else {
          celebrated.current.add(m.key);
        }
      }
    }
  }, [salesCount, revenue, fire]);
}
