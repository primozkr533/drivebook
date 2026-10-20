import { emailT, layout, senderNameFor, type RenderedEmail, type Surface } from "./layout";

export type PasswordResetEmailInput = {
  surface: Surface;
  recipientEmail: string;
  dealerName?: string;
  link: string;
  validMinutes: number;
};

export function renderPasswordResetEmail(input: PasswordResetEmailInput): RenderedEmail {
  const t = emailT;
  const dealerName = input.dealerName?.trim() ? input.dealerName : undefined;
  const surface = t(`surface.${input.surface}`);

  return layout({
    subject: dealerName ? t("passwordReset.subjectDealer", { dealerName }) : t("passwordReset.subject"),
    senderName: senderNameFor(dealerName),
    recipientEmail: input.recipientEmail,
    heading: t("passwordReset.heading"),
    paragraphs: [
      dealerName ? t("passwordReset.introDealer", { dealerName }) : t("passwordReset.intro", { surface }),
      t("passwordReset.expiry", { validMinutes: input.validMinutes }),
      t("passwordReset.ignore"),
    ],
    buttonLabel: t("passwordReset.button"),
    link: input.link,
  });
}
