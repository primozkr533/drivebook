import { randomInt, randomUUID } from "node:crypto";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import backoffice from "../../messages/sl/backoffice.json";
import dealerPage from "../../messages/sl/dealerPage.json";
import email from "../../messages/sl/email.json";
import { getDb } from "@/db/client";
import { dealers, dealerSlugHistory } from "@/db/schema";
import { formatIsoDate } from "@/lib/date";
import { clearLoginAttempts, closeDb, createBackofficeUser, deleteUsers, uniqueEmail, type E2eUser } from "./helpers/auth-users";

// Writes to the running stack's database; created dealers stay behind, so slugs carry a per-run suffix.
const BASE_DOMAIN = process.env.BASE_DOMAIN ?? "drivebook.localhost";
const ROOT = "http://localhost:3000";
const ADMIN = [ROOT, "_dev", "admin"].join("/");
const admin = (...segments: string[]) => [ADMIN, ...segments].join("/");
const site = (slug: string) => [ROOT, "_dev", "site", slug].join("/");

const IP = `198.51.100.${randomInt(1, 255)}`;
test.use({ extraHTTPHeaders: { "x-forwarded-for": IP } });

const users: E2eUser[] = [];
const track = (user: E2eUser) => (users.push(user), user);

test.afterAll(async () => {
  await deleteUsers(users);
  await clearLoginAttempts({ ips: [IP] });
  await closeDb();
});

const suffix = () => randomUUID().slice(0, 8);

async function slugInUse(slug: string): Promise<boolean> {
  const [current] = await getDb().select({ id: dealers.id }).from(dealers).where(eq(dealers.slug, slug)).limit(1);
  const [old] = await getDb()
    .select({ id: dealerSlugHistory.dealerId })
    .from(dealerSlugHistory)
    .where(eq(dealerSlugHistory.slug, slug))
    .limit(1);
  return Boolean(current || old);
}

async function signIn(page: Page, user: E2eUser) {
  await page.goto(admin("login"));
  await page.getByTestId("login-email").fill(user.email);
  await page.getByTestId("login-password").fill(user.password);
  await page.getByTestId("login-submit").click();
  await expect(page).not.toHaveURL(/\/login$/);
}

async function signedInPage(browser: Browser, role: "superadmin" | "support"): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": IP } });
  const page = await context.newPage();
  await signIn(page, track(await createBackofficeUser({ role })));
  return { context, page };
}

type NewDealer = { name: string; slug: string; ownerEmail: string; licence: string };

async function fillCreateForm(page: Page, dealer: NewDealer) {
  await page.goto(admin("dealers", "new"));
  await page.getByTestId("dealer-create-name").fill(dealer.name);
  await page.getByTestId("dealer-create-slug").fill(dealer.slug);
  await page.getByTestId("dealer-create-owner-email").fill(dealer.ownerEmail);
  await page.getByTestId("dealer-create-licence").fill(dealer.licence);
  await page.getByTestId("dealer-create-submit").click();
}

async function createDealer(page: Page, overrides: Partial<NewDealer> = {}): Promise<NewDealer & { detailUrl: string }> {
  const dealer: NewDealer = {
    name: `E2E trgovec ${suffix()}`,
    slug: `e2e-${suffix()}`,
    ownerEmail: uniqueEmail("owner"),
    licence: "2030-12-31",
    ...overrides,
  };
  await fillCreateForm(page, dealer);
  await expect(page.getByTestId("dealer-notice")).toHaveText(backoffice.dealerDetail.invited);
  return { ...dealer, detailUrl: page.url().split("?")[0]! };
}

