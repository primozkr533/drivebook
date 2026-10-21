import { randomInt, randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { expect, test, type Page } from "@playwright/test";
import dealerPage from "../../messages/sl/dealerPage.json";
import { getDb } from "@/db/client";
import { DEMO_DEALER_SLUG } from "@/db/demo";
import { cars, dealers } from "@/db/schema";
import {
  clearLoginAttempts,
  closeDb,
  createDealer,
  createDealerUser,
  deleteDealers,
  deleteUsers,
  type E2eDealer,
  type E2eUser,
} from "./helpers/auth-users";

// Cars are added to the demo dealer under run-unique model names and deleted afterwards.
const ROOT = "http://localhost:3000";
const app = (...segments: string[]) => [ROOT, "_dev", "app", ...segments].join("/");
const SITE = [ROOT, "_dev", "site", DEMO_DEALER_SLUG].join("/");

const IP = `198.51.100.${randomInt(1, 255)}`;
test.use({ extraHTTPHeaders: { "x-forwarded-for": IP } });

// A 1×1 transparent PNG.
const CAR_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const RUN = randomUUID().slice(0, 8);
const modelName = (label: string) => `E2E ${label} ${RUN}`;

const users: E2eUser[] = [];
const models: string[] = [];
let owner: E2eUser;
let salesperson: E2eUser;
let otherDealer: E2eDealer;

test.beforeAll(async () => {
  owner = await createDealerUser({ role: "owner" });
  salesperson = await createDealerUser({ role: "salesperson" });
  users.push(owner, salesperson);
  otherDealer = await createDealer();
});

test.afterAll(async () => {
  const [demo] = await getDb().select({ id: dealers.id }).from(dealers).where(eq(dealers.slug, DEMO_DEALER_SLUG));
  if (demo && models.length) {
    await getDb().delete(cars).where(and(eq(cars.dealerId, demo.id), inArray(cars.model, models)));
  }
  if (otherDealer) await deleteDealers([otherDealer]);
  await deleteUsers(users);
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

async function fillCar(page: Page, car: { make: string; model: string; year: string; price: string }) {
  await page.getByTestId("car-make").fill(car.make);
  await page.getByTestId("car-model").fill(car.model);
  await page.getByTestId("car-year").fill(car.year);
  await page.getByTestId("car-price").fill(car.price);
}

const adminRow = (page: Page, model: string) =>
  page.getByTestId("car-row").filter({ has: page.getByTestId("car-model").getByText(model, { exact: true }) });

const publicCard = (page: Page, model: string) =>
  page.locator("article").filter({ has: page.getByTestId("car-model").getByText(model, { exact: true }) });

async function saveAndFindId(page: Page, model: string): Promise<string> {
  await page.getByTestId("car-save").click();
  await expect(page).toHaveURL(/\/cars(\?.*)?$/);
  const row = adminRow(page, model);
  await expect(row).toHaveCount(1);
  const id = await row.getAttribute("data-car-id");
  expect(id).toBeTruthy();
  return id!;
}

test("added car with an uploaded image shows on the public page, deep links, deactivates and reactivates", async ({
  page,
}) => {
  const model = modelName("Fabia");
  models.push(model);
  await signIn(page, owner);

  await page.goto(app("cars", "new"));
  await fillCar(page, { make: "Škoda", model, year: "2021", price: "15990" });
  await page.getByTestId("car-image-file").setInputFiles({ name: "car.png", mimeType: "image/png", buffer: CAR_PNG });
  const id = await saveAndFindId(page, model);

  await page.goto(SITE);
  const card = publicCard(page, model);
  await expect(card).toHaveCount(1);
  const image = card.getByTestId("car-image");
  await expect(image).toHaveAttribute("src", /^\/api\/files\/cars\/[^/]+\.webp$/);
  const imageRes = await page.request.get(ROOT + (await image.getAttribute("src")));
  expect(imageRes.status()).toBe(200);
  expect(imageRes.headers()["content-type"]).toBe("image/webp");

  await page.goto(`${SITE}?car=${encodeURIComponent(id)}`);
  const first = page.locator('section[aria-labelledby="cars"] article').first();
  await expect(first.getByTestId("car-model")).toHaveText(model);
  await expect(first.getByText(dealerPage.carSelected, { exact: true })).toBeVisible();

  await page.goto(app("cars"));
  await adminRow(page, model).getByTestId("car-deactivate").click();
  await expect(adminRow(page, model)).toHaveCount(0);

  await page.goto(SITE);
  await expect(page.getByRole("heading", { name: /Octavia/ })).toBeVisible();
  await expect(publicCard(page, model)).toHaveCount(0);
  await page.goto(`${SITE}?car=${encodeURIComponent(id)}`);
  await expect(publicCard(page, model)).toHaveCount(0);

  await page.goto(app("cars") + "?status=inactive");
  await adminRow(page, model).getByTestId("car-reactivate").click();
  await expect(adminRow(page, model)).toHaveCount(0);

  await page.goto(SITE);
  await expect(publicCard(page, model)).toHaveCount(1);
});

test("a Salesperson can add and edit a car", async ({ page }) => {
  const model = modelName("Clio");
  const edited = modelName("Clio RS");
  models.push(model, edited);
  await signIn(page, salesperson);

  await page.goto(app("cars", "new"));
  await fillCar(page, { make: "Renault", model, year: "2019", price: "9900" });
  const id = await saveAndFindId(page, model);

  await page.goto(app("cars", id));
  await expect(page.getByTestId("car-model")).toHaveValue(model);
  await page.getByTestId("car-model").fill(edited);
  await page.getByTestId("car-price").fill("10500");
  await page.getByTestId("car-save").click();
  await expect(page).toHaveURL(/\/cars(\?.*)?$/);
  await expect(adminRow(page, edited)).toHaveCount(1);
  await expect(adminRow(page, edited)).toHaveAttribute("data-car-id", id);
  await expect(adminRow(page, model)).toHaveCount(0);
});

test("a failed auto-fill shows the notice and the car can still be saved manually", async ({ page }) => {
  const model = modelName("Golf");
  models.push(model);
  await signIn(page, owner);

  await page.goto(app("cars", "new"));
  await page.getByTestId("car-avtonet-url").fill("https://example.com/oglas/123");
  await page.getByTestId("car-autofill").click();
  const notice = page.getByTestId("car-autofill-notice");
  await expect(notice).toHaveAttribute("data-state", "invalid_url");
  await expect(notice).toBeVisible();

  // A non-avto.net listing URL would be refused on save, so it is cleared before entering the data by hand.
  await page.getByTestId("car-avtonet-url").fill("");
  await fillCar(page, { make: "Volkswagen", model, year: "2018", price: "12400" });
  await saveAndFindId(page, model);
});

test("another dealer's car edit page is a 404", async ({ page }) => {
  const [car] = await getDb()
    .insert(cars)
    .values({ dealerId: otherDealer.id, make: "Tuj", model: modelName("Tuj"), year: 2020, priceEur: 10000, body: "sedan" })
    .returning({ id: cars.id });
  await signIn(page, owner);

  const res = await page.goto(app("cars", car!.id));
  expect(res?.status()).toBe(404);
  await expect(page.getByTestId("car-form")).toHaveCount(0);
});
