import { describe, it, expect } from "vitest";
import { computeGtxDecision, type GtxCampaignRow } from "@/hooks/useGtxMetaData";

function makeRow(overrides: Partial<GtxCampaignRow> & {
  phase: GtxCampaignRow["phase"];
  sales3D: number[];
  profit3D: number[];
  spend: number;
  revenue: number;
}): GtxCampaignRow {
  const sales3D = overrides.sales3D;
  const profit3D = overrides.profit3D;
  const spend = overrides.spend;
  const revenue = overrides.revenue;
  const salesConfirmed = overrides.salesConfirmed ?? sales3D.reduce((a, b) => a + b, 0);

  return {
    fullName: "test-campaign",
    displayName: "Test",
    accountId: "acc1",
    accountName: "Account 1",
    accountStatus: 1,
    creativeId: "cr1",
    project: "P1",
    phase: overrides.phase,
    status: "ACTIVE",
    createdDate: "2026-01-01",
    budget: overrides.budget ?? 0,
    spend,
    impressions: 1000,
    cpm: 10,
    ctr: 1,
    clicks: 100,
    cpc: 1,
    ic: 0,
    cpaPaid: overrides.cpaPaid ?? 0,
    purchasesMeta: 0,
    revenue,
    roas: spend > 0 ? revenue / spend : 0,
    profit: revenue - spend,
    roi: spend > 0 ? ((revenue - spend) / spend) * 100 : 0,
    margin: revenue > 0 ? ((revenue - spend) / revenue) * 100 : 0,
    salesConfirmed,
    sales3D,
    profit3D,
    spend3D: overrides.spend3D ?? [spend / 3, spend / 3, spend / 3],
    revenue3D: overrides.revenue3D ?? [revenue / 3, revenue / 3, revenue / 3],
    profit3DTotal: profit3D.reduce((a, b) => a + b, 0),
    spend3DTotal: overrides.spend3DTotal ?? spend,
    revenue3DTotal: overrides.revenue3DTotal ?? revenue,
    roas3D: overrides.roas3D ?? (spend > 0 ? revenue / spend : 0),
    roi3D: overrides.roi3D ?? (spend > 0 ? ((revenue - spend) / spend) : 0),
    margin3D: overrides.margin3D ?? 0,
    cpa3D: overrides.cpa3D ?? 0,
    daysWithSale: sales3D.filter((v) => v > 0).length,
    consistency3D: "",
    scoreGtx: 50,
    decision3D: null,
    gtxDecision: null,
    gtxReason: null,
    gtxAction: null,
    scaleOpportunity: false,
    painIndex: 0,
    painLevel: "saudável" as const,
    ...overrides,
  };
}

