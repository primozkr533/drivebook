import { getRequestConfig } from "next-intl/server";

// Only Slovenian is active in v1. EN/HR/IT are added by dropping a messages file in /messages.
export default getRequestConfig(async () => {
  const locale = "sl";
  return {
    locale,
    timeZone: "Europe/Ljubljana",
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
