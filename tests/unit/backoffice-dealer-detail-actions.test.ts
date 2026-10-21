import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/server/auth/permissions";

const mocks = vi.hoisted(() => ({
  updateDealer: vi.fn(),
  changeDealerSlug: vi.fn(),
  setDealerStatus: vi.fn(),
  extendLicence: vi.fn(),
  recordDpaSigned: vi.fn(),
  resendOwnerInvitation: vi.fn(),
  requireBackofficeUser: vi.fn(),
  headers: new Headers({ "x-drivebook-base-path": "/_dev/admin" }),
}));

vi.mock("@/server/data/backoffice/dealers", () => ({
  createDealer: vi.fn(),
  updateDealer: mocks.updateDealer,
  changeDealerSlug: mocks.changeDealerSlug,
  setDealerStatus: mocks.setDealerStatus,
  extendLicence: mocks.extendLicence,
  recordDpaSigned: mocks.recordDpaSigned,
  resendOwnerInvitation: mocks.resendOwnerInvitation,
}));
vi.mock("next/headers", () => ({ headers: async () => mocks.headers }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
}));
vi.mock("@/server/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth/permissions")>()),
  requireBackofficeUser: mocks.requireBackofficeUser,
}));

const actions = await import("@/app/backoffice/(app)/dealers/actions");

const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
};

async function redirectOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    return (error as { url?: string }).url;
  }
  return undefined;
}

const detail = (change: string) =>
  new RegExp(`^${["", "_dev", "admin", "dealers", "d-1"].join("/")}\\?saved=${change}&t=[a-z0-9]+$`);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireBackofficeUser.mockResolvedValue({ user: { id: "bo", email: "a@drivebook.si", role: "superadmin" }, sessionId: "s" });
  for (const fn of [
    mocks.updateDealer,
    mocks.changeDealerSlug,
    mocks.setDealerStatus,
    mocks.extendLicence,
    mocks.recordDpaSigned,
    mocks.resendOwnerInvitation,
  ]) {
    fn.mockResolvedValue({ ok: true });
  }
});

describe("action → service mapping", () => {
  it("updateDealerAction passes name, planId and notes", async () => {
    const values = { name: "Avto Novak", planId: "p2", notes: "VIP" };
    expect(await redirectOf(actions.updateDealerAction("d-1", {}, form(values)))).toMatch(detail("profile"));
    expect(mocks.updateDealer).toHaveBeenCalledWith("d-1", values);
  });

  it("changeDealerSlugAction passes the slug", async () => {
    expect(await redirectOf(actions.changeDealerSlugAction("d-1", {}, form({ slug: "novak-2" })))).toMatch(detail("slug"));
    expect(mocks.changeDealerSlug).toHaveBeenCalledWith("d-1", "novak-2");
  });

  it.each(["suspended", "active"] as const)("setDealerStatusAction passes status %s", async (status) => {
    expect(await redirectOf(actions.setDealerStatusAction("d-1", {}, form({ status })))).toMatch(detail("status"));
    expect(mocks.setDealerStatus).toHaveBeenCalledWith("d-1", status);
  });

  it("setDealerStatusAction rejects an unknown status without calling the service", async () => {
    expect(await actions.setDealerStatusAction("d-1", {}, form({ status: "read_only" }))).toEqual({
      values: { status: "read_only" },
      field: "status",
      error: "invalid",
    });
    expect(mocks.setDealerStatus).not.toHaveBeenCalled();
  });

  it("extendLicenceAction passes validUntil and note", async () => {
    const values = { validUntil: "2028-01-31", note: "račun 2026-114" };
    expect(await redirectOf(actions.extendLicenceAction("d-1", {}, form(values)))).toMatch(detail("licence"));
    expect(mocks.extendLicence).toHaveBeenCalledWith("d-1", values);
  });

  it("two saves of the same kind redirect to different URLs so the form remounts", async () => {
    const values = { validUntil: "2028-01-31", note: "račun" };
    const first = await redirectOf(actions.extendLicenceAction("d-1", {}, form(values)));
    const second = await redirectOf(actions.extendLicenceAction("d-1", {}, form(values)));
    expect(first).not.toBe(second);
  });

  it("recordDpaSignedAction passes signedAt", async () => {
    expect(await redirectOf(actions.recordDpaSignedAction("d-1", {}, form({ signedAt: "2026-10-01" })))).toMatch(detail("dpa"));
    expect(mocks.recordDpaSigned).toHaveBeenCalledWith("d-1", { signedAt: "2026-10-01" });
  });

  it("resendOwnerInvitationAction resends for the dealer", async () => {
    expect(await redirectOf(actions.resendOwnerInvitationAction("d-1", {}, form({})))).toMatch(detail("invite"));
    expect(mocks.resendOwnerInvitation).toHaveBeenCalledWith("d-1");
  });
});

