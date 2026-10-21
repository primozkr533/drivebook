import { beforeEach, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/server/auth/permissions";

const mocks = vi.hoisted(() => ({
  createPlan: vi.fn(),
  updatePlan: vi.fn(),
  deletePlan: vi.fn(),
  requireBackofficeUser: vi.fn(),
  headers: new Headers({ "x-drivebook-base-path": "/_dev/admin" }),
}));

vi.mock("@/server/data/backoffice/plans", () => ({
  createPlan: mocks.createPlan,
  updatePlan: mocks.updatePlan,
  deletePlan: mocks.deletePlan,
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

const { savePlanAction, deletePlanAction } = await import("@/app/backoffice/(app)/plans/actions");

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

const planForm = { name: " Pro ", monthlySmsQuota: "300", maxUsers: "5", notes: "za večje" };
const values = { name: " Pro ", monthlySmsQuota: "300", maxUsers: "5", notes: "za večje" };

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

it("creates a plan from the form fields and redirects to the list", async () => {
  mocks.createPlan.mockResolvedValue({ ok: true, plan: { id: "p1" } });
  expect(await redirectOf(savePlanAction(null, {}, form(planForm)))).toMatch(/^\/_dev\/admin\/plans\?saved=create&t=[a-z0-9]+$/);
  expect(mocks.createPlan).toHaveBeenCalledWith({ name: " Pro ", monthlySmsQuota: 300, maxUsers: 5, notes: "za večje" });
  expect(mocks.updatePlan).not.toHaveBeenCalled();
});

it("updates the bound plan id and redirects to the list", async () => {
  mocks.updatePlan.mockResolvedValue({ ok: true, plan: { id: "p1" } });
  expect(await redirectOf(savePlanAction("p1", {}, form(planForm)))).toMatch(/^\/_dev\/admin\/plans\?saved=update&t=[a-z0-9]+$/);
  expect(mocks.updatePlan).toHaveBeenCalledWith("p1", { name: " Pro ", monthlySmsQuota: 300, maxUsers: 5, notes: "za večje" });
});

it("passes blank or non-integer numbers as NaN so the service rejects them", async () => {
  mocks.createPlan.mockResolvedValue({ ok: false, field: "maxUsers", error: "invalid" });
  await savePlanAction(null, {}, form({ ...planForm, monthlySmsQuota: "", maxUsers: "2.5" }));
  const input = mocks.createPlan.mock.calls[0]![0];
  expect(input.monthlySmsQuota).toBeNaN();
  expect(input.maxUsers).toBeNaN();
});

it("maps field errors to the field and keeps the submitted values", async () => {
  mocks.createPlan.mockResolvedValue({ ok: false, field: "name", error: "taken" });
  expect(await savePlanAction(null, {}, form(planForm))).toEqual({ values, field: "name", error: "taken" });
});

it("maps notFound on update to a form error", async () => {
  mocks.updatePlan.mockResolvedValue({ ok: false, error: "notFound" });
  expect(await savePlanAction("gone", {}, form(planForm))).toEqual({ values, error: "notFound" });
});

it("shows forbidden when the service refuses the role (Support)", async () => {
  mocks.createPlan.mockRejectedValue(new ForbiddenError());
  mocks.updatePlan.mockRejectedValue(new ForbiddenError());
  mocks.deletePlan.mockRejectedValue(new ForbiddenError());
  expect(await savePlanAction(null, {}, form(planForm))).toEqual({ values, error: "forbidden" });
  expect(await savePlanAction("p1", {}, form(planForm))).toEqual({ values, error: "forbidden" });
  expect(await deletePlanAction("p1", {}, form({}))).toEqual({ error: "forbidden" });
});

it("rethrows unexpected errors", async () => {
  mocks.deletePlan.mockRejectedValue(new Error("boom"));
  await expect(deletePlanAction("p1", {}, form({}))).rejects.toThrow("boom");
});

it("deletes the bound plan and redirects to the list", async () => {
  mocks.deletePlan.mockResolvedValue({ ok: true });
  expect(await redirectOf(deletePlanAction("p1", {}, form({ id: "other" })))).toMatch(/^\/_dev\/admin\/plans\?saved=delete&t=[a-z0-9]+$/);
  expect(mocks.deletePlan).toHaveBeenCalledWith("p1");
});

it.each(["inUse", "default", "notFound"] as const)("passes the %s delete refusal through", async (error) => {
  mocks.deletePlan.mockResolvedValue({ ok: false, error });
  expect(await deletePlanAction("p1", {}, form({}))).toEqual({ error });
});

it("requires a backoffice session before calling the service", async () => {
  mocks.requireBackofficeUser.mockRejectedValue(Object.assign(new Error("NEXT_REDIRECT"), { url: "/_dev/admin/login" }));
  expect(await redirectOf(savePlanAction(null, {}, form(planForm)))).toBe("/_dev/admin/login");
  expect(await redirectOf(deletePlanAction("p1", {}, form({})))).toBe("/_dev/admin/login");
  expect(mocks.createPlan).not.toHaveBeenCalled();
  expect(mocks.deletePlan).not.toHaveBeenCalled();
});
