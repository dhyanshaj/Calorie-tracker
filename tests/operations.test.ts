import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { MealStore } from "../server/store";
import { createApp } from "../server/app";
import { Accounts } from "../server/auth";
const run = promisify(execFile);
test("backup and restore scripts produce a consistent private snapshot and test restores without modifying the live diary", async () => {
  const dir = await mkdtemp(join(tmpdir(), "platewise-backup-tests-"));
  const path = join(dir, "live.sqlite"),
    backups = join(dir, "backups");
  const store = new MealStore(path);
  createApp(store, { visionModel: "unused" });
  try {
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    const accounts = new Accounts(store.db);
    await accounts.signup({
      name: "Backup fixture",
      email: "backup@example.com",
      password: "backup-password-123",
    });
    const result = await run(
      process.execPath,
      ["--import", "tsx", resolve("scripts/backup.ts")],
      { env: { ...process.env, DATABASE_PATH: path, BACKUP_DIR: backups } },
    );
    assert.match(result.stdout, /Verified backup created/);
    await accounts.signup({
      name: "After snapshot",
      email: "later@example.com",
      password: "backup-password-123",
    });
    const file = join(
      backups,
      (await readdir(backups)).find((f) => f.endsWith(".sqlite"))!,
    );
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    const restored = await run(process.execPath, [
      "--import",
      "tsx",
      resolve("scripts/restore-check.ts"),
      file,
    ]);
    assert.match(restored.stdout, /Restore check passed/);
    const check = new DatabaseSync(file, { readOnly: true });
    try {
      assert.equal(
        (check.prepare("SELECT COUNT(*) AS n FROM users").get() as any).n,
        1,
      );
    } finally {
      check.close();
    }
    assert.equal(
      (store.db.prepare("SELECT COUNT(*) AS n FROM users").get() as any).n,
      2,
    );
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("health checks work without exposing accounts or integration credentials", async () => {
  const store = new MealStore(":memory:"),
    app = createApp(store, {
      visionModel: "unused",
      visionKey: "fixture-not-real",
    }),
    server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    const response = await fetch(base + "/healthz");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.ok(response.headers.get("x-request-id"));
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.equal((await fetch(base + "/api/account/export")).status, 401);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    store.close();
  }
});