describe("rejections", () => {
  it.each(["format", "length", "reserved", "taken"])("returns the slug/%s error with the entered value", async (error) => {
    mocks.changeDealerSlug.mockResolvedValue({ ok: false, field: "slug", error });
    expect(await actions.changeDealerSlugAction("d-1", {}, form({ slug: "Bad!" }))).toEqual({
      values: { slug: "Bad!" },
      field: "slug",
      error,
    });
  });

  it("returns field errors from the licence service", async () => {
    mocks.extendLicence.mockResolvedValue({ ok: false, field: "note", error: "required" });
    expect(await actions.extendLicenceAction("d-1", {}, form({ validUntil: "2028-01-31", note: "" }))).toEqual({
      values: { validUntil: "2028-01-31", note: "" },
      field: "note",
      error: "required",
    });
  });

  it("returns non-field errors without a field", async () => {
    mocks.resendOwnerInvitation.mockResolvedValue({ ok: false, error: "rateLimited" });
    expect(await actions.resendOwnerInvitationAction("d-1", {}, form({}))).toEqual({ values: {}, field: undefined, error: "rateLimited" });
  });
});

describe("forbidden handling", () => {
  const cases = [
    ["updateDealerAction", mocks.updateDealer, { name: "X", planId: "p", notes: "" }],
    ["changeDealerSlugAction", mocks.changeDealerSlug, { slug: "novak" }],
    ["setDealerStatusAction", mocks.setDealerStatus, { status: "suspended" }],
    ["extendLicenceAction", mocks.extendLicence, { validUntil: "2028-01-31", note: "n" }],
    ["recordDpaSignedAction", mocks.recordDpaSigned, { signedAt: "2026-10-01" }],
    ["resendOwnerInvitationAction", mocks.resendOwnerInvitation, {}],
  ] as const;

  it.each(cases)("%s refuses Support with a forbidden state", async (name, service, values) => {
    mocks.requireBackofficeUser.mockResolvedValue({ user: { id: "bo", email: "s@drivebook.si", role: "support" }, sessionId: "s" });
    service.mockRejectedValue(new ForbiddenError());
    expect(await actions[name]("d-1", {}, form(values))).toEqual({ values, error: "forbidden" });
  });

  it("rethrows unexpected errors", async () => {
    mocks.updateDealer.mockRejectedValue(new Error("boom"));
    await expect(actions.updateDealerAction("d-1", {}, form({ name: "X", planId: "p", notes: "" }))).rejects.toThrow("boom");
  });

  it("requires a backoffice session before calling the service", async () => {
    mocks.requireBackofficeUser.mockRejectedValue(Object.assign(new Error("NEXT_REDIRECT"), { url: "/_dev/admin/login" }));
    expect(await redirectOf(actions.recordDpaSignedAction("d-1", {}, form({ signedAt: "2026-10-01" })))).toBe("/_dev/admin/login");
    expect(mocks.recordDpaSigned).not.toHaveBeenCalled();
  });
});
