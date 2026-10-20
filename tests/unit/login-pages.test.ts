import { createElement } from "react";
import { prerender } from "react-dom/static";
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { messages } from "./i18n";
import DealerLoginPage, { generateMetadata as dealerMetadata } from "@/app/dealer-admin/login/page";
import BackofficeLoginPage, { generateMetadata as backofficeMetadata } from "@/app/backoffice/login/page";

// Server-side next-intl needs a Next request scope; feed it the real sl messages instead.
vi.mock("next-intl/server", () => ({
  getRequestConfig: <T>(fn: T) => fn,
  getTranslations: async (namespace: "auth") => {
    const { messages } = await import("./i18n");
    return createTranslator({ locale: "sl", messages, namespace });
  },
}));

async function render(Page: () => React.ReactElement) {
  const { prelude } = await prerender(createElement(Page));
  return new Response(prelude).text();
}

const auth = messages.auth;
const pages = [
  { name: "dealer-admin", Page: DealerLoginPage, metadata: dealerMetadata, title: auth.dealerTitle, eyebrow: auth.eyebrowDealer },
  { name: "backoffice", Page: BackofficeLoginPage, metadata: backofficeMetadata, title: auth.backofficeTitle, eyebrow: auth.eyebrowBackoffice },
];

describe.each(pages)("$name login page", ({ Page, metadata, title, eyebrow }) => {
  it("renders the title, eyebrow, labelled fields and placeholder note", async () => {
    const html = await render(Page);
    expect(html).toContain(`>${title}</h1>`);
    expect(html).toContain(eyebrow);
    expect(html).toMatch(new RegExp(`<label for="[^"]+"[^>]*>${auth.email}</label>`));
    expect(html).toMatch(new RegExp(`<label for="[^"]+"[^>]*>${auth.password}</label>`));
    expect(html).toContain('type="email"');
    expect(html).toContain('type="password"');
    expect(html).toContain(auth.placeholderNote);
  });

  it("cannot submit: no form action and a disabled submit button", async () => {
    const html = await render(Page);
    const form = html.match(/<form[^>]*>/)?.[0];
    expect(form).toBeDefined();
    expect(form).not.toMatch(/action=/);
    expect(html).toMatch(new RegExp(`<button type="submit"[^>]*disabled=""[^>]*>${auth.submit}</button>`));
  });

  it("exports the translated metadata title", async () => {
    expect(await metadata()).toEqual({ title });
  });
});
