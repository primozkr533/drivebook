// Real-database tests: start Postgres with `docker compose up -d db`. They use TEST_DATABASE_URL
// (default postgres://drivebook:drivebook@localhost:5432/drivebook_test), never the dev database.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  auditLog,
  bookingRules,
  authTokens,
  backofficeSessions,
  backofficeUsers,
  cars,
  dealerLicenceHistory,
  dealers,
  dealerSessions,
  dealerUsers,
  dealerClosures,
  holidayOverrides,
  openingHours,
  messageLog,
  passwordResetRequests,
  plans,
} from "@/db/schema";
import { getTestDb, truncateAll } from "../setup/db";

const db = getTestDb();

function pgCode(error: unknown): string | undefined {
  let current: unknown = error;
  while (current instanceof Error) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = current.cause;
  }
  return undefined;
}

async function expectPgError(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error, `expected Postgres error ${code}`).toBeDefined();
  expect(pgCode(error)).toBe(code);
}

async function insertDealer() {
  const [plan] = await db
    .insert(plans)
    .values({ code: "basic", name: "Basic", maxCars: 20, maxUsers: 5, monthlySmsQuota: 100, priceEurCents: 4900 })
    .returning();
  const [dealer] = await db
    .insert(dealers)
    .values({
      slug: "avto-test",
      name: "Avto Test",
      legalName: "Avto Test d.o.o.",
      addressLine: "Dunajska cesta 1",
      postalCode: "1000",
      city: "Ljubljana",
      phone: "+38611234567",
      email: "info@avto-test.si",
      primaryColor: "#E4572E",
      planId: plan.id,
    })
    .returning();
  return { plan, dealer };
}

beforeEach(truncateAll);

afterAll(async () => {
  await db.$client.end();
});

