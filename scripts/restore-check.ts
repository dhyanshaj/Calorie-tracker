import { DatabaseSync } from "node:sqlite";
import { mkdtemp, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
const input = process.argv[2];
if (!input)
  throw new Error("Usage: npm run restore:check -- /path/to/backup.sqlite");
const dir = await mkdtemp(join(tmpdir(), "platewise-restore-"));
try {
  const path = join(dir, "restored.sqlite");
  await copyFile(resolve(input), path);
  const db = new DatabaseSync(path);
  try {
    const result = db.prepare("PRAGMA integrity_check").get() as {
      integrity_check: string;
    };
    if (result.integrity_check !== "ok")
      throw new Error("Restored database is corrupt");
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    for (const table of ["users", "meals", "plan_programs"])
      if (!tables.some((t) => t.name === table))
        throw new Error(`Missing required table: ${table}`);
    db.exec(
      "CREATE TABLE restore_probe(id INTEGER); INSERT INTO restore_probe VALUES(1); DROP TABLE restore_probe",
    );
    console.log(
      "Restore check passed: schema, integrity and writes verified on an isolated copy. The running diary was not modified.",
    );
  } finally {
    db.close();
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
