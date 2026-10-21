import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const compose = readFileSync(join(import.meta.dirname, "../../docker-compose.yml"), "utf8");

function service(name: string): string {
  const match = compose.match(new RegExp(`^  ${name}:\\n((?:    .*\\n|\\s*\\n)*)`, "m"));
  if (!match) throw new Error(`service ${name} not found`);
  return match[1];
}

describe("docker-compose worker service", () => {
  it("runs npm run worker with the shared env once the db is healthy", () => {
    const worker = service("worker");
    expect(worker).toMatch(/command: \["npm", "run", "worker"\]/);
    expect(worker).toMatch(/environment: \*app-env/);
    expect(worker).toMatch(/db:\n\s+condition: service_healthy/);
  });

  it("keeps web independent of the worker and both on the shared env", () => {
    const web = service("web");
    expect(web).not.toMatch(/worker/);
    expect(web).toMatch(/environment: \*app-env/);
  });

  it("gives web STORAGE_DIR and the storage volume at /data/storage", () => {
    expect(compose).toContain("- STORAGE_DIR=${STORAGE_DIR:-/data/storage}");
    expect(service("web")).toMatch(/volumes:\n\s+- storage:\/data\/storage/);
    expect(service("worker")).not.toMatch(/storage:\/data\/storage/);
    expect(compose).toMatch(/^volumes:\n(?:  .*\n)*  storage:/m);
  });

  it("interpolates provider keys from the environment", () => {
    for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER", "BREVO_API_KEY", "BREVO_SENDER_EMAIL"]) {
      expect(compose).toContain(`- ${key}=\${${key}:-}`);
    }
  });
});
