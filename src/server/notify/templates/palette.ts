// Mirrors the light values in src/styles/tokens.css: e-mail clients can't read CSS variables.
// The only allowed hex use outside tokens.css, and only for e-mail.
export const EMAIL_PALETTE = {
  ground: "#F2F1EE",
  surface: "#FBFAF8",
  ink: "#17140F",
  ink2: "#3B3631",
  muted: "#6F6862",
  line: "#D8D4CE",
  signal: "#FF4F0F",
  signalInk: "#B83A06",
  onSignal: "#17140F",
} as const;

export const EMAIL_FONTS = {
  body: "Archivo, 'Helvetica Neue', Arial, sans-serif",
  mono: "'JetBrains Mono', Menlo, monospace",
} as const;
