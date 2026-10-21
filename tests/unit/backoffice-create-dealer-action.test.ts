import { beforeEach, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/server/auth/permissions";

const mocks = vi.hoisted(() => ({
  createDealer: vi.fn(),
  requireBackofficeUser: vi.fn(),
  headers: new Headers({ "x-drivebook-base-path": "/_dev/admin" }),
}));

vi.mock("@/server/data/backoffice/dealers", () => ({ createDealer: mocks.createDealer }));
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

const { createDealerAction } = await import("@/app/backoffice/(app)/dealers/actions");

const values = {
  name: "Avto Novak",
  slug: "novak",
  ownerEmail: "lastnik@novak.si",
  planId: "p1",
  licenceValidUntil: "2027-10-21",
  notes: "pilot",
};

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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireBackofficeUser.mockResolvedValue({ user: { id: "bo", email: "a@drivebook.si", role: "superadmin" }, sessionId: "s" });
});

it("creates the dealer from the form fields and redirects to its detail page with the invitation notice", async () => {
  mocks.createDealer.mockResolvedValue({ ok: true, id: "d-1", slug: "novak" });
  expect(await redirectOf(createDealerAction({}, form(values)))).toBe(`${["", "_dev", "admin", "dealers", "d-1"].join("/")}?invited=1`);
  expect(mocks.createDealer).toHaveBeenCalledWith(values);
});

it("passes missing fields to the service as empty strings", async () => {
  mocks.createDealer.mockResolvedValue({ ok: false, field: "name", error: "required" });
  await createDealerAction({}, form({}));
  expect(mocks.createDealer).toHaveBeenCalledWith({ name: "", slug: "", ownerEmail: "", planId: "", licenceValidUntil: "", notes: "" });
});

it.each([
  ["slug", "format"],
  ["slug", "length"],
  ["slug", "reserved"],
  ["slug", "taken"],
  ["name", "required"],
  ["ownerEmail", "format"],
  ["ownerEmail", "taken"],
  ["planId", "unknown"],
  ["licenceValidUntil", "past"],
] as const)("maps the %s/%s rejection to the field and keeps the entered values", async (field, error) => {
  const submitted = field === "slug" ? { ...values, slug: "Novak!" } : values;
  mocks.createDealer.mockResolvedValue({ ok: false, field, error });
  expect(await createDealerAction({}, form(submitted))).toEqual({ values: submitted, field, error });
});

it("refuses Support on the server with a forbidden state", async () => {
  mocks.requireBackofficeUser.mockResolvedValue({ user: { id: "bo", email: "s@drivebook.si", role: "support" }, sessionId: "s" });
  mocks.createDealer.mockRejectedValue(new ForbiddenError());
  expect(await createDealerAction({}, form(values))).toEqual({ values, error: "forbidden" });
});

it("rethrows unexpected errors", async () => {
  mocks.createDealer.mockRejectedValue(new Error("boom"));
  await expect(createDealerAction({}, form(values))).rejects.toThrow("boom");
});

it("requires a backoffice session before calling the service", async () => {
  mocks.requireBackofficeUser.mockRejectedValue(Object.assign(new Error("NEXT_REDIRECT"), { url: "/_dev/admin/login" }));
  expect(await redirectOf(createDealerAction({}, form(values)))).toBe("/_dev/admin/login");
  expect(mocks.createDealer).not.toHaveBeenCalled();
});
