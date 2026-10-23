import "dotenv/config";
import { backup, DatabaseSync } from "node:sqlite";
import { resolve, join } from "node:path";
import { mkdir, chmod } from "node:fs/promises";
const source = resolve(process.env.DATABASE_PATH ?? ".data/platewise.sqlite"),
  dir = resolve(process.env.BACKUP_DIR ?? ".backups");
await mkdir(dir, { recursive: true, mode: 0o700 });
const target = join(
  dir,
  `platewise-${new Date().toISOString().replaceAll(":", "-")}.sqlite`,
);
const db = new DatabaseSync(source, { readOnly: true });
try {
  await backup(db, target);
  await chmod(target, 0o600);
  const check = new DatabaseSync(target, { readOnly: true });
  try {
    const result = check.prepare("PRAGMA integrity_check").get() as {
      integrity_check: string;
    };
    if (result.integrity_check !== "ok")
      throw new Error("Backup integrity check failed");
  } finally {
    check.close();
  }
  console.log(`Verified backup created: ${target}`);
} finally {
  db.close();
}
