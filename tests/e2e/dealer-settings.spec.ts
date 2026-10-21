import { randomInt } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import account from "../../messages/sl/account.json";
import dealerUsers from "../../messages/sl/dealerUsers.json";
import settings from "../../messages/sl/settings.json";
import { addDays, formatIsoDate, ljubljanaNow, slovenianWorkFreeDays } from "@/lib/date";
import {
  clearLoginAttempts,
  closeDb,
  createDealer,
  createDealerUser,
  deleteDealers,
  uniqueEmail,
  type E2eDealer,
  type E2eUser,
} from "./helpers/auth-users";

// Writes to the running stack's database; the dedicated dealer (and its users) is deleted afterwards.
const ROOT = "http://localhost:3000";
const APP = [ROOT, "_dev", "app"].join("/");
const app = (...segments: string[]) => [APP, ...segments].join("/");
const site = (slug: string) => [ROOT, "_dev", "site", slug].join("/");

const IP = `198.51.100.${randomInt(1, 255)}`;
test.use({ extraHTTPHeaders: { "x-forwarded-for": IP } });
test.describe.configure({ mode: "serial" });

// A 1×1 transparent PNG.
const LOGO_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

let dealer: E2eDealer;
let owner: E2eUser;

test.beforeAll(async () => {
  dealer = await createDealer();
  owner = await createDealerUser({ role: "owner", dealerSlug: dealer.slug });
});

test.afterAll(async () => {
  if (dealer) await deleteDealers([dealer]);
  await clearLoginAttempts({ ips: [IP] });
  await closeDb();
});

async function signIn(page: Page, user: E2eUser) {
  await page.goto(app("login"));
  await page.getByTestId("login-email").fill(user.email);
  await page.getByTestId("login-password").fill(user.password);
  await page.getByTestId("login-submit").click();
  await expect(page).not.toHaveURL(/\/login$/);
}

// A holiday on the same date would be listed instead of the closure reason.
function nextWorkingDay(from: string): string {
  const holidays = (year: number) => slovenianWorkFreeDays(year).map((d) => d.date);
  let date = from;
  while (holidays(Number(date.slice(0, 4))).includes(date)) date = addDays(date, 1);
  return date;
}

test("Owner settings show on the public dealer page", async ({ page }) => {
  const name = `${dealer.name} Novo`;
  const phone = "+38612345678";
  const color = { hex: "#1F6F3A", rgb: "rgb(31, 111, 58)" };
  const closureDate = nextWorkingDay(addDays(ljubljanaNow().dateISO, 1));
  const reason = `Inventura ${dealer.slug}`;

  await signIn(page, owner);

  await page.goto(app("settings", "dealer"));
  await page.getByTestId("settings-dealer-name").fill(name);
  await page.getByTestId("settings-dealer-phone").fill("01 234 56 78");
  await page.getByTestId("settings-dealer-profile-submit").click();
  await expect(page.getByTestId("settings-dealer-profile-saved")).toBeVisible();

  await page.goto(app("settings", "branding"));
  await page.getByTestId("branding-color-hex").fill(color.hex);
  await page.getByTestId("branding-color-submit").click();
  await expect(page.getByTestId("branding-color-saved")).toBeVisible();
  await page.getByTestId("branding-logo-input").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: LOGO_PNG });
  await page.getByTestId("branding-logo-upload").click();
  await expect(page.getByTestId("branding-logo-saved")).toBeVisible();
  await expect(page.getByTestId("branding-logo")).toBeVisible();

  await page.goto(app("settings", "hours"));
  await page.getByTestId("hours-add-6").click();
  await page.getByTestId("hours-opens-6-0").fill("09:00");
  await page.getByTestId("hours-closes-6-0").fill("13:00");
  await page.getByTestId("hours-save").click();
  await expect(page.getByTestId("hours-saved")).toBeVisible();

  await page.goto(app("settings", "closures"));
  await page.getByTestId("closure-start").fill(closureDate);
  await page.getByTestId("closure-end").fill(closureDate);
  await page.getByTestId("closure-reason").fill(reason);
  await page.getByTestId("closure-submit").click();
  await expect(page.getByTestId("closure-added")).toBeVisible();

  await page.goto(site(dealer.slug));
  await expect(page).toHaveTitle(new RegExp(name));
  await expect(page.locator("footer")).toContainText(name);
  const logo = page.getByRole("heading", { level: 1 }).getByRole("img", { name });
  await expect(logo).toHaveAttribute("src", /^\/api\/files\//);
  await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  const call = page.locator(`a[href="tel:${phone}"]`);
  await expect(call).toContainText(phone);
  await expect(call).toHaveCSS("background-color", color.rgb);

  await expect(page.getByText("09:00–13:00")).toBeVisible();
  const closed = page.getByTestId("closed-dates").getByRole("listitem").filter({ hasText: formatIsoDate(closureDate) });
  await expect(closed).toContainText(reason);
});

