import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Badge, Card, CardHeader, Container, Grid, PageHeader, Stack, Stat, Text } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/date";
import { listDealerUsers, type DealerUserListItem, type DealerUserStatus } from "@/server/data/dealer-users";
import { AccessDenied, requireOwnerPage } from "../owner-gate";
import {
  changeDealerUserRoleAction,
  deactivateDealerUserAction,
  inviteDealerUserAction,
  reactivateDealerUserAction,
} from "./actions";
import { ChangeRoleForm, InviteDealerUserForm, UserStatusForm, type DealerUserErrors } from "./DealerUserForms";
import { savedChange, savedFormKey } from "./saved";

const statusTone = { active: "ok", invited: "warn", deactivated: "neutral" } as const satisfies Record<DealerUserStatus, string>;
const errorKeys = [
  "email",
  "name",
  "role",
  "taken",
  "limit_reached",
  "last_owner",
  "not_deactivated",
  "forbidden",
  "readOnly",
] as const satisfies readonly (keyof DealerUserErrors)[];

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("dealerUsers"))("title") };
}

type Props = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

export default async function DealerUsersPage({ searchParams }: Props) {
  const gate = await requireOwnerPage();
  if (!gate.ok) {
    return (
      <Container className="py-10 md:py-16">
        <AccessDenied />
      </Container>
    );
  }
  const [query, t, list] = await Promise.all([searchParams, getTranslations("dealerUsers"), listDealerUsers(gate.ctx)]);
  const formKey = savedFormKey(query);
  const saved = savedChange(query);
  const errors = Object.fromEntries(errorKeys.map((key) => [key, t(`errors.${key}`)])) as DealerUserErrors;
  const roles = { owner: t("roles.owner"), salesperson: t("roles.salesperson") };
  const atLimit = list.maxUsers !== null && list.used >= list.maxUsers;
  const lastLogin = (d: Date | null) => (d ? `${formatDate(d)} ${formatTime(d)}` : t("never"));

  const nameCell = (u: DealerUserListItem) => (
    <span className="flex flex-wrap items-center gap-2">
      <span className="font-[650] text-ink" data-testid="dealer-user-name">
        {u.name}
      </span>
      {u.id === gate.user.id && (
        <Text as="span" size="small" tone="muted">
          ({t("you")})
        </Text>
      )}
    </span>
  );
  const statusBadge = (u: DealerUserListItem) => (
    <span data-testid="dealer-user-status" data-status={u.status}>
      <Badge tone={statusTone[u.status]}>{t(`statuses.${u.status}`)}</Badge>
    </span>
  );
  const actions = (u: DealerUserListItem) => (
    <div className="flex flex-wrap items-end gap-4">
      <ChangeRoleForm
        key={`role:${formKey}`}
        action={changeDealerUserRoleAction}
        userId={u.id}
        role={u.role}
        labels={{ role: t("actions.role"), roles, submit: t("actions.saveRole"), errors }}
      />
      {u.status === "deactivated" ? (
        <UserStatusForm
          key={`reactivate:${formKey}`}
          action={reactivateDealerUserAction}
          userId={u.id}
          kind="reactivate"
          labels={{ submit: t("actions.reactivate"), errors }}
        />
      ) : (
        <UserStatusForm
          key={`deactivate:${formKey}`}
          action={deactivateDealerUserAction}
          userId={u.id}
          kind="deactivate"
          labels={{ submit: t("actions.deactivate"), errors }}
        />
      )}
    </div>
  );
  const columns = ["name", "email", "role", "status", "lastLogin", "actions"] as const;

  return (
    <Container className="py-10 md:py-16">
      <Stack gap={8}>
        <PageHeader title={t("title")} description={t("description")} />
        <Stat
          label={t("usage.label")}
          value={
            <span data-testid="dealer-users-usage">
              {t("usage.value", { used: list.used, max: list.maxUsers ?? t("usage.unlimited") })}
            </span>
          }
          note={t("usage.note")}
        />
        {saved ? (
          <Text size="small" tone="ink" role="status" data-testid="dealer-users-saved" data-state={saved}>
            {t(`saved.${saved}`)}
          </Text>
        ) : null}
        <Grid cols={12} from="lg" className="items-start">
          <div className="min-w-0 lg:col-span-8" data-testid="dealer-users">
            {list.users.length === 0 ? (
              <Card tone="sunken" data-testid="dealer-users-empty">
                <Text>{t("empty")}</Text>
              </Card>
            ) : (
              <>
                <Card pad="none" className="hidden overflow-x-auto md:block">
                  <table className="w-full text-left text-body" data-testid="dealer-users-table">
                    <caption className="sr-only">{t("listTitle")}</caption>
                    <thead>
                      <tr className="border-b border-line-strong">
                        {columns.map((c) => (
                          <th key={c} scope="col" className="type-utility px-4 py-3 text-muted">
                            {t(`columns.${c}`)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {list.users.map((u) => (
                        <tr
                          key={u.id}
                          className="border-b border-line align-top last:border-b-0"
                          data-testid="dealer-user-row"
                          data-email={u.email}
                        >
                          <td className="px-4 py-3">{nameCell(u)}</td>
                          <td className="px-4 py-3 text-ink">{u.email}</td>
                          <td className="px-4 py-3">
                            <Badge dot={false}>{roles[u.role]}</Badge>
                          </td>
                          <td className="px-4 py-3">{statusBadge(u)}</td>
                          <td className="type-utility px-4 py-3 text-ink-2">{lastLogin(u.lastLoginAt)}</td>
                          <td className="px-4 py-3">{actions(u)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
                <ul className="flex flex-col gap-3 md:hidden" data-testid="dealer-users-cards">
                  {list.users.map((u) => (
                    <li key={u.id}>
                      <Card pad="sm" data-testid="dealer-user-card" data-email={u.email}>
                        <Stack gap={3}>
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            {nameCell(u)}
                            {statusBadge(u)}
                          </div>
                          <Text size="small" className="break-all">
                            {u.email}
                          </Text>
                          <dl className="grid grid-cols-2 gap-2">
                            <div>
                              <dt className="type-utility text-muted">{t("columns.role")}</dt>
                              <dd className="text-small text-ink">{roles[u.role]}</dd>
                            </div>
                            <div>
                              <dt className="type-utility text-muted">{t("columns.lastLogin")}</dt>
                              <dd className="text-small text-ink">{lastLogin(u.lastLoginAt)}</dd>
                            </div>
                          </dl>
                          {actions(u)}
                        </Stack>
                      </Card>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <Card className="lg:col-span-4" data-testid="dealer-user-invite">
            <CardHeader title={t("invite.title")} />
            <InviteDealerUserForm
              key={formKey}
              action={inviteDealerUserAction}
              disabledReason={atLimit ? t("invite.limitReached", { max: list.maxUsers ?? 0 }) : undefined}
              labels={{
                email: t("invite.fields.email"),
                name: t("invite.fields.name"),
                role: t("invite.fields.role"),
                roles,
                hint: t("invite.hint"),
                submit: t("invite.submit"),
                errors,
              }}
            />
          </Card>
        </Grid>
      </Stack>
    </Container>
  );
}
