import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { PHOTO_LIMIT } from "../shared/program";
import { addMonths } from "../shared/dates";
import { AppError } from "./errors";
import { PlanPrograms } from "./programs";
export class PhotoUsage {
  constructor(
    private db: DatabaseSync,
    private programs: PlanPrograms,
    private clock: () => Date = () => new Date(),
  ) {
    db.exec(
      "CREATE TABLE IF NOT EXISTS photo_uses(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,period_start INTEGER NOT NULL,period_end INTEGER NOT NULL,status TEXT NOT NULL,created_at INTEGER NOT NULL);CREATE INDEX IF NOT EXISTS photo_period ON photo_uses(user_id,period_start,status)",
    );
  }
  private period(userId: string) {
    const access = this.programs.access(userId),
      now = this.clock();
    if (access.status === "free")
      return {
        start: new Date(access.trialStartedAt!).getTime(),
        end: new Date(access.trialEndsAt!).getTime(),
        kind: "trial",
      };
    if (!access.hasPaidPlan) return null;
    const paid = this.db
      .prepare(
        "SELECT p.period_start,p.period_end FROM subscription_payments p JOIN plan_subscriptions s ON s.id=p.subscription_id WHERE s.user_id=? AND p.refunded=0 AND p.period_start<=? AND p.period_end>? ORDER BY p.period_end DESC LIMIT 1",
      )
      .get(userId, now.getTime() / 1000, now.getTime() / 1000) as
      | { period_start: number; period_end: number }
      | undefined;
    const anchor = paid
      ? new Date(paid.period_start * 1000)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    let index = 0;
    while (addMonths(anchor, index + 1).getTime() <= now.getTime()) index++;
    return {
      start: addMonths(anchor, index).getTime(),
      end: Math.min(
        addMonths(anchor, index + 1).getTime(),
        paid ? paid.period_end * 1000 : Infinity,
      ),
      kind: "paid",
    };
  }
  state(userId: string) {
    const period = this.period(userId);
    const used = period
      ? Number(
          (
            this.db
              .prepare(
                "SELECT COUNT(*) AS n FROM photo_uses WHERE user_id=? AND period_start=? AND status='used'",
              )
              .get(userId, period.start) as { n: number }
          ).n,
        )
      : 0;
    return {
      limit: PHOTO_LIMIT,
      used,
      remaining: period ? Math.max(0, PHOTO_LIMIT - used) : 0,
      periodEndsAt: period ? new Date(period.end).toISOString() : null,
      kind: period?.kind ?? "free",
      canAnalyze: !!period && used < PHOTO_LIMIT,
      needsTrial: this.programs.access(userId).status === "not_started",
    };
  }
  reserve(userId: string) {
    const period = this.period(userId);
    if (!period)
      throw new AppError(
        403,
        "PLUS_REQUIRED",
        "Start your 30-day Plus trial or subscribe to use photo analysis. Basic manual tracking stays free.",
      );
    const now = this.clock().getTime(),
      id = randomUUID();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          "DELETE FROM photo_uses WHERE status='pending' AND created_at<?",
        )
        .run(now - 120000);
      const inflight = this.db
        .prepare(
          "SELECT id FROM photo_uses WHERE user_id=? AND status='pending'",
        )
        .get(userId);
      if (inflight)
        throw new AppError(
          409,
          "PHOTO_BUSY",
          "A photo is already being analyzed. Wait for it to finish.",
        );
      if (!this.state(userId).canAnalyze)
        throw new AppError(
          429,
          "PHOTO_ALLOWANCE_USED",
          "Your 100 successful photo analyses have been used. Your allowance resets at the date shown; manual tracking stays free.",
        );
      this.db
        .prepare("INSERT INTO photo_uses VALUES(?,?,?,?,?,?)")
        .run(id, userId, period.start, period.end, "pending", now);
      this.db.exec("COMMIT");
      return id;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  finish(id: string, successful: boolean) {
    if (successful)
      this.db
        .prepare(
          "UPDATE photo_uses SET status='used' WHERE id=? AND status='pending'",
        )
        .run(id);
    else
      this.db
        .prepare("DELETE FROM photo_uses WHERE id=? AND status='pending'")
        .run(id);
  }
}
