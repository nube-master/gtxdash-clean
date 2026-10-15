import { describe, expect, it } from "vitest";

import {
  extractProjectCodeFromNaming,
  resolveProjectCodeWithFallback,
  toCreativeCompositeKey,
} from "@/lib/projectUtils";
import { resolveCreativeId } from "@/lib/creativeUtils";

describe("resolveProjectCodeWithFallback", () => {
  it("falls back to campaign project when ad name has no project tag", () => {
    const projectCode = resolveProjectCodeWithFallback(
      "[IMG21] [SP.SP]",
      "[BMGTX-C/A05] [IMG21] [SP] [NDR] [CONVERSÃO] [VENDAS]",
    );

    expect(projectCode).toBe("NDR");
  });

  it("keeps the ad project when the ad name is explicitly tagged", () => {
    const projectCode = resolveProjectCodeWithFallback(
      "[IMG21] [NDR] [SP.SP]",
      "[BMGTX-C/A05] [IMG21] [SP] [NDM] [CONVERSÃO] [VENDAS]",
    );

    expect(projectCode).toBe("NDR");
  });

  it("builds the same composite key for traffic and sales when only the campaign carries the project tag", () => {
    const creativeId = "IMG21-SP";
    const trafficKey = toCreativeCompositeKey(
      creativeId,
      resolveProjectCodeWithFallback(
        "[IMG21] [SP.SP]",
        "[BMGTX-C/A05] [IMG21] [SP] [NDR] [CONVERSÃO] [VENDAS]",
      ),
    );
    const salesKey = toCreativeCompositeKey(
      creativeId,
      extractProjectCodeFromNaming(
        "[BMGTX-C/A05] [IMG21] [SP] [NDR] [CONVERSÃO] [VENDAS]",
      ),
    );

    expect(trafficKey).toBe(salesKey);
    expect(trafficKey).toBe("IMG21-SP::NDR");
  });

  it("keeps creative attribution anchored to the campaign second bracket, not the ad name", () => {
    const creativeId = resolveCreativeId(
      "[BMHAVEN-C/03] [H02B31-TOM] [DD] [JD] [CONVERSÃO] [VENDAS]",
    );

    expect(creativeId).toBe("H02B31-TOM");
  });

  it("resolves headline variations as full creative IDs, not bare suffixes", () => {
    expect(resolveCreativeId("[BMGTX-C/A05] [HV1] [MMP] [H01B14] [CONVERSÃO] [VENDAS]")).toBe(
      "H01B14-HV01",
    );
    expect(resolveCreativeId("[BMGTX-C/A05] [HV2] [MMP] [H01B14] [CONVERSÃO] [VENDAS]")).toBe(
      "H01B14-HV02",
    );
  });
});