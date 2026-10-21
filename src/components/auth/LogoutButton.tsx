import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui";
import type { AuthSurface } from "@/server/auth/session";
import { logoutAction } from "./actions";

export async function LogoutButton({ surface }: { surface: AuthSurface }) {
  const t = await getTranslations("auth");
  return (
    <form action={logoutAction.bind(null, surface)}>
      <Button type="submit" variant="secondary" size="sm" data-testid="logout">
        {t("logout")}
      </Button>
    </form>
  );
}
