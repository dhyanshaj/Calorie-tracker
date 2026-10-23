import {
  randomBytes,
  createHash,
  randomUUID,
  scrypt as scryptCallback,
} from "node:crypto";
import { promisify } from "node:util";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { Accounts } from "./auth";
import { Mailer } from "./mail";
import { AppError } from "./errors";
const scrypt = promisify(scryptCallback);
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
export class AccountActions {
  constructor(
    private db: DatabaseSync,
    private accounts: Accounts,
    private mail: Mailer,
    private clock: () => Date = () => new Date(),
  ) {
    db.exec(
      "CREATE TABLE IF NOT EXISTS account_tokens(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,purpose TEXT NOT NULL,expires_at INTEGER NOT NULL)",
    );
  }
  async request(email: string, purpose: "verify" | "reset") {
    if (!this.mail.configured)
      throw new AppError(
        503,
        "EMAIL_NOT_CONFIGURED",
        "Email delivery is not enabled yet. Ask the app owner to finish setup.",
      );
    const row = this.db
      .prepare("SELECT id,email,email_verified_at FROM users WHERE email=?")
      .get(email.toLowerCase()) as
      | { id: string; email: string; email_verified_at: string | null }
      | undefined;
    if (!row || (purpose === "verify" && row.email_verified_at)) return;
    const token = randomBytes(32).toString("hex"),
      hash = digest(token);
    this.db
      .prepare(
        "DELETE FROM account_tokens WHERE expires_at<=? OR (user_id=? AND purpose=?)",
      )
      .run(this.clock().getTime(), row.id, purpose);
    this.db
      .prepare("INSERT INTO account_tokens VALUES(?,?,?,?)")
      .run(
        hash,
        row.id,
        purpose,
        this.clock().getTime() + (purpose === "verify" ? 86400000 : 900000),
      );
    try {
      await this.mail.send(row.email, purpose, token);
    } catch (error) {
      this.db
        .prepare("DELETE FROM account_tokens WHERE token_hash=?")
        .run(hash);
      throw error;
    }
  }
  async consume(purpose: "verify" | "reset", token: string, password?: string) {
    const hash = digest(tokenSchema.parse(token));
    let passwordHash: string | undefined;
    if (purpose === "reset") {
      z.string().min(10).max(128).parse(password);
      const salt = randomBytes(16).toString("hex");
      passwordHash = `${salt}:${((await scrypt(password!, salt, 64)) as Buffer).toString("hex")}`;
    }
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.db
        .prepare(
          "DELETE FROM account_tokens WHERE token_hash=? AND purpose=? AND expires_at>? RETURNING user_id",
        )
        .get(hash, purpose, this.clock().getTime()) as
        | { user_id: string }
        | undefined;
      if (!row)
        throw new AppError(
          400,
          "LINK_INVALID",
          "This link has expired or was already used. Request a new one.",
        );
      if (purpose === "verify")
        this.db
          .prepare("UPDATE users SET email_verified_at=? WHERE id=?")
          .run(this.clock().toISOString(), row.user_id);
      else {
        this.db
          .prepare("UPDATE users SET password_hash=? WHERE id=?")
          .run(passwordHash!, row.user_id);
        this.db
          .prepare("DELETE FROM sessions WHERE user_id=?")
          .run(row.user_id);
        this.db
          .prepare(
            "DELETE FROM account_tokens WHERE user_id=? AND purpose='reset'",
          )
          .run(row.user_id);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  export(userId: string) {
    const user = this.accounts.get(userId)!;
    return {
      version: 1,
      exportedAt: this.clock().toISOString(),
      account: user,
      meals: (
        this.db
          .prepare("SELECT body FROM meals WHERE user_id=? ORDER BY eaten_at")
          .all(userId) as { body: string }[]
      ).map((r) => JSON.parse(r.body)),
      plans: (
        this.db
          .prepare(
            "SELECT id,cycle,started_at,plan FROM plan_programs WHERE user_id=?",
          )
          .all(userId) as any[]
      ).map((r) => ({
        ...r,
        plan: JSON.parse(r.plan),
        completedDays: this.db
          .prepare(
            "SELECT day,completed_at FROM plan_completions WHERE program_id=?",
          )
          .all(r.id),
      })),
      subscriptions: this.db
        .prepare(
          "SELECT id,status,amount,cadence,created_at,cancel_at_period_end FROM plan_subscriptions WHERE user_id=?",
        )
        .all(userId),
      favourites: this.db
        .prepare("SELECT kind,item_id,body FROM favourites WHERE user_id=?")
        .all(userId),
      photoUsage: this.db
        .prepare(
          "SELECT period_start,period_end,status FROM photo_uses WHERE user_id=? AND status='used'",
        )
        .all(userId),
    };
  }
  async reauthenticate(userId: string, password: string) {
    const user = this.accounts.get(userId);
    if (!user) throw new AppError(401, "AUTH_REQUIRED", "Sign in again.");
    try {
      await this.accounts.login({ email: user.email, password });
    } catch (error) {
      if (error instanceof AppError && error.code === "BAD_LOGIN")
        throw new AppError(
          403,
          "PASSWORD_CONFIRM_FAILED",
          "Your current password is incorrect.",
        );
      throw error;
    }
  }
  remove(userId: string) {
    const anonymous = `deleted:${randomUUID()}`;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          "DELETE FROM plan_completions WHERE program_id IN (SELECT id FROM plan_programs WHERE user_id=?)",
        )
        .run(userId);
      for (const table of [
        "plan_programs",
        "memberships",
        "meals",
        "sessions",
        "account_tokens",
        "favourites",
        "photo_uses",
      ])
        this.db.prepare(`DELETE FROM ${table} WHERE user_id=?`).run(userId);
      this.db
        .prepare("UPDATE plan_subscriptions SET user_id=? WHERE user_id=?")
        .run(anonymous, userId);
      if (
        this.db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='payment_orders'",
          )
          .get()
      )
        this.db
          .prepare("UPDATE payment_orders SET user_id=? WHERE user_id=?")
          .run(anonymous, userId);
      this.db.prepare("DELETE FROM users WHERE id=?").run(userId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