describe("GTX Decision Engine v2 — Método Operacional", () => {

  describe("TESTE CRIATIVO", () => {
    it("≥2 vendas + ROI positivo → PROMOVER", () => {
      const row = makeRow({
        phase: "TESTE",
        sales3D: [2, 0, 0],
        profit3D: [50, -20, -20],
        spend: 200,
        revenue: 300,
      });
      expect(computeGtxDecision(row).decision).toBe("PROMOVER");
    });

    it("2 vendas em 48h → PROMOVER", () => {
      const row = makeRow({
        phase: "TESTE",
        sales3D: [1, 1, 0],
        profit3D: [30, 30, -20],
        spend: 140,
        revenue: 200,
      });
      expect(computeGtxDecision(row).decision).toBe("PROMOVER");
    });

    it("1 venda isolada → OBSERVAR", () => {
      const row = makeRow({
        phase: "TESTE",
        sales3D: [0, 0, 1],
        profit3D: [-20, -20, 30],
        spend: 80,
        revenue: 100,
      });
      expect(computeGtxDecision(row).decision).toBe("OBSERVAR");
    });

    it("0 vendas + gasto ≥ CPA → CORTAR", () => {
      const row = makeRow({
        phase: "TESTE",
        sales3D: [0, 0, 0],
        profit3D: [-70, -70, -60],
        spend: 200,
        revenue: 0,
        salesConfirmed: 0,
        cpaPaid: 150,
      });
      expect(computeGtxDecision(row).decision).toBe("CORTAR");
    });

    it("Nunca ESCALAR em TESTE", () => {
      const row = makeRow({
        phase: "TESTE",
        sales3D: [5, 5, 5],
        profit3D: [500, 500, 500],
        spend: 100,
        revenue: 1500,
      });
      expect(computeGtxDecision(row).decision).not.toBe("ESCALAR");
    });
  });

  describe("PRÉ-ESCALA", () => {
    it("≥2 vendas + ROI ≥ 1.50 → PROMOVER", () => {
      const row = makeRow({
        phase: "PRÉ ESCALA",
        sales3D: [1, 1, 1],
        profit3D: [300, 300, 300],
        spend: 1000,
        revenue: 2600, // ROI = 1.6
      });
      expect(computeGtxDecision(row).decision).toBe("PROMOVER");
    });

    it("0 vendas + gasto → CORTAR", () => {
      const row = makeRow({
        phase: "PRÉ ESCALA",
        sales3D: [0, 0, 0],
        profit3D: [-400, -200, -100],
        spend: 2000,
        revenue: 0,
        salesConfirmed: 0,
      });
      expect(computeGtxDecision(row).decision).toBe("CORTAR");
    });

    it("Vendendo mas sem constância → OBSERVAR", () => {
      const row = makeRow({
        phase: "PRÉ ESCALA",
        sales3D: [1, 0, 1],
        profit3D: [50, -50, 0],
        spend: 1000,
        revenue: 1100,
      });
      expect(computeGtxDecision(row).decision).toBe("OBSERVAR");
    });

    it("Nunca cortar com venda hoje", () => {
      const row = makeRow({
        phase: "PRÉ ESCALA",
        sales3D: [1, 0, 0],
        profit3D: [-30, -40, -30],
        spend: 1000,
        revenue: 700,
      });
      expect(computeGtxDecision(row).decision).not.toBe("CORTAR");
    });
  });

  describe("ESCALA", () => {
    it("ROI ≥ 1.30 + 2+ dias lucrativos → ESCALAR", () => {
      const row = makeRow({
        phase: "ESCALA",
        sales3D: [3, 2, 1],
        profit3D: [1500, 1000, 500],
        spend: 5000,
        revenue: 5000 * 2.5, // ROI = 1.5
      });
      expect(computeGtxDecision(row).decision).toBe("ESCALAR");
    });

    it("ROI positivo + vendas constantes → MANTER", () => {
      const row = makeRow({
        phase: "ESCALA",
        sales3D: [2, 2, 2],
        profit3D: [500, 500, 500],
        spend: 5000,
        revenue: 5000 * 1.30, // ROI = 0.30
      });
      expect(computeGtxDecision(row).decision).toBe("MANTER");
    });

    it("2 dias seguidos sem venda → CORTAR", () => {
      const row = makeRow({
        phase: "ESCALA",
        sales3D: [0, 0, 2],
        profit3D: [-300, -200, 500],
        spend: 5000,
        revenue: 5000 * 0.88,
        salesConfirmed: 2,
      });
      expect(computeGtxDecision(row).decision).toBe("CORTAR");
    });

    it("Vendas oscilando → OBSERVAR", () => {
      const row = makeRow({
        phase: "ESCALA",
        sales3D: [1, 0, 1],
        profit3D: [100, -200, 100],
        spend: 3000,
        revenue: 3000 * 0.9, // ROI negativo but has sales
      });
      expect(computeGtxDecision(row).decision).toBe("OBSERVAR");
    });

    it("Dados incompletos → OBSERVAR", () => {
      const row = makeRow({
        phase: "ESCALA",
        sales3D: [0, 0, 0],
        profit3D: [0, 0, 0],
        spend: 0,
        revenue: 0,
        salesConfirmed: 0,
      });
      expect(computeGtxDecision(row).decision).toBe("OBSERVAR");
    });
  });
});
