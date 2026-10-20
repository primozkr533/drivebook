import { createTranslator } from "next-intl";
import email from "../../../../messages/sl/email.json";
import { EMAIL_FONTS as F, EMAIL_PALETTE as P } from "./palette";

export type Surface = "dealer" | "backoffice";

export type RenderedEmail = { subject: string; html: string; text: string; senderName: string };

export const emailT = createTranslator({ locale: "sl", messages: { email }, namespace: "email" });

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function senderNameFor(dealerName?: string): string {
  return dealerName?.trim() ? dealerName : emailT("platformName");
}

type LayoutInput = {
  subject: string;
  senderName: string;
  recipientEmail: string;
  heading: string;
  paragraphs: string[];
  buttonLabel: string;
  link: string;
};

export function layout(input: LayoutInput): RenderedEmail {
  const footer = emailT("footer", { recipientEmail: input.recipientEmail });
  const fallback = emailT("linkFallback");
  const e = escapeHtml;
  const link = e(input.link);

  const paragraphs = input.paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:${P.ink2};">${e(p)}</p>`)
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="sl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(input.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${P.ground};font-family:${F.body};color:${P.ink};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${P.ground};">
<tr><td align="left" style="padding:24px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${P.surface};border:1px solid ${P.line};">
<tr><td style="background:${P.signal};color:${P.onSignal};padding:16px 24px;font-family:${F.mono};font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;">${e(input.senderName)}</td></tr>
<tr><td style="padding:32px 24px 8px;">
<h1 style="margin:0 0 24px;font-size:24px;line-height:1.15;font-weight:800;text-transform:uppercase;letter-spacing:0.01em;color:${P.ink};">${e(input.heading)}</h1>
${paragraphs}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
<tr><td style="background:${P.signal};border:2px solid ${P.ink};">
<a href="${link}" style="display:inline-block;padding:12px 24px;font-size:16px;font-weight:700;color:${P.onSignal};text-decoration:none;">${e(input.buttonLabel)}</a>
</td></tr>
</table>
<p style="margin:0 0 8px;font-size:14px;line-height:1.45;color:${P.muted};">${e(fallback)}</p>
<p style="margin:0 0 24px;font-family:${F.mono};font-size:13px;line-height:1.4;word-break:break-all;"><a href="${link}" style="color:${P.signalInk};">${link}</a></p>
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px dashed ${P.line};font-size:12px;line-height:1.4;color:${P.muted};">${e(footer)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;

  const text = [
    input.senderName.toUpperCase(),
    "",
    input.heading.toUpperCase(),
    "",
    ...input.paragraphs.flatMap((p) => [p, ""]),
    `${input.buttonLabel}: ${input.link}`,
    "",
    "--",
    footer,
    "",
  ].join("\n");

  return { subject: input.subject, html, text, senderName: input.senderName };
}
