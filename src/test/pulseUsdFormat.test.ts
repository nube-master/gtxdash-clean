import { describe, expect, it } from "vitest";
import { compactUsdBody, formatNativeUsd, isRenderedUsdPulse } from "../../supabase/functions/_shared/pulse-usd-format";

describe("native USD hourly report", () => {
  it("formats native amounts without conversion", () => {
    expect(formatNativeUsd(294)).toBe("294.00");
    expect(formatNativeUsd(67.3264)).toBe("67.33");
    expect(formatNativeUsd(294 - 67.3264)).toBe("226.67");
  });
  it("removes BRL labels and blank lines", () => {
    expect(compactUsdBody("Faturamento: R$ 294.00\n\nInvestido: $ 67.33\n\nUSD · RedTrack"))
      .toBe("Faturamento: $294.00\nInvestido: $67.33\nUSD · RedTrack");
  });
  it("preserves rendered content only for explicitly native USD pulses", () => {
    expect(isRenderedUsdPulse("pulse_1h", { report_currency: "USD", report_source: "redtrack" })).toBe(true);
    expect(isRenderedUsdPulse("pulse_1h", { report_currency: "BRL", report_source: "redtrack" })).toBe(false);
    expect(isRenderedUsdPulse("pulse_1h", null)).toBe(false);
    expect(isRenderedUsdPulse("sale_approved", { report_currency: "USD", report_source: "redtrack" })).toBe(false);
  });
});