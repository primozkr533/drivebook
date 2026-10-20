import { emailT, layout, senderNameFor, type RenderedEmail, type Surface } from "./layout";

export type InvitationEmailInput = {
  surface: Surface;
  recipientEmail: string;
  inviterName?: string;
  dealerName?: string;
  link: string;
  expiresAt: string;
};

export function renderInvitationEmail(input: InvitationEmailInput): RenderedEmail {
  const t = emailT;
  const dealerName = input.dealerName?.trim() ? input.dealerName : undefined;
  const surface = t(`surface.${input.surface}`);

  const paragraphs = [
    dealerName ? t("invitation.introDealer", { dealerName }) : t("invitation.intro", { surface }),
    ...(input.inviterName?.trim() ? [t("invitation.invitedBy", { inviterName: input.inviterName })] : []),
    t("invitation.action"),
    t("invitation.expiry", { expiresAt: input.expiresAt }),
  ];

  return layout({
    subject: dealerName ? t("invitation.subjectDealer", { dealerName }) : t("invitation.subject"),
    senderName: senderNameFor(dealerName),
    recipientEmail: input.recipientEmail,
    heading: t("invitation.heading"),
    paragraphs,
    buttonLabel: t("invitation.button"),
    link: input.link,
  });
}