test("a Salesperson has no Settings or Users links and every owner page is access denied", async ({ page }) => {
  const sales = await createDealerUser({ role: "salesperson", dealerSlug: dealer.slug });
  await signIn(page, sales);

  await page.goto(APP);
  await expect(page.getByRole("link", { name: account.navAccount }).first()).toBeAttached();
  await expect(page.getByRole("link", { name: settings.nav })).toHaveCount(0);
  await expect(page.getByRole("link", { name: settings.usersNav })).toHaveCount(0);

  const pages = [
    { path: ["settings", "dealer"], form: "settings-dealer-profile-form" },
    { path: ["settings", "branding"], form: "branding-logo-form" },
    { path: ["settings", "booking"], form: "booking-rules-form" },
    { path: ["settings", "hours"], form: "hours-editor" },
    { path: ["settings", "closures"], form: "closure-form" },
    { path: ["users"], form: "dealer-user-invite-form" },
  ];
  for (const { path, form } of pages) {
    await page.goto(app(...path));
    await expect(page.getByTestId("access-denied")).toBeVisible();
    await expect(page.getByTestId(form)).toHaveCount(0);
    await expect(page.getByTestId("settings-dealer-profile-form")).toHaveCount(0);
    await expect(page.getByTestId("dealer-users")).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText(dealer.email);
    await expect(page.locator("main")).not.toContainText(owner.email);
  }
});

test("the Owner invites a Salesperson and cannot demote the last Owner", async ({ page }) => {
  const invitee = uniqueEmail("invitee");
  await signIn(page, owner);

  await page.goto(app("users"));
  await page.getByTestId("dealer-user-invite-email").fill(invitee);
  await page.getByTestId("dealer-user-invite-name").fill("Prodajalec E2E");
  await page.getByTestId("dealer-user-invite-role").selectOption("salesperson");
  await page.getByTestId("dealer-user-invite-submit").click();
  await expect(page.getByTestId("dealer-users-saved")).toHaveAttribute("data-state", "invite");
  await expect(page.locator(`[data-testid="dealer-user-row"][data-email="${invitee}"]`)).toBeVisible();

  // The worker sends the e-mail asynchronously, so poll the inbox until it lands.
  const message = page.getByTestId("inbox-message").filter({ hasText: invitee }).first();
  await expect(async () => {
    await page.goto([ROOT, "_dev", "inbox"].join("/"));
    await expect(message).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  await expect(message.getByTestId("inbox-link").filter({ hasText: "set-password" }).first()).toBeVisible();

  await page.goto(app("users"));
  const ownerRow = page.locator(`[data-testid="dealer-user-row"][data-email="${owner.email}"]`);
  await ownerRow.getByTestId("dealer-user-role").selectOption("salesperson");
  await ownerRow.getByTestId("dealer-user-role-submit").click();
  const error = ownerRow.getByTestId("dealer-user-role-error");
  await expect(error).toHaveAttribute("data-state", "last_owner");
  await expect(error).toHaveText(dealerUsers.errors.last_owner);
});
