import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refreshSessionCookie = vi.fn();

vi.mock("@/lib/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/config")>()),
  getConfig: () => ({ baseDomain: "drivebook.localhost", devAliases: true, devInboxEnabled: true }),
}));
vi.mock("@/server/data/dealers", () => ({ resolveDealerSlug: async () => ({ kind: "unknown" }) }));
vi.mock("@/server/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth/session")>()),
  refreshSessionCookie,
}));

const { proxy } = await import("@/proxy");

const EXPIRY = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
const MAX_AGE = 30 * 24 * 60 * 60;

function request(url: string, cookies: Record<string, string> = {}, headers: Record<string, string> = {}) {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
  return new NextRequest(url, { headers: { host: new URL(url).host, ...headers, ...(cookie ? { cookie } : {}) } });
}

const setCookie = (res: Response) => res.headers.getSetCookie();

beforeEach(() => {
  refreshSessionCookie.mockReset();
  refreshSessionCookie.mockResolvedValue(EXPIRY);
});

describe("proxy session refresh", () => {
  it("re-issues the dealer cookie on app. with the setSessionCookie attributes", async () => {
    const res = await proxy(request("http://app.drivebook.localhost:3000/account", { db_app_session: "tok" }));
    expect(refreshSessionCookie).toHaveBeenCalledWith("dealer", "tok");
    const cookie = res.cookies.get("db_app_session");
    expect(cookie).toMatchObject({ value: "tok", httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: MAX_AGE });
    expect(cookie).not.toHaveProperty("domain");
    expect(setCookie(res)).toHaveLength(1);
  });

  it("re-issues the backoffice cookie on admin. and the dev aliases", async () => {
    const admin = await proxy(request("http://admin.drivebook.localhost:3000/", { db_admin_session: "a" }));
    expect(refreshSessionCookie).toHaveBeenLastCalledWith("backoffice", "a");
    expect(admin.cookies.get("db_admin_session")?.maxAge).toBe(MAX_AGE);

    const devAdmin = await proxy(request("http://localhost:3000/_dev/admin/account", { db_admin_session: "b" }));
    expect(refreshSessionCookie).toHaveBeenLastCalledWith("backoffice", "b");
    expect(devAdmin.cookies.get("db_admin_session")?.value).toBe("b");

    const devApp = await proxy(request("http://localhost:3000/_dev/app", { db_app_session: "c" }));
    expect(refreshSessionCookie).toHaveBeenLastCalledWith("dealer", "c");
    expect(devApp.cookies.get("db_app_session")?.value).toBe("c");
  });

  it("drops Secure only where setSessionCookie does (plain http on a non-localhost dev host)", async () => {
    const res = await proxy(request("http://web:3000/_dev/app/account", { db_app_session: "tok" }, { host: "web:3000" }));
    expect(res.cookies.get("db_app_session")).toMatchObject({ value: "tok", secure: false, maxAge: MAX_AGE });
  });

  it("sends no cookie when the session was not refreshed or is missing", async () => {
    refreshSessionCookie.mockResolvedValue(null);
    expect(setCookie(await proxy(request("http://app.drivebook.localhost:3000/", { db_app_session: "tok" })))).toEqual([]);

    refreshSessionCookie.mockResolvedValue(EXPIRY);
    expect(setCookie(await proxy(request("http://app.drivebook.localhost:3000/")))).toEqual([]);
    expect(refreshSessionCookie).toHaveBeenCalledTimes(1);
  });

  it("keeps the surfaces apart", async () => {
    const app = await proxy(request("http://app.drivebook.localhost:3000/", { db_admin_session: "a" }));
    const admin = await proxy(request("http://admin.drivebook.localhost:3000/", { db_app_session: "d" }));
    expect(setCookie(app)).toEqual([]);
    expect(setCookie(admin)).toEqual([]);
    expect(refreshSessionCookie).not.toHaveBeenCalled();
  });

  it("never touches the session on public dealer hosts or the dev site alias", async () => {
    const both = { db_app_session: "d", db_admin_session: "a" };
    expect(setCookie(await proxy(request("http://demo.drivebook.localhost:3000/", both)))).toEqual([]);
    expect(setCookie(await proxy(request("http://localhost:3000/_dev/site/demo", both)))).toEqual([]);
    expect(refreshSessionCookie).not.toHaveBeenCalled();
  });
});
