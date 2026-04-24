import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { assertCompanyAccess } from "../routes/authz.js";

function requestWithActor(actor: Record<string, unknown>, method = "GET") {
  return {
    method,
    actor,
  } as unknown as Request;
}

describe("assertCompanyAccess", () => {
  it("allows instance admins without per-company memberships", () => {
    const req = requestWithActor({
      type: "board",
      source: "session",
      userId: "admin-user",
      isInstanceAdmin: true,
      companyIds: [],
      memberships: [],
    });

    expect(() => assertCompanyAccess(req, "company-1")).not.toThrow();
  });

  it("still requires company access for non-admin board users", () => {
    const req = requestWithActor({
      type: "board",
      source: "session",
      userId: "member-user",
      isInstanceAdmin: false,
      companyIds: [],
      memberships: [],
    });

    expect(() => assertCompanyAccess(req, "company-1")).toThrow(
      "User does not have access to this company",
    );
  });
});
