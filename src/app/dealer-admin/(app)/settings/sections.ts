export const SETTINGS_SECTIONS = ["dealer", "branding", "booking", "hours", "closures"] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];
