import { beforeEach, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/server/auth/permissions";

const mocks = vi.hoisted(() => ({
  inviteBackofficeUser: vi.fn(),
  deactivateBackofficeUser: vi.fn(),
  requireBackofficeUser: vi.fn(),
  headers: new Headers({ "x-drivebook-base-path": "/_dev/admin" }),
}));

vi.mock("@/server/data/backoffice/users", () => ({
  inviteBackofficeUser: mocks.inviteBackofficeUser,
  deactivateBackofficeUser: mocks.deactivateBackofficeUser,
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

const { inviteUserAction, deactivateUserAction } = await import("@/app/backoffice/(app)/users/actions");

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

const invite = { email: "nova@drivebook.si", role: "support" };

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

it("invites with the form email and role and redirects to the list", async () => {
  mocks.inviteBackofficeUser.mockResolvedValue({ ok: true, userId: "u1", link: "x" });
  expect(await redirectOf(inviteUserAction({}, form({ ...invite, role: "superadmin" })))).toBe("/_dev/admin/users");
  expect(mocks.inviteBackofficeUser).toHaveBeenCalledWith({ email: "nova@drivebook.si", role: "superadmin" });
});

it.each(["email", "taken"] as const)("maps the %s refusal and keeps the submitted values", async (error) => {
  mocks.inviteBackofficeUser.mockResolvedValue({ ok: false, error });
  expect(await inviteUserAction({}, form(invite))).toEqual({ values: invite, error });
});

it.each(["", "owner"])("rejects the role %j without calling the service", async (role) => {
  expect(await inviteUserAction({}, form({ ...invite, role }))).toEqual({ values: { ...invite, role }, error: "role" });
  expect(mocks.inviteBackofficeUser).not.toHaveBeenCalled();
});

it("deactivates the bound user and redirects to the list", async () => {
  mocks.deactivateBackofficeUser.mockResolvedValue({ ok: true });
  expect(await redirectOf(deactivateUserAction("u1", {}, form({ id: "other" })))).toBe("/_dev/admin/users");
  expect(mocks.deactivateBackofficeUser).toHaveBeenCalledWith("u1");
});

it("maps the self and not_found deactivate refusals", async () => {
  mocks.deactivateBackofficeUser.mockResolvedValueOnce({ ok: false, error: "self" });
  expect(await deactivateUserAction("bo", {}, form({}))).toEqual({ error: "self" });
  mocks.deactivateBackofficeUser.mockResolvedValueOnce({ ok: false, error: "not_found" });
  expect(await deactivateUserAction("gone", {}, form({}))).toEqual({ error: "notFound" });
});

it("shows forbidden when the service refuses the role (Support)", async () => {
  mocks.inviteBackofficeUser.mockRejectedValue(new ForbiddenError());
  mocks.deactivateBackofficeUser.mockRejectedValue(new ForbiddenError());
  expect(await inviteUserAction({}, form(invite))).toEqual({ values: invite, error: "forbidden" });
  expect(await deactivateUserAction("u1", {}, form({}))).toEqual({ error: "forbidden" });
});

it("rethrows unexpected errors", async () => {
  mocks.deactivateBackofficeUser.mockRejectedValue(new Error("boom"));
  await expect(deactivateUserAction("u1", {}, form({}))).rejects.toThrow("boom");
});

it("requires a backoffice session before calling the service", async () => {
  mocks.requireBackofficeUser.mockRejectedValue(Object.assign(new Error("NEXT_REDIRECT"), { url: "/_dev/admin/login" }));
  expect(await redirectOf(inviteUserAction({}, form(invite)))).toBe("/_dev/admin/login");
  expect(await redirectOf(deactivateUserAction("u1", {}, form({})))).toBe("/_dev/admin/login");
  expect(mocks.inviteBackofficeUser).not.toHaveBeenCalled();
  expect(mocks.deactivateBackofficeUser).not.toHaveBeenCalled();
});
