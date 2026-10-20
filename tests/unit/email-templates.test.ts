import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderInvitationEmail, renderPasswordResetEmail } from "@/server/notify/templates";
import { messages } from "./i18n";

const m = messages.email;
const link = "https://app.drivebook.si/set-password?token=abc123&x=1";

describe("renderInvitationEmail", () => {
  const base = {
    surface: "dealer" as const,
    recipientEmail: "nina@example.si",
    inviterName: "Marko",
    link,
    expiresAt: "27. 10. 2026 ob 14:30",
  };

  it("includes the link, expiry and subject in html and text", () => {
    const mail = renderInvitationEmail(base);
    expect(mail.subject).toBe(m.invitation.subject);
    expect(mail.html).toContain(`href="${link.replace("&", "&amp;")}"`);
    expect(mail.html).toContain("27. 10. 2026 ob 14:30");
    expect(mail.html).toContain(m.invitation.button);
    expect(mail.text).toContain(link);
    expect(mail.text).toContain("27. 10. 2026 ob 14:30");
    expect(mail.text).toContain("Marko");
  });

  it("uses DriveBook as sender without dealer, the dealer name with one", () => {
    expect(renderInvitationEmail(base).senderName).toBe("DriveBook");
    expect(renderInvitationEmail({ ...base, surface: "backoffice" }).senderName).toBe("DriveBook");
    const mail = renderInvitationEmail({ ...base, dealerName: "Avto Novak" });
    expect(mail.senderName).toBe("Avto Novak");
    expect(mail.subject).toBe(m.invitation.subjectDealer.replace("{dealerName}", "Avto Novak"));
    expect(mail.text).toContain("Avto Novak");
  });

  it("escapes interpolated values in the html", () => {
    const mail = renderInvitationEmail({ ...base, dealerName: "<script>alert(1)</script>", inviterName: "<b>x</b>" });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).not.toContain("<b>x</b>");
    expect(mail.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});

describe("renderPasswordResetEmail", () => {
  const base = { surface: "backoffice" as const, recipientEmail: "ops@drivebook.si", link, validMinutes: 60 };

  it("includes the link, expiry and subject in html and text", () => {
    const mail = renderPasswordResetEmail(base);
    const expiry = m.passwordReset.expiry.replace("{validMinutes}", "60");
    expect(mail.subject).toBe(m.passwordReset.subject);
    expect(mail.html).toContain(`href="${link.replace("&", "&amp;")}"`);
    expect(mail.html).toContain(expiry);
    expect(mail.text).toContain(link);
    expect(mail.text).toContain(expiry);
  });

  it("uses DriveBook as sender without dealer, the dealer name with one", () => {
    expect(renderPasswordResetEmail(base).senderName).toBe("DriveBook");
    const mail = renderPasswordResetEmail({ ...base, surface: "dealer", dealerName: "Avto Novak" });
    expect(mail.senderName).toBe("Avto Novak");
    expect(mail.subject).toBe(m.passwordReset.subjectDealer.replace("{dealerName}", "Avto Novak"));
    expect(mail.html).toContain("Avto Novak");
  });

  it("escapes interpolated values in the html", () => {
    const mail = renderPasswordResetEmail({ ...base, dealerName: "<script>x</script>", recipientEmail: "\"a\"@b.si" });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(mail.html).toContain("&quot;a&quot;@b.si");
  });
});

describe("template source", () => {
  const dir = join(process.cwd(), "src/server/notify/templates");

  it("hardcodes no Slovenian strings (only palette.ts holds hex)", () => {
    for (const file of readdirSync(dir)) {
      const src = readFileSync(join(dir, file), "utf8");
      expect(src, file).not.toMatch(/[čšžČŠŽ]/);
      if (file !== "palette.ts") expect(src, file).not.toMatch(/#[0-9A-Fa-f]{3,6}\b/);
    }
  });
});
