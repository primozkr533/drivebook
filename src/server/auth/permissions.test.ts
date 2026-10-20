import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDealerContext } from "@/server/data/context";
import type { AuthSurface, BackofficeSessionUser, DealerSessionUser } from "./session";

const jar = new Map<string, string>();
const requestHeaders = new Headers();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined) }),
  headers: async () => requestHeaders,
}));

class RedirectSignal extends Error {
  constructor(readonly location: string) {
    super(`redirect ${location}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (location: string) => {
    throw new RedirectSignal(location);
  },
}));

const ctxA = createDealerContext({ id: "00000000-0000-0000-0000-00000000000a", slug: "alpha", status: "active" });
const ctxB = createDealerContext({ id: "00000000-0000-0000-0000-00000000000b", slug: "beta", status: "active" });

// Per-surface token stores stand in for the session tables; cookie names come from the real module.
const stores: Record<AuthSurface, Map<string, DealerSessionUser | BackofficeSessionUser>> = {
  dealer: new Map(),
  backoffice: new Map(),
};

vi.mock("./session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./session")>();
  const getCurrentSession = async (surface: AuthSurface) => {
    const token = jar.get(actual.SESSION_COOKIE[surface]);
    const user = token ? stores[surface].get(token) : undefined;
    return user ? { session: {}, user } : null;
  };
  return {
    ...actual,
    getCurrentSession,
    getDealerContextFromSession: async () => {
      const current = await getCurrentSession("dealer");
      if (!current) return null;
      const { id, email, role, dealerId } = current.user as DealerSessionUser;
      return { ctx: [ctxA, ctxB].find((c) => c.dealerId === dealerId)!, user: { id, email, role } };
    },
  };
});

const { SESSION_COOKIE } = await import("./session");
const {
  DealerReadOnlyError,
  ForbiddenError,
  getSurfaceBasePath,
  requireBackofficeRole,
  requireBackofficeUser,
  requireDealerRole,
  requireDealerUser,
} = await import("./permissions");

const user = { name: "User", status: "active" };
const owner: DealerSessionUser = { ...user, id: "u-owner", email: "owner@alpha.si", role: "owner", dealerId: ctxA.dealerId };
const salesperson: DealerSessionUser = { ...owner, id: "u-sales", email: "sales@alpha.si", role: "salesperson" };
const superadmin: BackofficeSessionUser = { ...user, id: "u-admin", email: "admin@drivebook.si", role: "superadmin" };
const support: BackofficeSessionUser = { ...user, id: "u-support", email: "support@drivebook.si", role: "support" };

function signIn(surface: AuthSurface, u: DealerSessionUser | BackofficeSessionUser): string {
  const token = `tok-${surface}-${u.id}`;
  stores[surface].set(token, u);
  jar.set(SESSION_COOKIE[surface], token);
  return token;
}

async function redirectOf(promise: Promise<unknown>): Promise<string> {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(RedirectSignal);
  return (err as RedirectSignal).location;
}

beforeEach(() => {
  jar.clear();
  stores.dealer.clear();
  stores.backoffice.clear();
  requestHeaders.delete("x-drivebook-base-path");
});

describe("getSurfaceBasePath", () => {
  it("defaults to empty and returns the header when set", async () => {
    expect(await getSurfaceBasePath()).toBe("");
    requestHeaders.set("x-drivebook-base-path", "/_dev/app");
    expect(await getSurfaceBasePath()).toBe("/_dev/app");
  });
});

describe("dealer guards", () => {
  it("owner passes requireDealerRole for owner", async () => {
    signIn("dealer", owner);
    await expect(requireDealerRole(ctxA, ["owner"])).resolves.toEqual({
      userId: owner.id,
      role: "owner",
      dealerId: ctxA.dealerId,
    });
  });

  it("salesperson is rejected for owner but accepted for owner or salesperson", async () => {
    signIn("dealer", salesperson);
    await expect(requireDealerRole(ctxA, ["owner"])).rejects.toBeInstanceOf(ForbiddenError);
    await expect(requireDealerRole(ctxA, ["owner", "salesperson"])).resolves.toMatchObject({ role: "salesperson" });
  });

  it("rejects a dealer A session used with a dealer B context", async () => {
    signIn("dealer", owner);
    await expect(requireDealerRole(ctxB, ["owner", "salesperson"])).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("requireDealerUser returns the session context and user", async () => {
    signIn("dealer", owner);
    const { ctx, user: u } = await requireDealerUser();
    expect(ctx).toBe(ctxA);
    expect(u).toEqual({ id: owner.id, email: owner.email, role: "owner" });
  });

  it("redirects to login without a session, prefixed by the base path", async () => {
    expect(await redirectOf(requireDealerUser())).toBe("/login");
    requestHeaders.set("x-drivebook-base-path", "/_dev/app");
    expect(await redirectOf(requireDealerRole(ctxA, ["owner"]))).toBe("/_dev/app/login");
  });

  it("does not accept a backoffice session cookie", async () => {
    const token = signIn("backoffice", superadmin);
    jar.set(SESSION_COOKIE.dealer, token);
    expect(await redirectOf(requireDealerRole(ctxA, ["owner"]))).toBe("/login");
  });
});

describe("backoffice guards", () => {
  it("superadmin passes requireBackofficeRole for superadmin", async () => {
    signIn("backoffice", superadmin);
    await expect(requireBackofficeRole(["superadmin"])).resolves.toEqual({ userId: superadmin.id, role: "superadmin" });
  });

  it("support is rejected for superadmin", async () => {
    signIn("backoffice", support);
    await expect(requireBackofficeRole(["superadmin"])).rejects.toBeInstanceOf(ForbiddenError);
    await expect(requireBackofficeRole(["superadmin", "support"])).resolves.toMatchObject({ role: "support" });
  });

  it("redirects to login without a session, prefixed by the base path", async () => {
    expect(await redirectOf(requireBackofficeRole(["superadmin"]))).toBe("/login");
    requestHeaders.set("x-drivebook-base-path", "/_dev/admin");
    expect(await redirectOf(requireBackofficeRole(["superadmin"]))).toBe("/_dev/admin/login");
    expect(await redirectOf(requireBackofficeUser())).toBe("/_dev/admin/login");
  });

  it("does not accept a dealer session cookie (cross-surface)", async () => {
    const token = signIn("dealer", owner);
    expect(await redirectOf(requireBackofficeRole(["superadmin", "support"]))).toBe("/login");
    jar.set(SESSION_COOKIE.backoffice, token);
    expect(await redirectOf(requireBackofficeRole(["superadmin", "support"]))).toBe("/login");
  });
});

describe("error classes", () => {
  it("exposes distinct named error classes", () => {
    expect(new ForbiddenError().name).toBe("ForbiddenError");
    expect(new DealerReadOnlyError()).toBeInstanceOf(Error);
    expect(new DealerReadOnlyError()).not.toBeInstanceOf(ForbiddenError);
  });
});
