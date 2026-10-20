import { describe, expect, it } from "vitest";
import { createDealerContext } from "@/server/data/context";
import {
  DealerReadOnlyError,
  ForbiddenError,
  NotAuthenticatedError,
  dealerRoleSatisfies,
  requireBackofficeRole,
  requireDealerRole,
} from "./permissions";

describe("dealerRoleSatisfies", () => {
  it("treats owner ⊇ manager ⊇ salesperson", () => {
    expect(dealerRoleSatisfies("owner", ["manager"])).toBe(true);
    expect(dealerRoleSatisfies("owner", ["salesperson"])).toBe(true);
    expect(dealerRoleSatisfies("manager", ["manager"])).toBe(true);
    expect(dealerRoleSatisfies("manager", ["salesperson"])).toBe(true);
    expect(dealerRoleSatisfies("salesperson", ["manager"])).toBe(false);
    expect(dealerRoleSatisfies("manager", ["owner"])).toBe(false);
    expect(dealerRoleSatisfies("salesperson", ["owner", "salesperson"])).toBe(true);
    expect(dealerRoleSatisfies("owner", [])).toBe(false);
  });
});

describe("role guards without sessions", () => {
  const ctx = createDealerContext({ id: "00000000-0000-0000-0000-000000000001", slug: "demo", status: "active" });

  it("requireDealerRole rejects with NotAuthenticatedError", async () => {
    await expect(requireDealerRole(ctx, ["owner"])).rejects.toBeInstanceOf(NotAuthenticatedError);
  });

  it("requireBackofficeRole rejects with NotAuthenticatedError", async () => {
    await expect(requireBackofficeRole(["superadmin"])).rejects.toBeInstanceOf(NotAuthenticatedError);
  });

  it("exposes distinct named error classes", () => {
    expect(new ForbiddenError().name).toBe("ForbiddenError");
    expect(new DealerReadOnlyError()).toBeInstanceOf(Error);
    expect(new DealerReadOnlyError()).not.toBeInstanceOf(ForbiddenError);
  });
});
