import { randomInt } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import {
  clearLoginAttempts,
  closeDb,
  createDealer,
  createDealerUser,
  deleteDealers,
  openAllWeek,
  type E2eDealer,
  type E2eUser,
} from "./helpers/auth-users";

// Writes to the running stack's database; the dedicated dealer (cars, bookings, users) is deleted afterwards.
const ROOT = "http://localhost:3000";
const app = (...segments: string[]) => [ROOT, "_dev", "app", ...segments].join("/");
const site = (slug: string, ...segments: string[]) => [ROOT, "_dev", "site", slug, ...segments].join("/");

const IP = `198.51.100.${randomInt(1, 255)}`;
test.use({ extraHTTPHeaders: { "x-forwarded-for": IP } });
test.describe.configure({ mode: "serial" });

let dealer: E2eDealer;
let salesperson: E2eUser;
const LISTING = `https://www.avto.net/Ads/details.asp?id=${randomInt(100_000_000, 999_999_999)}`;
// A unique mobile number, so the spec finds its own SMS code in the dev inbox.
const PHONE_DIGITS = String(randomInt(100_000, 999_999));
const PHONE_E164 = `+38641${PHONE_DIGITS}`;

test.beforeAll(async () => {
  dealer = await createDealer();
  await openAllWeek(dealer.id);
  salesperson = await createDealerUser({ role: "salesperson", dealerSlug: dealer.slug });
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

test("a salesperson adds a car, a customer books and confirms it with the SMS code, the slot is taken and can be cancelled", async ({ page, browser }) => {
  await signIn(page, salesperson);
  await page.goto(app("cars", "new"));
  await page.getByTestId("car-avtonet-url").fill(LISTING);
  await page.getByTestId("car-make").fill("Audi");
  await page.getByTestId("car-model").fill("A4 Avant");
  await page.getByTestId("car-year").fill("2019");
  await page.getByTestId("car-price").fill("21.500");
  await page.getByTestId("car-mileage").fill("120.000");
  await page.getByTestId("car-notes").fill("Vozilo je na lokaciji Ljubljana.");
  await page.getByTestId("car-save").click();
  await expect(page).toHaveURL(/\/cars(\?|$)/);

  const customer = await browser.newPage();
  await customer.goto(site(dealer.slug));
  await expect(customer.getByText("Vozilo je na lokaciji Ljubljana.")).toBeVisible();
  await expect(customer.getByTestId("car-mileage").first()).toHaveText("120.000 km");
  await customer.locator('[data-testid^="book-"]').first().click();
  const firstSlot = customer.locator('[data-testid^="slot-"]').first();
  const label = (await firstSlot.textContent())!.trim();
  await firstSlot.click();
  await customer.getByTestId("booking-name").fill("Ana Novak");
  await customer.getByTestId("booking-phone").fill(`041 ${PHONE_DIGITS}`);
  await customer.getByTestId("booking-submit").click();
  await expect(customer).toHaveURL(/rezervacija/);
  await expect(customer.getByTestId("confirmation-title")).toHaveAttribute("data-state", "pending");

  // The worker delivers the SMS asynchronously; read the code from the dev inbox.
  const inbox = await browser.newPage();
  let code = "";
  await expect(async () => {
    await inbox.goto([ROOT, "_dev", "inbox"].join("/"));
    const text = await inbox.getByTestId("inbox-message").filter({ hasText: PHONE_E164 }).first().innerText({ timeout: 1_000 });
    code = /je (\d{6})/.exec(text)![1];
  }).toPass({ timeout: 30_000 });
  await inbox.close();

  await customer.getByTestId("verify-code").fill("000000" === code ? "111111" : "000000");
  await customer.getByTestId("verify-submit").click();
  await expect(customer.getByText(/Koda ni pravilna/)).toBeVisible();
  await customer.getByTestId("verify-code").fill(code);
  await customer.getByTestId("verify-submit").click();
  await expect(customer.getByTestId("confirmation-title")).toHaveText("Rezervacija je potrjena");

  // The booked time is gone from this car's calendar.
  await customer.goBack();
  await customer.reload();
  await expect(customer.getByTestId(`slot-${label}`)).toHaveCount(0);

  await page.goto(app("bookings"));
  const row = page.locator('li[data-testid^="booking-"]').filter({ hasText: "Ana Novak" });
  await expect(row).toBeVisible();
  await row.getByRole("button").click();
  await expect(row.getByText("Odpovedano")).toBeVisible();

  await customer.reload();
  await expect(customer.getByTestId(`slot-${label}`)).toHaveCount(1);
  await customer.close();
});
