import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dir = join(import.meta.dirname, "../../docker/backup");
const read = (name: string) => readFileSync(join(dir, name), "utf8");

const scripts = ["backup.sh", "restore.sh", "entrypoint.sh", "test-restore.sh"];

describe("docker/backup scripts", () => {
  it("defaults the retention to 14 days", () => {
    expect(read("backup.sh")).toContain('BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"');
    expect(read("Dockerfile")).toMatch(/BACKUP_RETENTION_DAYS=14\b/);
  });

  it("dumps the db in custom format and archives the uploads", () => {
    const backup = read("backup.sh");
    expect(backup).toMatch(/pg_dump -Fc /);
    expect(backup).toMatch(/tar czf "\$uploads_tmp" -C "\$STORAGE_DIR" \./);
    expect(backup).toMatch(/mv "\$db_tmp" "\$db_file"/);
    expect(backup).toMatch(/mv "\$uploads_tmp" "\$uploads_file"/);
  });

  it("restores with pg_restore --clean --if-exists and unpacks the uploads", () => {
    const restore = read("restore.sh");
    expect(restore).toMatch(/pg_restore --clean --if-exists/);
    expect(restore).toMatch(/tar xzf "\$uploads_file" -C "\$STORAGE_DIR"/);
  });

  it.each(scripts)("%s uses strict mode and is executable", (name) => {
    expect(read(name)).toMatch(/^#!\/usr\/bin\/env bash\n(?:#.*\n)?set -euo pipefail\n/);
    expect(statSync(join(dir, name)).mode & 0o111).not.toBe(0);
  });

  it("takes secrets only from the environment", () => {
    for (const name of ["lib.sh", "backup.sh", "restore.sh", "entrypoint.sh", "Dockerfile"]) {
      expect(read(name)).not.toMatch(/PASSWORD=[^"$\s]/);
      expect(read(name)).not.toMatch(/postgres:\/\/[^$"\s]+:[^$"\s]+@/);
    }
  });

  it("uses the same Postgres major as the dev db image", () => {
    const compose = readFileSync(join(import.meta.dirname, "../../docker-compose.yml"), "utf8");
    const dbMajor = compose.match(/image: postgres:(\d+)-alpine/)?.[1];
    expect(dbMajor).toBeDefined();
    expect(read("Dockerfile")).toMatch(new RegExp(`^FROM postgres:${dbMajor}-alpine$`, "m"));
  });
});
