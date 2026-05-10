import { describe, expect, it } from "vitest";
import { resolveEnterpriseRelationshipTypes } from "./types/agent.js";

describe("enterprise relationship types", () => {
  it("keeps legacy live relationship keys visible after upstream relationship taxonomy updates", () => {
    const types = resolveEnterpriseRelationshipTypes();
    const keys = new Set(types.map((type) => type.key));

    expect(keys.has("budgetFundedBy")).toBe(true);
    expect(keys.has("mustInform")).toBe(true);
    expect(keys.has("statusReportedTo")).toBe(true);
  });
});
