import { describe, expect, it } from "vitest";
import { rewriteHtmlLinks, rewriteSurfaceLink } from "@/app/dev/inbox/rewrite-links";

const origins = { dealer: "http://app.drivebook.localhost:3000", backoffice: "http://admin.drivebook.localhost:3000" };

describe("rewriteSurfaceLink", () => {
  it("maps app. and admin. origins to their dev aliases, keeping path, query and hash", () => {
    expect(rewriteSurfaceLink("http://app.drivebook.localhost:3000/reset-password/abc?x=1#top", origins)).toBe(
      "/_dev/app/reset-password/abc?x=1#top",
    );
    expect(rewriteSurfaceLink("http://admin.drivebook.localhost:3000/set-password/tok", origins)).toBe(
      "/_dev/admin/set-password/tok",
    );
    expect(rewriteSurfaceLink("http://APP.drivebook.localhost:3000", origins)).toBe("/_dev/app/");
  });

  it("leaves other URLs alone", () => {
    for (const url of [
      "https://app.drivebook.localhost:3000/login",
      "http://app.drivebook.localhost/login",
      "http://demo.drivebook.localhost:3000/",
      "http://app.drivebook.localhost:3000.evil.example/login",
      "https://drivebook.si/x",
      "mailto:info@drivebook.si",
      ["", "already", "relative"].join("/"),
      "ni url",
    ]) {
      expect(rewriteSurfaceLink(url, origins)).toBe(url);
    }
  });

  it("works with production-style origins without a port", () => {
    const prod = { dealer: "https://app.drivebook.si", backoffice: "https://admin.drivebook.si" };
    expect(rewriteSurfaceLink("https://admin.drivebook.si/login?next=%2Faccount", prod)).toBe("/_dev/admin/login?next=%2Faccount");
    expect(rewriteSurfaceLink("https://app.drivebook.si:8443/login", prod)).toBe("https://app.drivebook.si:8443/login");
  });
});

describe("rewriteHtmlLinks", () => {
  it("rewrites surface hrefs only, leaving link text and other attributes untouched", () => {
    const html = [
      `<a href="http://app.drivebook.localhost:3000/reset-password/abc" style="color:x">http://app.drivebook.localhost:3000/reset-password/abc</a>`,
      `<a href='http://admin.drivebook.localhost:3000/login?a=1&amp;b=2'>prijava</a>`,
      `<a href="https://drivebook.si/">drivebook</a>`,
    ].join("");
    expect(rewriteHtmlLinks(html, origins)).toBe(
      [
        `<a href="/_dev/app/reset-password/abc" style="color:x">http://app.drivebook.localhost:3000/reset-password/abc</a>`,
        `<a href='/_dev/admin/login?a=1&amp;b=2'>prijava</a>`,
        `<a href="https://drivebook.si/">drivebook</a>`,
      ].join(""),
    );
  });
});
