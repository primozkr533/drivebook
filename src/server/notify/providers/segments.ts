const GSM7_BASIC = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
    "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà",
);
// Extension-table characters take two septets (escape + char).
const GSM7_EXTENDED = new Set("^{}\\[~]|€\f");

export function countSmsSegments(body: string): number {
  let septets = 0;
  let gsm = true;
  for (const ch of body) {
    if (GSM7_BASIC.has(ch)) septets += 1;
    else if (GSM7_EXTENDED.has(ch)) septets += 2;
    else {
      gsm = false;
      break;
    }
  }

  if (gsm) {
    if (septets <= 160) return 1;
    return Math.ceil(septets / 153);
  }

  const units = body.length;
  if (units <= 70) return 1;
  return Math.ceil(units / 67);
}
