import { describe, expect, it } from "vitest";

import { detectTeamFromCampaign } from "@/lib/creativeUtils";

describe("detectTeamFromCampaign", () => {
  it("prioritizes the ad nomenclature for H02B31-TOM over unrelated IMG campaigns", () => {
    const result = detectTeamFromCampaign(
      new Set([
        "[BMHAVEN-C/03] [H02B31-TOM] [DD] [JD] [CONVERSÃO] [VENDAS]",
      ]),
      new Set(["[H02B31-TOM] [NDM] [DD.JD]"]),
      "H02B31-TOM",
    );

    expect(result).toEqual({ copyWriter: "Dan", editor: "João" });
  });

  it("keeps IMG creatives attributed to Peres when the creative itself is IMG with [SP] tags", () => {
    const result = detectTeamFromCampaign(
      new Set(["[BMGTX-C/A-DB-01] [IMG14] [NDM] [SP.SP] [CONVERSÃO] [VENDAS]"]),
      new Set(["[IMG14] [NDM] [SP.SP]"]),
      "IMG14-SP",
    );

    expect(result).toEqual({ copyWriter: "Peres", editor: "Peres" });
  });

  it("attributes IMG creatives with [VK] tag to Vitor for both copy and editor", () => {
    const result = detectTeamFromCampaign(
      new Set(["[BMGTX-C/A-PROSC/20] [IMG01] [NDM] [VK] [CONVERSÃO] [VENDAS]"]),
      new Set(["[IMG01] [NDM] [VK]"]),
      "IMG01-VK",
    );

    expect(result).toEqual({ copyWriter: "Vitor", editor: "Vitor" });
  });

  it("attributes IMG creatives with [JD] tag to João for both copy and editor", () => {
    const result = detectTeamFromCampaign(
      new Set(["[BMGTX-C/A-DB-01] [IMG14] [NDM] [JD] [CONVERSÃO] [VENDAS]"]),
      new Set(["[IMG14] [NDM] [JD]"]),
      "IMG14-JD",
    );

    expect(result).toEqual({ copyWriter: "João", editor: "João" });
  });

  it("separates IMG14-SP and IMG14-JD as different creatives/authors", () => {
    // IMG14 with SP tags → Peres
    const sp = detectTeamFromCampaign(
      new Set(["[BMGTX-C/A-DB-01] [IMG14] [NDM] [SP.SP] [CONVERSÃO] [VENDAS]"]),
      new Set(["[IMG14] [NDM] [SP.SP]"]),
      "IMG14-SP",
    );
    expect(sp).toEqual({ copyWriter: "Peres", editor: "Peres" });

    // IMG14 with JD tags → João
    const jd = detectTeamFromCampaign(
      new Set(["[BMGTX-C/A-DB-01] [IMG14] [NDM] [JD] [CONVERSÃO] [VENDAS]"]),
      new Set(["[IMG14] [NDM] [JD]"]),
      "IMG14-JD",
    );
    expect(jd).toEqual({ copyWriter: "João", editor: "João" });
  });

  it("attributes IMG creatives with [IAN] tag to Ian for both roles", () => {
    const result = detectTeamFromCampaign(
      new Set(["[BMGTX-C/A05] [IMG07] [IAN] [NDM] [CONVERSÃO] [VENDAS]"]),
      new Set(["[IMG07] [NDM] [IAN]"]),
      "IMG07-IAN",
    );

    expect(result).toEqual({ copyWriter: "Ian", editor: "Ian" });
  });

  it("attributes creatives with [GV] tag to Gabriel Vidal as copy", () => {
    const result = detectTeamFromCampaign(
      new Set(["[BMGTX-C/A05] [IMG07] [GV] [NDM] [CONVERSÃO] [VENDAS]"]),
      new Set(["[IMG07] [NDM] [GV]"]),
      "IMG07-GV",
    );

    expect(result).toEqual({ copyWriter: "Gabriel Vidal", editor: null });
  });

  it("attributes creatives with [ENZ] tag to Enzo as editor", () => {
    const result = detectTeamFromCampaign(
      new Set(["[BMGTX-C/A05] [IMG07] [ENZ] [NDM] [CONVERSÃO] [VENDAS]"]),
      new Set(["[IMG07] [NDM] [ENZ]"]),
      "IMG07-ENZ",
    );

    expect(result).toEqual({ copyWriter: null, editor: "Enzo" });
  });
});
