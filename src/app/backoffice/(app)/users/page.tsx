import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Badge, Card, CardHeader, Container, Grid, PageHeader, Stack, Text } from "@/components/ui";
import { requireBackofficeUser } from "@/server/auth/permissions";
import { listBackofficeUsers, type BackofficeUserStatus } from "@/server/data/backoffice/users";
import { deactivateUserAction, inviteUserAction } from "./actions";
import { DeactivateUserForm, InviteUserForm, type UserErrors } from "./UserForms";
import { savedFormKey } from "../saved";

const statusTone = { active: "ok", invited: "warn", deactivated: "neutral" } as const satisfies Record<BackofficeUserStatus, string>;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("backoffice"))("users.title") };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function BackofficeUsersPage({ searchParams }: Props) {
  const { user } = await requireBackofficeUser();
  const [query, t, users] = await Promise.all([searchParams, getTranslations("backoffice"), listBackofficeUsers()]);
  const formKey = savedFormKey(query);
  const canManage = user.role === "superadmin";
  const columns = ["email", "role", "status"] as const;
  const errors: UserErrors = {
    email: t("users.errors.email"),
    role: t("users.errors.role"),
    taken: t("users.errors.taken"),
    self: t("users.errors.self"),
    notFound: t("users.errors.notFound"),
    forbidden: t("users.errors.forbidden"),
  };

  const list = (
    <Stack gap={3} className={canManage ? "min-w-0 lg:col-span-8" : undefined}>
      <Text size="small" tone="muted" data-testid="users-count">
        {t("users.count", { count: users.length })}
      </Text>
      {users.length === 0 ? (
        <Card tone="sunken" data-testid="users-empty">
          <Text>{t("users.empty")}</Text>
        </Card>
      ) : (
        <Card pad="none" className="overflow-x-auto">
          <table className="w-full min-w-narrow text-left text-body" data-testid="users-table">
            <thead>
              <tr className="border-b border-line-strong">
                {columns.map((c) => (
                  <th key={c} scope="col" className="type-utility px-4 py-3 text-muted">
                    {t(`users.columns.${c}`)}
                  </th>
                ))}
                {canManage && <th scope="col" className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-line last:border-b-0" data-testid="user-row" data-status={u.status}>
                  <td className="px-4 py-3 text-ink">
                    <span className="flex flex-wrap items-center gap-2">
                      <span data-testid="user-email">{u.email}</span>
                      {u.id === user.id && (
                        <Text as="span" size="small" tone="muted">
                          ({t("users.you")})
                        </Text>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge dot={false}>{t(`users.roles.${u.role}`)}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone[u.status]}>{t(`users.statuses.${u.status}`)}</Badge>
                  </td>
                  {canManage && (
                    <td className="px-4 py-3">
                      {u.status !== "deactivated" && u.id !== user.id && (
                        <DeactivateUserForm
                          key={formKey}
                          action={deactivateUserAction.bind(null, u.id)}
                          labels={{ submit: t("users.deactivate"), errors }}
                        />
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </Stack>
  );

  return (
    <Container className="py-10 md:py-16">
      <Stack gap={8}>
        <PageHeader title={t("users.title")} description={t("users.description")} />
        {canManage ? (
          <Grid cols={12} from="lg" className="items-start">
            {list}
            <Card className="lg:col-span-4">
              <CardHeader title={t("users.inviteTitle")} />
              <InviteUserForm
                key={formKey}
                action={inviteUserAction}
                labels={{
                  email: t("users.fields.email"),
                  role: t("users.fields.role"),
                  roles: { support: t("users.roles.support"), superadmin: t("users.roles.superadmin") },
                  hint: t("users.inviteHint"),
                  submit: t("users.invite"),
                  errors,
                }}
              />
            </Card>
          </Grid>
        ) : (
          list
        )}
      </Stack>
    </Container>
  );
}
