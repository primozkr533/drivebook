// Real-database tests: start Postgres with `docker compose up -d db`. They use TEST_DATABASE_URL
// (default postgres://drivebook:drivebook@localhost:5432/drivebook_test), never the dev database.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  authTokens,
  backofficeSessions,
  backofficeUsers,
  cars,
  dealerLicenceHistory,
  dealers,
  dealerSessions,
  dealerUsers,
  messageLog,
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
    .values({ code: "basic", name: "Basic", maxCars: 20, maxUsers: 5, smsIncluded: 100, priceEurCents: 4900 })
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
      note: "first",
    });
    await expectPgError(
      db.insert(dealerLicenceHistory).values({
        dealerId: dealer.id,
        planId: plan.id,
        validFrom: new Date("2026-06-01T00:00:00Z"),
        note: "overlaps",
      }),
      "23P01",
    );
    await db.insert(dealerLicenceHistory).values({
      dealerId: dealer.id,
      planId: plan.id,
      validFrom: new Date("2026-07-01T00:00:00Z"),
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
        'login_attempts', 'message_log', 'dev_outbox', 'audit_log')`);
    const columns = new Map(result.rows.map((r) => [`${r.table_name}.${r.column_name}`, r.is_nullable]));
    const expected: Record<string, "YES" | "NO"> = {
      "dealer_users.password_hash": "YES",
      "dealer_users.status": "NO",
      "dealer_users.totp_secret_enc": "YES",
      "dealer_users.totp_enabled_at": "YES",
      "dealer_users.last_login_at": "YES",
      "backoffice_users.status": "NO",
      "backoffice_users.totp_secret_enc": "YES",
      "backoffice_users.totp_enabled_at": "YES",
      "backoffice_users.last_login_at": "YES",
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
    };
    for (const [column, nullable] of Object.entries(expected)) {
      expect(columns.get(column), column).toBe(nullable);
    }
    expect(columns.has("dealer_users.active")).toBe(false);

    const indexes = await db.execute<{ indexname: string }>(sql`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename IN (
        'dealer_sessions', 'backoffice_sessions', 'login_attempts')`);
    expect(indexes.rows.map((r) => r.indexname)).toEqual(
      expect.arrayContaining([
        "dealer_sessions_user_id_idx",
        "backoffice_sessions_user_id_idx",
        "login_attempts_surface_email_created_at_idx",
        "login_attempts_surface_ip_created_at_idx",
      ]),
    );
  });
});