test("a Superadmin creates Avto Novak: the subdomain page is live and the owner gets the invitation", async ({ page }) => {
  await signIn(page, track(await createBackofficeUser({ role: "superadmin" })));
  // A clean DB gets the real 'novak'; reruns against a persisted DB fall back to a unique suffix.
  const slug = (await slugInUse("novak")) ? `novak-${suffix()}` : "novak";
  const ownerEmail = uniqueEmail("novak");
  await createDealer(page, { name: "Avto Novak", slug, ownerEmail });
  await expect(page.getByTestId("dealer-name")).toHaveText("Avto Novak");
  await expect(page.getByTestId("dealer-owner-email")).toHaveText(ownerEmail);

  await page.goto(`http://${slug}.${BASE_DOMAIN}:3000/`);
  await expect(page.getByRole("heading", { level: 1, name: "Avto Novak" })).toBeVisible();

  // The worker sends the e-mail asynchronously, so poll the inbox until it lands.
  const message = page.getByTestId("inbox-message").filter({ hasText: ownerEmail }).first();
  await expect(async () => {
    await page.goto([ROOT, "_dev", "inbox"].join("/"));
    await expect(message).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  await expect(message).toContainText(email.invitation.subjectDealer.replace("{dealerName}", "Avto Novak"));
  await expect(message.getByTestId("inbox-link").filter({ hasText: "set-password" }).first()).toBeVisible();
});

test("invalid and reserved slugs show their error and create nothing", async ({ page }) => {
  await signIn(page, track(await createBackofficeUser({ role: "superadmin" })));
  const name = `E2E zavrnjen ${suffix()}`;
  const cases = [
    { slug: "Ab", error: backoffice.slugErrors.format },
    { slug: "ab_c", error: backoffice.slugErrors.format },
    { slug: "ab", error: backoffice.slugErrors.length },
    { slug: "admin", error: backoffice.slugErrors.reserved },
  ];
  for (const { slug, error } of cases) {
    await fillCreateForm(page, { name, slug, ownerEmail: uniqueEmail("rejected"), licence: "2030-12-31" });
    await expect(page.getByText(error)).toBeVisible();
    await expect(page.getByTestId("dealer-create-slug")).toHaveValue(slug);
    await expect(page).toHaveURL(admin("dealers", "new"));
  }

  await page.goto(`${admin("dealers")}?q=${encodeURIComponent(name)}`);
  await expect(page.getByTestId("dealers-empty")).toBeVisible();
});

test("Support sees dealers read-only and the server refuses their writes", async ({ browser, page }) => {
  await signIn(page, track(await createBackofficeUser({ role: "superadmin" })));
  const dealer = await createDealer(page);
  const superadminCookies = await page.context().cookies();

  const support = await signedInPage(browser, "support");
  const sp = support.page;
  await sp.goto(`${admin("dealers")}?q=${encodeURIComponent(dealer.name)}`);
  await expect(sp.getByTestId("dealer-row")).toHaveCount(1);
  await expect(sp.getByTestId("dealer-create")).toHaveCount(0);

  await sp.getByTestId("dealer-row-link").click();
  await expect(sp.getByTestId("dealer-name")).toHaveText(dealer.name);
  await expect(sp.getByText(backoffice.dealerDetail.readOnly)).toBeVisible();
  const writeControls = [
    "dealer-suspend",
    "dealer-licence-form",
    "dealer-profile-form",
    "dealer-slug-form",
    "dealer-dpa-form",
    "dealer-resend-invite",
  ];
  for (const control of writeControls) await expect(sp.getByTestId(control)).toHaveCount(0);

  await sp.goto(admin("dealers", "new"));
  await expect(sp).toHaveURL(admin("dealers"));
  await expect(sp.getByTestId("dealer-create-form")).toHaveCount(0);

  // Without JS the Superadmin's suspend form posts the server action natively; swapping in the
  // Support session makes that a direct POST of the action by Support.
  const noJs = await browser.newContext({ javaScriptEnabled: false, extraHTTPHeaders: { "x-forwarded-for": IP } });
  const raw = await noJs.newPage();
  await noJs.addCookies(superadminCookies);
  await raw.goto(dealer.detailUrl);
  await expect(raw.getByTestId("dealer-suspend")).toBeVisible();
  await noJs.clearCookies();
  await noJs.addCookies(await support.context.cookies());
  const [refused] = await Promise.all([
    raw.waitForResponse((res) => res.request().method() === "POST"),
    raw.getByTestId("dealer-suspend").click(),
  ]);
  expect(refused.status()).toBe(200);
  await raw.waitForLoadState();
  await expect(raw.getByTestId("dealer-notice")).toHaveCount(0);

  await sp.goto(dealer.detailUrl);
  await expect(sp.getByTestId("dealer-status")).toHaveText(backoffice.dealers.statuses.active);

  // The same native POST with the Superadmin session does go through, so the refusal above is the role check.
  await noJs.clearCookies();
  await noJs.addCookies(superadminCookies);
  await raw.goto(dealer.detailUrl);
  await raw.getByTestId("dealer-suspend").click();
  await expect(raw.getByTestId("dealer-notice")).toHaveText(backoffice.dealerDetail.saved.status);
  await expect(raw.getByTestId("dealer-status")).toHaveText(backoffice.dealers.statuses.suspended);

  await noJs.close();
  await support.context.close();
});

test("two licence extensions are listed newest first with the previous and new dates", async ({ page }) => {
  await signIn(page, track(await createBackofficeUser({ role: "superadmin" })));
  await createDealer(page, { licence: "2030-12-31" });

  const extensions = [
    { validUntil: "2031-12-31", note: `Račun ${suffix()}` },
    { validUntil: "2032-06-30", note: `Račun ${suffix()}` },
  ];
  for (const { validUntil, note } of extensions) {
    await page.getByTestId("dealer-licence-valid-until").fill(validUntil);
    await page.getByTestId("dealer-licence-note").fill(note);
    await page.getByTestId("dealer-licence-submit").click();
    await expect(page.getByTestId("dealer-notice")).toHaveText(backoffice.dealerDetail.saved.licence);
    await expect(page.getByTestId("dealer-licence-current")).toHaveText(formatIsoDate(validUntil));
  }

  const rows = page.getByTestId("dealer-licence-row");
  await expect(rows).toHaveCount(3);
  const cells = (row: number) => rows.nth(row).locator("td");
  await expect(cells(0).nth(2)).toHaveText(formatIsoDate("2031-12-31"));
  await expect(cells(0).nth(3)).toHaveText(formatIsoDate("2032-06-30"));
  await expect(cells(0).nth(4)).toHaveText(extensions[1]!.note);
  await expect(cells(1).nth(2)).toHaveText(formatIsoDate("2030-12-31"));
  await expect(cells(1).nth(3)).toHaveText(formatIsoDate("2031-12-31"));
  await expect(cells(1).nth(4)).toHaveText(extensions[0]!.note);
  await expect(cells(2).nth(3)).toHaveText(formatIsoDate("2030-12-31"));
});

test("a valid licence extension after a failed one clears the error", async ({ page }) => {
  await signIn(page, track(await createBackofficeUser({ role: "superadmin" })));
  await createDealer(page, { licence: "2030-12-31" });
  const form = page.getByTestId("dealer-licence-form");
  const required = form.getByText(backoffice.dealerDetail.errors.required);

  await page.getByTestId("dealer-licence-valid-until").fill("2031-12-31");
  await page.getByTestId("dealer-licence-submit").click();
  await expect(required).toBeVisible();
  await expect(page.getByTestId("dealer-licence-valid-until")).toHaveValue("2031-12-31");

  const note = `Račun ${suffix()}`;
  await page.getByTestId("dealer-licence-note").fill(note);
  await page.getByTestId("dealer-licence-submit").click();
  await expect(page.getByTestId("dealer-notice")).toHaveText(backoffice.dealerDetail.saved.licence);
  await expect(required).toHaveCount(0);
  await expect(page.getByTestId("dealer-licence-row").first().locator("td").nth(4)).toHaveText(note);

  await expect(page.getByTestId("dealer-licence-note")).toHaveValue("");
  await page.getByTestId("dealer-licence-valid-until").fill("2032-06-30");
  await page.getByTestId("dealer-licence-submit").click();
  await expect(required).toBeVisible();
  await page.getByTestId("dealer-licence-note").fill(`Račun ${suffix()}`);
  await page.getByTestId("dealer-licence-submit").click();
  await expect(page.getByTestId("dealer-licence-current")).toHaveText(formatIsoDate("2032-06-30"));
  await expect(required).toHaveCount(0);
  await expect(page.getByTestId("dealer-licence-row")).toHaveCount(3);
});

// Backoffice-created dealers have no phone yet, so the suspended page uses the no-phone message.
test("suspending shows the suspended message on the public page and reactivating restores it", async ({ page }) => {
  await signIn(page, track(await createBackofficeUser({ role: "superadmin" })));
  const dealer = await createDealer(page);

  await page.goto(site(dealer.slug));
  await expect(page.getByRole("heading", { level: 1, name: dealer.name })).toBeVisible();
  await expect(page.getByText(dealerPage.suspendedBodyNoPhone)).toHaveCount(0);
  await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);

  await page.goto(dealer.detailUrl);
  await page.getByTestId("dealer-suspend").click();
  await expect(page.getByTestId("dealer-status")).toHaveText(backoffice.dealers.statuses.suspended);
  await page.goto(site(dealer.slug));
  await expect(page.getByRole("heading", { name: dealerPage.suspendedTitle })).toBeVisible();
  await expect(page.getByText(dealerPage.suspendedBodyNoPhone)).toBeVisible();
  await expect(page.getByText(dealerPage.suspendedBody)).toHaveCount(0);
  await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);

  await page.goto(dealer.detailUrl);
  await page.getByTestId("dealer-reactivate").click();
  await expect(page.getByTestId("dealer-status")).toHaveText(backoffice.dealers.statuses.active);
  await page.goto(site(dealer.slug));
  await expect(page.getByRole("heading", { level: 1, name: dealer.name })).toBeVisible();
  await expect(page.getByText(dealerPage.suspendedBodyNoPhone)).toHaveCount(0);
  await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
});
