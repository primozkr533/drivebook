import { getConfig } from "@/lib/config";
import { setSessionCookie } from "@/server/auth/session";
import { testLoginDemoOwner } from "@/server/auth/test-login";
import { requestHost, testLoginRedirect } from "@/server/routing";

const notFound = () => new Response(null, { status: 404 });

async function requestedSurface(request: Request): Promise<string | null> {
  const body = (await request.text()).trim();
  if (!body) return "dealer";
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed === null || typeof parsed !== "object") return null;
    const surface = (parsed as { surface?: unknown }).surface;
    return surface === undefined ? "dealer" : typeof surface === "string" ? surface : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  const { farmTestAuth, baseDomain } = getConfig();
  if (!farmTestAuth) return notFound();
  const redirect = testLoginRedirect(requestHost(request.headers), baseDomain);
  if (redirect === null) return notFound();

  if ((await requestedSurface(request)) !== "dealer") {
    return Response.json({ ok: false, error: "unsupported_surface" }, { status: 400 });
  }

  const result = await testLoginDemoOwner({
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
    userAgent: request.headers.get("user-agent"),
  });
  if (!result) return Response.json({ ok: false, error: "demo_owner_missing" }, { status: 500 });

  await setSessionCookie("dealer", result.token);
  return Response.json({
    ok: true,
    user: { email: result.email, role: result.role },
    dealerSlug: result.dealerSlug,
    redirect,
  });
}
