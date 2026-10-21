import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Meal } from "../shared/types";
import { AppError } from "./errors";
export type MealDraft = Omit<
  Meal,
  "id" | "createdAt" | "updatedAt" | "version"
>;
export class MealStore {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(
      `PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS meals(id TEXT PRIMARY KEY,eaten_at TEXT NOT NULL,save_token TEXT NOT NULL UNIQUE,version INTEGER NOT NULL,body TEXT NOT NULL,user_id TEXT NOT NULL); CREATE INDEX IF NOT EXISTS meal_time ON meals(eaten_at);`,
    );
    const columns = this.db.prepare("PRAGMA table_info(meals)").all() as {
      name: string;
    }[];
    if (!columns.some((c) => c.name === "user_id"))
      this.db.exec(
        "ALTER TABLE meals ADD COLUMN user_id TEXT NOT NULL DEFAULT '__legacy__'",
      );
  }
  list(userId: string, start: string, end: string): Meal[] {
    return (
      this.db
        .prepare(
          "SELECT body FROM meals WHERE user_id = ? AND eaten_at >= ? AND eaten_at < ? ORDER BY eaten_at DESC",
        )
        .all(userId, start, end) as { body: string }[]
    ).map((r) => JSON.parse(r.body));
  }
  get(userId: string, id: string): Meal | undefined {
    const row = this.db
      .prepare("SELECT body FROM meals WHERE user_id = ? AND id = ?")
      .get(userId, id) as { body: string } | undefined;
    return row ? JSON.parse(row.body) : undefined;
  }
  save(
    userId: string,
    draft: MealDraft,
    id?: string,
    expectedVersion?: number,
  ): Meal {
    if (!id) {
      const duplicate = this.db
        .prepare("SELECT body FROM meals WHERE user_id = ? AND save_token = ?")
        .get(userId, draft.saveToken) as { body: string } | undefined;
      if (duplicate) return JSON.parse(duplicate.body);
    }
    const prior = id ? this.get(userId, id) : undefined;
    if (id && !prior)
      throw new AppError(
        404,
        "NOT_FOUND",
        "This meal no longer exists. Refresh the diary.",
      );
    if (prior && expectedVersion !== prior.version)
      throw new AppError(
        409,
        "STALE_MEAL",
        "This meal changed in another tab. Reload it before saving.",
      );
    const now = new Date().toISOString();
    const meal: Meal = {
      ...draft,
      id: id ?? randomUUID(),
      createdAt: prior?.createdAt ?? now,
      updatedAt: now,
      version: (prior?.version ?? 0) + 1,
      saveToken: prior?.saveToken ?? draft.saveToken,
    };
    if (prior) {
      const change = this.db
        .prepare(
          "UPDATE meals SET eaten_at=?,version=?,body=? WHERE id=? AND version=? AND user_id=?",
        )
        .run(
          meal.eatenAt,
          meal.version,
          JSON.stringify(meal),
          meal.id,
          expectedVersion!,
          userId,
        );
      if (!change.changes)
        throw new AppError(
          409,
          "STALE_MEAL",
          "This meal changed. Reload it before saving.",
        );
    } else
      this.db
        .prepare(
          "INSERT INTO meals(id,eaten_at,save_token,version,body,user_id) VALUES (?,?,?,?,?,?)",
        )
        .run(
          meal.id,
          meal.eatenAt,
          meal.saveToken,
          meal.version,
          JSON.stringify(meal),
          userId,
        );
    return meal;
  }
  delete(userId: string, id: string, version: number) {
    const meal = this.get(userId, id);
    if (!meal)
      throw new AppError(
        404,
        "NOT_FOUND",
        "This meal was already deleted. Refresh the diary.",
      );
    if (meal.version !== version)
      throw new AppError(
        409,
        "STALE_MEAL",
        "This meal changed. Refresh the diary before deleting.",
      );
    this.db
      .prepare("DELETE FROM meals WHERE id=? AND version=? AND user_id=?")
      .run(id, version, userId);
  }
  close() {
    this.db.close();
  }
}
