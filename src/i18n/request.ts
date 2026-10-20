import { getRequestConfig } from "next-intl/server";
import common from "../../messages/sl/common.json";
import dealerPage from "../../messages/sl/dealerPage.json";
import auth from "../../messages/sl/auth.json";
import privacy from "../../messages/sl/privacy.json";
import errors from "../../messages/sl/errors.json";

export const locale = "sl";
export const timeZone = "Europe/Ljubljana";

export const messages = { common, dealerPage, auth, privacy, errors };

export default getRequestConfig(async () => ({ locale, timeZone, messages }));
