import { getRequestConfig } from "next-intl/server";
import common from "../../messages/sl/common.json";
import dealerPage from "../../messages/sl/dealerPage.json";
import auth from "../../messages/sl/auth.json";
import privacy from "../../messages/sl/privacy.json";
import errors from "../../messages/sl/errors.json";
import dev from "../../messages/sl/dev.json";
import email from "../../messages/sl/email.json";
import account from "../../messages/sl/account.json";
import inbox from "../../messages/sl/inbox.json";
import backoffice from "../../messages/sl/backoffice.json";
import holidays from "../../messages/sl/holidays.json";
import settings from "../../messages/sl/settings.json";
import settingsDealer from "../../messages/sl/settingsDealer.json";
import settingsBranding from "../../messages/sl/settingsBranding.json";
import settingsBooking from "../../messages/sl/settingsBooking.json";
import settingsHours from "../../messages/sl/settingsHours.json";
import settingsClosures from "../../messages/sl/settingsClosures.json";
import dealerUsers from "../../messages/sl/dealerUsers.json";

export const locale = "sl";
export const timeZone = "Europe/Ljubljana";

export const messages = { common, dealerPage, auth, privacy, errors, dev, email, account, inbox, backoffice, holidays,
  settings, settingsDealer, settingsBranding, settingsBooking, settingsHours, settingsClosures, dealerUsers };

export default getRequestConfig(async () => ({ locale, timeZone, messages }));
