import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { ButtonLink, Card, Container, PageHeader, Stack } from "@/components/ui";
import { getSurfaceBasePath, requireBackofficeUser } from "@/server/auth/permissions";
import { listPlans } from "@/server/data/backoffice/plans";
import { createDealerAction } from "../actions";
import { CreateDealerForm, type CreateDealerLabels } from "../CreateDealerForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("backoffice"))("dealers.new.title") };
}

export default async function BackofficeNewDealerPage() {
  const { user } = await requireBackofficeUser();
  const basePath = await getSurfaceBasePath();
  if (user.role !== "superadmin") redirect(`${basePath}/dealers`);
  const [t, plans] = await Promise.all([getTranslations("backoffice"), listPlans()]);

  const labels: CreateDealerLabels = {
    fields: {
      name: t("dealers.new.fields.name"),
      slug: t("dealers.new.fields.slug"),
      ownerEmail: t("dealers.new.fields.ownerEmail"),
      planId: t("dealers.new.fields.planId"),
      licenceValidUntil: t("dealers.new.fields.licenceValidUntil"),
      notes: t("dealers.new.fields.notes"),
    },
    hints: {
      slug: t("dealers.new.hints.slug"),
      licenceValidUntil: t("dealers.new.hints.licenceValidUntil"),
      notes: t("dealers.new.hints.notes"),
    },
    submit: t("dealers.new.submit"),
    forbidden: t("dealers.new.errors.forbidden"),
    errors: {
      name: { required: t("dealers.new.errors.name.required") },
      slug: {
        format: t("slugErrors.format"),
        length: t("slugErrors.length"),
        reserved: t("slugErrors.reserved"),
        taken: t("slugErrors.taken"),
      },
      ownerEmail: {
        format: t("dealers.new.errors.ownerEmail.format"),
        taken: t("dealers.new.errors.ownerEmail.taken"),
      },
      planId: { unknown: t("dealers.new.errors.planId.unknown") },
      licenceValidUntil: {
        format: t("dealers.new.errors.licenceValidUntil.format"),
        past: t("dealers.new.errors.licenceValidUntil.past"),
      },
    },
  };
  const defaultPlan = plans.find((p) => p.isDefault) ?? plans[0];

  return (
    <Container width="narrow" className="py-10 md:py-16">
      <Stack gap={8}>
        <PageHeader
          title={t("dealers.new.title")}
          description={t("dealers.new.description")}
          actions={
            <ButtonLink variant="quiet" href={`${basePath}/dealers`}>
              {t("dealers.new.back")}
            </ButtonLink>
          }
        />
        <Card>
          <CreateDealerForm
            action={createDealerAction}
            initial={{ name: "", slug: "", ownerEmail: "", planId: defaultPlan?.id ?? "", licenceValidUntil: "", notes: "" }}
            plans={plans.map((p) => ({ id: p.id, name: p.name }))}
            labels={labels}
          />
        </Card>
      </Stack>
    </Container>
  );
}