describe("phase-1 schema", () => {
  it("applies migrations with btree_gist enabled", async () => {
    const result = await db.execute(sql`SELECT extname FROM pg_extension WHERE extname = 'btree_gist'`);
    expect(result.rows).toHaveLength(1);
  });

  it("stores every timestamp as timestamptz", async () => {
    const result = await db.execute(sql`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND data_type = 'timestamp without time zone'`);
    expect(result.rows).toEqual([]);
  });

  it("rejects overlapping licence periods for one dealer", async () => {
    const { plan, dealer } = await insertDealer();
    await db.insert(dealerLicenceHistory).values({
      dealerId: dealer.id,
      planId: plan.id,
      validFrom: new Date("2026-01-01T00:00:00Z"),
      validTo: new Date("2026-07-01T00:00:00Z"),
      validUntil: "2026-06-30",
      note: "first",
    });
    await expectPgError(
      db.insert(dealerLicenceHistory).values({
        dealerId: dealer.id,
        planId: plan.id,
        validFrom: new Date("2026-06-01T00:00:00Z"),
        validUntil: "2026-12-31",
        note: "overlaps",
      }),
      "23P01",
    );
    await db.insert(dealerLicenceHistory).values({
      dealerId: dealer.id,
      planId: plan.id,
      validFrom: new Date("2026-07-01T00:00:00Z"),
      validUntil: "2026-12-31",
      note: "adjacent",
    });
  });

  it("gives cars a non-sequential 16-character base62 id", async () => {
    const { dealer } = await insertDealer();
    const base = { dealerId: dealer.id, make: "Škoda", model: "Octavia", year: 2022, priceEur: 21900, body: "estate" as const };
    const inserted = await db
      .insert(cars)
      .values([
        { ...base, avtoNetUrl: "https://www.avto.net/Ads/details.asp?id=1" },
        { ...base, avtoNetUrl: "https://www.avto.net/Ads/details.asp?id=2" },
      ])
      .returning({ id: cars.id });
    const ids = inserted.map((car) => car.id);
    for (const id of ids) expect(id).toMatch(/^[0-9A-Za-z]{16}$/);
    expect(ids[0]).not.toBe(ids[1]);
    expect(ids.some((id) => /^\d+$/.test(id))).toBe(false);
  });

  it("has the car admin columns, active defaulting to true, and a (dealer_id, active) index", async () => {
    const result = await db.execute<{ column_name: string; data_type: string; is_nullable: string; column_default: string | null }>(sql`
      SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'cars'`);
    const columns = new Map(result.rows.map((r) => [r.column_name, r]));
    const expected: Record<string, [string, string]> = {
      make: ["text", "NO"],
      model: ["text", "NO"],
      year: ["integer", "NO"],
      price_eur: ["integer", "NO"],
      image_key: ["text", "YES"],
      avto_net_url: ["text", "YES"],
      active: ["boolean", "NO"],
      created_at: ["timestamp with time zone", "NO"],
      updated_at: ["timestamp with time zone", "NO"],
    };
    for (const [name, [type, nullable]] of Object.entries(expected)) {
      expect(columns.get(name)?.data_type, name).toBe(type);
      expect(columns.get(name)?.is_nullable, name).toBe(nullable);
    }
    expect(columns.get("active")?.column_default).toBe("true");
    expect(columns.get("created_at")?.column_default).toBe("now()");
    expect(columns.get("updated_at")?.column_default).toBe("now()");

    const { dealer } = await insertDealer();
    const [car] = await db
      .insert(cars)
      .values({
        dealerId: dealer.id,
        make: "Škoda",
        model: "Fabia",
        year: 2020,
        priceEur: 11900,
        body: "sedan",
        avtoNetUrl: "https://www.avto.net/Ads/details.asp?id=3",
      })
      .returning();
    expect(car.active).toBe(true);
    expect(car.imageKey).toBeNull();

    const indexes = await db.execute<{ indexdef: string }>(sql`
      SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'cars_dealer_id_active_idx'`);
    expect(indexes.rows[0]?.indexdef).toContain("(dealer_id, active)");
  });

  it("keeps dealer user emails lowercased and unique across dealers", async () => {
    const { plan, dealer } = await insertDealer();
    const [other] = await db
      .insert(dealers)
      .values({
        slug: "avto-drugi",
        name: "Avto Drugi",
        legalName: "Avto Drugi d.o.o.",
        addressLine: "Celovška cesta 1",
        postalCode: "1000",
        city: "Ljubljana",
        phone: "+38611234568",
        email: "info@avto-drugi.si",
        primaryColor: "#E4572E",
        planId: plan.id,
      })
      .returning();
    const [user] = await db
      .insert(dealerUsers)
      .values({ dealerId: dealer.id, email: "sales@avto-test.si", name: "A", role: "salesperson" })
      .returning();
    expect(user).toMatchObject({ status: "invited", passwordHash: null, totpSecretEnc: null, lastLoginAt: null });
    await expectPgError(
      db.insert(dealerUsers).values({ dealerId: other.id, email: "sales@avto-test.si", name: "B", role: "salesperson" }),
      "23505",
    );
    await expectPgError(
      db.insert(dealerUsers).values({ dealerId: dealer.id, email: "Boss@avto-test.si", name: "C", role: "owner" }),
      "23514",
    );
    await expectPgError(
      db.insert(backofficeUsers).values({ email: "Admin@drivebook.si", name: "D", role: "support" }),
      "23514",
    );
  });

  it("keeps dealer and backoffice sessions in separate tables with unique token hashes", async () => {
    const { dealer } = await insertDealer();
    const [user] = await db
      .insert(dealerUsers)
      .values({ dealerId: dealer.id, email: "owner@avto-test.si", name: "Owner", role: "owner" })
      .returning();
    const [admin] = await db
      .insert(backofficeUsers)
      .values({ email: "admin@drivebook.si", name: "Admin", role: "superadmin" })
      .returning();
    const expiresAt = new Date("2026-12-31T00:00:00Z");

    await db.insert(dealerSessions).values({ tokenHash: "a".repeat(64), userId: user.id, expiresAt });
    await expectPgError(
      db.insert(dealerSessions).values({ tokenHash: "a".repeat(64), userId: user.id, expiresAt }),
      "23505",
    );
    await db.insert(backofficeSessions).values({ tokenHash: "b".repeat(64), userId: admin.id, expiresAt });
    await expectPgError(
      db.insert(backofficeSessions).values({ tokenHash: "b".repeat(64), userId: admin.id, expiresAt }),
      "23505",
    );
    // A dealer user id is not a valid backoffice session owner.
    await expectPgError(
      db.insert(backofficeSessions).values({ tokenHash: "c".repeat(64), userId: user.id, expiresAt }),
      "23503",
    );

    await db.delete(dealerUsers);
    expect(await db.select().from(dealerSessions)).toEqual([]);
  });

  it("rejects a reused auth token hash", async () => {
    const values = {
      surface: "dealer" as const,
      userId: "00000000-0000-4000-8000-000000000001",
      purpose: "invite" as const,
      tokenHash: "d".repeat(64),
      expiresAt: new Date("2026-12-31T00:00:00Z"),
    };
    await db.insert(authTokens).values(values);
    await expectPgError(db.insert(authTokens).values({ ...values, purpose: "reset" }), "23505");
  });

  it("allows message_log rows without a dealer", async () => {
    const [row] = await db
      .insert(messageLog)
      .values({ channel: "email", provider: "fake", recipient: "admin@drivebook.si", template: "reset" })
      .returning();
    expect(row).toMatchObject({ dealerId: null, status: "queued", smsSegments: null });
  });

  it("creates the auth and notification tables with their key columns", async () => {
    const result = await db.execute<{ table_name: string; column_name: string; is_nullable: string }>(sql`
      SELECT table_name, column_name, is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name IN (
        'dealer_users', 'backoffice_users', 'dealer_sessions', 'backoffice_sessions', 'auth_tokens',
        'login_attempts', 'message_log', 'dev_outbox', 'audit_log', 'password_reset_requests')`);
    const columns = new Map(result.rows.map((r) => [`${r.table_name}.${r.column_name}`, r.is_nullable]));
    const expected: Record<string, "YES" | "NO"> = {
      "dealer_users.password_hash": "YES",
      "dealer_users.status": "NO",
      "dealer_users.totp_secret_enc": "YES",
      "dealer_users.totp_enabled_at": "YES",
      "dealer_users.last_login_at": "YES",
      "dealer_users.totp_last_step": "YES",
      "backoffice_users.status": "NO",
      "backoffice_users.totp_secret_enc": "YES",
      "backoffice_users.totp_enabled_at": "YES",
      "backoffice_users.last_login_at": "YES",
      "backoffice_users.totp_last_step": "YES",
      "dealer_sessions.token_hash": "NO",
      "dealer_sessions.user_id": "NO",
      "dealer_sessions.last_seen_at": "NO",
      "dealer_sessions.expires_at": "NO",
      "backoffice_sessions.token_hash": "NO",
      "backoffice_sessions.user_id": "NO",
      "auth_tokens.surface": "NO",
      "auth_tokens.purpose": "NO",
      "auth_tokens.used_at": "YES",
      "login_attempts.surface": "NO",
      "login_attempts.email": "NO",
      "login_attempts.success": "NO",
      "message_log.dealer_id": "YES",
      "message_log.sms_segments": "YES",
      "message_log.provider_message_id": "YES",
      "message_log.error": "YES",
      "dev_outbox.sender": "NO",
      "dev_outbox.subject": "YES",
      "dev_outbox.text_body": "NO",
      "dev_outbox.html_body": "YES",
      "audit_log.dealer_id": "YES",
      "audit_log.actor_kind": "NO",
      "audit_log.actor_id": "YES",
      "audit_log.action": "NO",
      "audit_log.data": "NO",
      "password_reset_requests.id": "NO",
      "password_reset_requests.surface": "NO",
      "password_reset_requests.ip": "NO",
      "password_reset_requests.created_at": "NO",
    };
    for (const [column, nullable] of Object.entries(expected)) {
      expect(columns.get(column), column).toBe(nullable);
    }
    expect(columns.has("dealer_users.active")).toBe(false);

    const indexes = await db.execute<{ indexname: string }>(sql`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename IN (
        'dealer_sessions', 'backoffice_sessions', 'login_attempts', 'password_reset_requests')`);
    expect(indexes.rows.map((r) => r.indexname)).toEqual(
      expect.arrayContaining([
        "dealer_sessions_user_id_idx",
        "backoffice_sessions_user_id_idx",
        "login_attempts_surface_email_created_at_idx",
        "login_attempts_surface_ip_created_at_idx",
        "password_reset_requests_surface_ip_created_at_idx",
      ]),
    );
  });

  it("stores totp_last_step as a nullable bigint on both user tables", async () => {
    const result = await db.execute<{ table_name: string; data_type: string; column_default: string | null }>(sql`
      SELECT table_name, data_type, column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'totp_last_step' ORDER BY table_name`);
    expect(result.rows).toEqual([
      { table_name: "backoffice_users", data_type: "bigint", column_default: null },
      { table_name: "dealer_users", data_type: "bigint", column_default: null },
    ]);

    const { dealer } = await insertDealer();
    const [user] = await db
      .insert(dealerUsers)
      .values({ dealerId: dealer.id, email: "owner@avto-test.si", name: "Owner", role: "owner" })
      .returning();
    expect(user.totpLastStep).toBeNull();
    const [admin] = await db
      .insert(backofficeUsers)
      .values({ email: "admin@drivebook.si", name: "Admin", role: "superadmin", totpLastStep: 59_000_000 })
      .returning();
    expect(admin.totpLastStep).toBe(59_000_000);
  });

  it("logs password reset requests per surface and ip without a dealer", async () => {
    const [row] = await db.insert(passwordResetRequests).values({ surface: "backoffice", ip: "203.0.113.7" }).returning();
    expect(row).toMatchObject({ surface: "backoffice", ip: "203.0.113.7" });
    expect(row.createdAt).toBeInstanceOf(Date);
    await expectPgError(db.execute(sql`INSERT INTO password_reset_requests (surface) VALUES ('dealer')`), "23502");
  });

  it("adds the backoffice operator columns to dealers, plans, licence history and holidays", async () => {
    const result = await db.execute<{
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>(sql`
      SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name IN (
        'dealers', 'plans', 'dealer_licence_history', 'dealer_slug_history', 'holiday_overrides')`);
    const columns = new Map(result.rows.map((r) => [`${r.table_name}.${r.column_name}`, r]));
    const expected: Record<string, [string, "YES" | "NO"]> = {
      "dealers.notes": ["text", "YES"],
      "dealers.dpa_signed": ["boolean", "NO"],
      "dealers.dpa_signed_at": ["date", "YES"],
      "dealers.licence_valid_until": ["date", "YES"],
      "dealers.plan_id": ["uuid", "NO"],
      "plans.name": ["text", "NO"],
      "plans.monthly_sms_quota": ["integer", "NO"],
      "plans.max_users": ["integer", "YES"],
      "plans.notes": ["text", "YES"],
      "dealer_licence_history.dealer_id": ["uuid", "NO"],
      "dealer_licence_history.previous_valid_until": ["date", "YES"],
      "dealer_licence_history.valid_until": ["date", "NO"],
      "dealer_licence_history.note": ["text", "NO"],
      "dealer_licence_history.created_by_backoffice_user_id": ["uuid", "YES"],
      "dealer_licence_history.created_at": ["timestamp with time zone", "NO"],
      "dealer_slug_history.dealer_id": ["uuid", "NO"],
      "dealer_slug_history.slug": ["text", "NO"],
      "dealer_slug_history.replaced_at": ["timestamp with time zone", "NO"],
      "holiday_overrides.date": ["date", "NO"],
      "holiday_overrides.key": ["text", "YES"],
      "holiday_overrides.name": ["text", "NO"],
    };
    for (const [column, [dataType, nullable]] of Object.entries(expected)) {
      expect(columns.get(column), column).toMatchObject({ data_type: dataType, is_nullable: nullable });
    }
    expect(columns.get("dealers.dpa_signed")?.column_default).toBe("false");
    expect(columns.get("plans.monthly_sms_quota")?.column_default).toBe("300");
    expect(columns.has("plans.sms_included")).toBe(false);

    const indexes = await db.execute<{ indexname: string; indexdef: string }>(sql`
      SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename IN (
        'plans', 'dealer_licence_history', 'dealer_slug_history', 'holiday_overrides')`);
    const indexDefs = new Map(indexes.rows.map((r) => [r.indexname, r.indexdef]));
    expect(indexDefs.get("dealer_licence_history_dealer_id_created_at_idx")).toContain("(dealer_id, created_at)");
    expect(indexDefs.get("plans_name_unique")).toContain("UNIQUE");
    expect(indexDefs.get("dealer_slug_history_slug_unique")).toContain("UNIQUE");
    expect(indexDefs.get("holiday_overrides_dealer_date_unique")).toContain("(dealer_id, date)");
  });

  it("stores licence extensions, dealer defaults, holiday keys and unique plan names", async () => {
    const { plan, dealer } = await insertDealer();
    expect(dealer).toMatchObject({ notes: null, dpaSigned: false, dpaSignedAt: null, licenceValidUntil: null });
    expect(plan).toMatchObject({ monthlySmsQuota: 100, notes: null });

    const [defaults] = await db
      .insert(plans)
      .values({ code: "pro", name: "Pro", maxCars: 100, maxUsers: 20, priceEurCents: 9900 })
      .returning();
    expect(defaults.monthlySmsQuota).toBe(300);
    await expectPgError(
      db.insert(plans).values({ code: "basic-2", name: "Basic", maxCars: 20, maxUsers: 5, priceEurCents: 4900 }),
      "23505",
    );

    const [admin] = await db
      .insert(backofficeUsers)
      .values({ email: "admin@drivebook.si", name: "Admin", role: "superadmin" })
      .returning();
    const [entry] = await db
      .insert(dealerLicenceHistory)
      .values({
        dealerId: dealer.id,
        planId: plan.id,
        validFrom: new Date("2026-01-01T00:00:00Z"),
        previousValidUntil: "2026-12-31",
        validUntil: "2027-12-31",
        note: "Podaljšanje",
        createdByBackofficeUserId: admin.id,
      })
      .returning();
    expect(entry).toMatchObject({ previousValidUntil: "2026-12-31", validUntil: "2027-12-31", createdByBackofficeUserId: admin.id });

    const [holiday] = await db
      .insert(holidayOverrides)
      .values({ dealerId: dealer.id, date: "2026-12-25", key: "christmas", name: "Božič" })
      .returning();
    expect(holiday).toMatchObject({ date: "2026-12-25", key: "christmas", name: "Božič", openAnyway: false });
    await expectPgError(
      db.insert(holidayOverrides).values({ dealerId: dealer.id, date: "2026-12-25", name: "Dvojnik" }),
      "23505",
    );
  });

  it("accepts platform-level audit rows with a backoffice actor and no dealer", async () => {
    const [admin] = await db
      .insert(backofficeUsers)
      .values({ email: "admin@drivebook.si", name: "Admin", role: "superadmin" })
      .returning();
    const [row] = await db
      .insert(auditLog)
      .values({ actorKind: "backoffice_user", actorId: admin.id, action: "plan.create", entity: "plan" })
      .returning();
    expect(row).toMatchObject({ dealerId: null, actorKind: "backoffice_user", actorId: admin.id, action: "plan.create" });
  });

  it("adds the dealer settings columns and replaces closures with dealer_closures", async () => {
    const result = await db.execute<{
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>(sql`
      SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name IN (
        'dealers', 'booking_rules', 'opening_hours', 'holiday_overrides', 'dealer_closures', 'plans', 'dealer_users')`);
    const columns = new Map(result.rows.map((r) => [`${r.table_name}.${r.column_name}`, r]));
    const expected: Record<string, [string, "YES" | "NO", string | null]> = {
      "dealers.email": ["text", "NO", null],
      "dealers.maps_url": ["text", "YES", null],
      "dealers.privacy_url": ["text", "YES", null],
      "dealers.logo_key": ["text", "YES", null],
      "dealers.sms_sender_name": ["text", "YES", null],
      "dealers.sms_notifications_enabled": ["boolean", "NO", "false"],
      "dealers.notification_phone": ["text", "YES", null],
      "booking_rules.test_drive_minutes": ["integer", "NO", "45"],
      "booking_rules.viewing_minutes": ["integer", "NO", "30"],
      "booking_rules.other_minutes": ["integer", "NO", "30"],
      "booking_rules.capacity": ["integer", "NO", "1"],
      "booking_rules.lead_time_minutes": ["integer", "NO", "120"],
      "booking_rules.max_days_ahead": ["integer", "NO", "14"],
      "booking_rules.buffer_minutes": ["integer", "NO", "15"],
      "booking_rules.cancel_cutoff_minutes": ["integer", "NO", "120"],
      "booking_rules.slot_minutes": ["integer", "NO", "15"],
      "opening_hours.dealer_id": ["uuid", "NO", null],
      "opening_hours.iso_weekday": ["smallint", "NO", null],
      "opening_hours.opens_at": ["time without time zone", "NO", null],
      "opening_hours.closes_at": ["time without time zone", "NO", null],
      "holiday_overrides.open_anyway": ["boolean", "NO", "false"],
      "dealer_closures.id": ["text", "NO", null],
      "dealer_closures.dealer_id": ["uuid", "NO", null],
      "dealer_closures.start_date": ["date", "NO", null],
      "dealer_closures.end_date": ["date", "NO", null],
      "dealer_closures.reason": ["text", "YES", null],
      "dealer_closures.created_at": ["timestamp with time zone", "NO", "now()"],
      "plans.max_users": ["integer", "YES", null],
      "dealer_users.name": ["text", "NO", null],
      "dealer_users.last_login_at": ["timestamp with time zone", "YES", null],
    };
    for (const [column, [dataType, nullable, columnDefault]] of Object.entries(expected)) {
      expect(columns.get(column), column).toMatchObject({
        data_type: dataType,
        is_nullable: nullable,
        column_default: columnDefault,
      });
    }
    expect(columns.has("holiday_overrides.is_open")).toBe(false);

    const tables = await db.execute<{ table_name: string }>(sql`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'closures'`);
    expect(tables.rows).toEqual([]);
    const indexes = await db.execute<{ indexname: string }>(sql`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'dealer_closures'`);
    expect(indexes.rows.map((r) => r.indexname)).toContain("dealer_closures_dealer_id_idx");
  });

  it("stores settings defaults, several ranges per weekday, holiday overrides and closures", async () => {
    const { dealer } = await insertDealer();
    expect(dealer).toMatchObject({ smsSenderName: null, smsNotificationsEnabled: false, notificationPhone: null, logoKey: null });

    const [rules] = await db.insert(bookingRules).values({ dealerId: dealer.id }).returning();
    expect(rules).toMatchObject({
      testDriveMinutes: 45,
      viewingMinutes: 30,
      otherMinutes: 30,
      capacity: 1,
      leadTimeMinutes: 120,
      maxDaysAhead: 14,
      bufferMinutes: 15,
      cancelCutoffMinutes: 120,
      slotMinutes: 15,
    });

    await db.insert(openingHours).values([
      { dealerId: dealer.id, isoWeekday: 1, opensAt: "08:00", closesAt: "12:00" },
      { dealerId: dealer.id, isoWeekday: 1, opensAt: "13:00", closesAt: "17:00" },
    ]);
    expect(await db.select().from(openingHours)).toHaveLength(2);
    await expectPgError(
      db.insert(openingHours).values({ dealerId: dealer.id, isoWeekday: 8, opensAt: "08:00", closesAt: "12:00" }),
      "23514",
    );

    const [holiday] = await db
      .insert(holidayOverrides)
      .values({ dealerId: dealer.id, date: "2026-11-01", key: "allSaints", name: "Dan spomina na mrtve" })
      .returning();
    expect(holiday.openAnyway).toBe(false);
    await db.update(holidayOverrides).set({ openAnyway: true });
    expect((await db.select().from(holidayOverrides))[0].openAnyway).toBe(true);
    await expectPgError(
      db.insert(holidayOverrides).values({ dealerId: dealer.id, date: "2026-12-26", name: "Pol ure", opensAt: "08:00" }),
      "23514",
    );

    const [single] = await db
      .insert(dealerClosures)
      .values({ dealerId: dealer.id, startDate: "2026-08-14", endDate: "2026-08-14" })
      .returning();
    expect(single.id).toMatch(/^[0-9A-Za-z]{16}$/);
    expect(single).toMatchObject({ reason: null });
    await db.insert(dealerClosures).values({ dealerId: dealer.id, startDate: "2026-08-01", endDate: "2026-08-15", reason: "Dopust" });
    await expectPgError(
      db.insert(dealerClosures).values({ dealerId: dealer.id, startDate: "2026-08-15", endDate: "2026-08-14" }),
      "23514",
    );

    const [unlimited] = await db
      .insert(plans)
      .values({ code: "unlimited", name: "Neomejen", maxCars: 100, priceEurCents: 9900 })
      .returning();
    expect(unlimited.maxUsers).toBeNull();
  });
});
