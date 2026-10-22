import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { DailyPlan } from "../shared/profile";
import {
  MONTHLY_PRICE_PAISE,
  PLAN_LENGTH,
  type PlanAccess,
  type PlanProgram,
  type ProgramState,
} from "../shared/program";
import { AppError } from "./errors";
const dayMs = 86400000;
type Membership = {
  trial_started_at: string | null;
  lifetime_payment_id: string | null;
};
export class PlanPrograms {
  constructor(
    private db: DatabaseSync,
    private clock: () => Date = () => new Date(),
  ) {
    db.exec(`CREATE TABLE IF NOT EXISTS memberships(user_id TEXT PRIMARY KEY,trial_started_at TEXT,lifetime_payment_id TEXT UNIQUE,purchased_at TEXT);
   CREATE TABLE IF NOT EXISTS plan_programs(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,cycle INTEGER NOT NULL,started_at TEXT NOT NULL,plan TEXT NOT NULL,UNIQUE(user_id,cycle));
   CREATE TABLE IF NOT EXISTS plan_completions(program_id TEXT NOT NULL,day INTEGER NOT NULL CHECK(day BETWEEN 1 AND 30),completed_at TEXT NOT NULL,PRIMARY KEY(program_id,day));`);
    // Keep prior tables and fulfilled lifetime purchases intact on upgrade.
    db.exec(`CREATE TABLE IF NOT EXISTS plan_subscriptions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,plan_id TEXT NOT NULL,status TEXT NOT NULL,cancel_at_period_end INTEGER NOT NULL DEFAULT 0,charge_at INTEGER,created_at TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS subscriptions_user ON plan_subscriptions(user_id,created_at);
   CREATE TABLE IF NOT EXISTS subscription_payments(id TEXT PRIMARY KEY,subscription_id TEXT NOT NULL,invoice_id TEXT NOT NULL UNIQUE,period_start INTEGER NOT NULL,period_end INTEGER NOT NULL,refunded INTEGER NOT NULL DEFAULT 0);
   CREATE INDEX IF NOT EXISTS subscription_periods ON subscription_payments(subscription_id,period_end);`);
  }
  access(userId: string, checkoutAvailable = false): PlanAccess {
    const member = this.db
      .prepare("SELECT * FROM memberships WHERE user_id=?")
      .get(userId) as Membership | undefined;
    const start = member?.trial_started_at ?? null;
    const end = start
      ? new Date(new Date(start).getTime() + PLAN_LENGTH * dayMs).toISOString()
      : null;
    const now = this.clock().getTime();
    const legacyLifetime = !!member?.lifetime_payment_id;
    const paid = this.db
      .prepare(
        `SELECT MAX(p.period_end) AS paid_end FROM subscription_payments p JOIN plan_subscriptions s ON s.id=p.subscription_id WHERE s.user_id=? AND p.refunded=0 AND p.period_start<=?`,
      )
      .get(userId, Math.floor(now / 1000)) as { paid_end: number | null };
    const paidUntil = paid.paid_end
      ? new Date(paid.paid_end * 1000).toISOString()
      : null;
    const subscribed = !!paidUntil && now < new Date(paidUntil).getTime();
    const subscription = this.db
      .prepare(
        "SELECT id,status,cancel_at_period_end,charge_at FROM plan_subscriptions WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1",
      )
      .get(userId) as
      | {
          id: string;
          status: string;
          cancel_at_period_end: number;
          charge_at: number | null;
        }
      | undefined;
    const free = !!end && now < new Date(end).getTime();
    return {
      status: legacyLifetime
        ? "legacy_lifetime"
        : subscribed
          ? "subscribed"
          : !start
            ? "not_started"
            : free
              ? "free"
              : "expired",
      trialStartedAt: start,
      trialEndsAt: end,
      freeDaysRemaining: free
        ? Math.ceil((new Date(end!).getTime() - this.clock().getTime()) / dayMs)
        : 0,
      hasPaidPlan: legacyLifetime || subscribed,
      hasLegacyLifetime: legacyLifetime,
      paidUntil,
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            cancelAtPeriodEnd: !!subscription.cancel_at_period_end,
            nextChargeAt:
              subscription.charge_at &&
              !subscription.cancel_at_period_end &&
              !["cancelled", "completed", "expired"].includes(
                subscription.status,
              )
                ? new Date(subscription.charge_at * 1000).toISOString()
                : null,
          }
        : null,
      canTrack: legacyLifetime || subscribed || free,
      checkoutAvailable,
      pricePaise: MONTHLY_PRICE_PAISE,
      currency: "INR",
    };
  }
  current(userId: string): PlanProgram | null {
    const row = this.db
      .prepare(
        "SELECT * FROM plan_programs WHERE user_id=? ORDER BY cycle DESC LIMIT 1",
      )
      .get(userId) as
      | { id: string; cycle: number; started_at: string; plan: string }
      | undefined;
    if (!row) return null;
    const completedDays = (
      this.db
        .prepare(
          "SELECT day FROM plan_completions WHERE program_id=? ORDER BY day",
        )
        .all(row.id) as { day: number }[]
    ).map((r) => r.day);
    return {
      id: row.id,
      cycle: row.cycle,
      startedAt: row.started_at,
      plan: JSON.parse(row.plan),
      completedDays,
      completedCount: completedDays.length,
      remainingDays: PLAN_LENGTH - completedDays.length,
    };
  }
  state(userId: string, checkoutAvailable = false): ProgramState {
    const history = this.db
      .prepare(
        "SELECT p.id,p.cycle,p.started_at,COUNT(c.day) AS completed FROM plan_programs p LEFT JOIN plan_completions c ON c.program_id=p.id WHERE p.user_id=? GROUP BY p.id ORDER BY p.cycle DESC",
      )
      .all(userId) as {
      id: string;
      cycle: number;
      started_at: string;
      completed: number;
    }[];
    return {
      program: this.current(userId),
      access: this.access(userId, checkoutAvailable),
      history: history.map((r) => ({
        id: r.id,
        cycle: r.cycle,
        completedCount: Number(r.completed),
        startedAt: r.started_at,
      })),
    };
  }
  start(userId: string, plan: DailyPlan): void {
    if (this.current(userId)) return; // Starting again never resets the trial clock or progress.
    if (!plan.eligible || plan.days.length !== PLAN_LENGTH)
      throw new AppError(
        400,
        "PLAN_UNAVAILABLE",
        "Complete an eligible profile before starting the free meal plan.",
      );
    const now = this.clock().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          "INSERT INTO memberships(user_id,trial_started_at) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET trial_started_at=COALESCE(memberships.trial_started_at,excluded.trial_started_at)",
        )
        .run(userId, now);
      this.db
        .prepare(
          "INSERT INTO plan_programs(id,user_id,cycle,started_at,plan) VALUES(?,?,?,?,?)",
        )
        .run(randomUUID(), userId, 1, now, JSON.stringify(plan));
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  complete(
    userId: string,
    programId: string,
    day: number,
    completed: boolean,
    eligible: boolean,
  ): void {
    const program = this.current(userId);
    if (!program || program.id !== programId)
      throw new AppError(
        404,
        "PROGRAM_NOT_FOUND",
        "This is not your current plan. Reload the plan page.",
      );
    if (!eligible)
      throw new AppError(
        403,
        "PLAN_UNAVAILABLE",
        "Automated planning is paused for this profile. Review your profile details.",
      );
    if (!this.access(userId).canTrack)
      throw new AppError(
        403,
        "PLAN_EXPIRED",
        "Your planning access has ended. Your past records remain available. Continue meal planning for ₹499 per month.",
      );
    if (!Number.isInteger(day) || day < 1 || day > PLAN_LENGTH)
      throw new AppError(400, "INVALID_DAY", "Choose a day from 1 to 30.");
    if (completed)
      this.db
        .prepare(
          "INSERT INTO plan_completions(program_id,day,completed_at) VALUES(?,?,?) ON CONFLICT(program_id,day) DO NOTHING",
        )
        .run(programId, day, this.clock().toISOString());
    else
      this.db
        .prepare("DELETE FROM plan_completions WHERE program_id=? AND day=?")
        .run(programId, day);
  }
  refreshProfile(userId: string, fresh: DailyPlan): void {
    const current = this.current(userId);
    if (!current || !fresh.eligible) return;
    const completed = new Set(current.completedDays);
    const days = fresh.days.map((day, index) =>
      completed.has(index + 1) ? (current.plan.days[index] ?? day) : day,
    );
    const updated = {
      ...fresh,
      days,
      week: days.slice(0, 7),
      menu: days[0].menu,
      menuTotals: days[0].totals,
    };
    this.db
      .prepare("UPDATE plan_programs SET plan=? WHERE id=? AND user_id=?")
      .run(JSON.stringify(updated), current.id, userId);
  }
  next(userId: string, plan: DailyPlan): void {
    if (!this.access(userId).hasPaidPlan)
      throw new AppError(
        403,
        "SUBSCRIPTION_REQUIRED",
        "Starting another 30-day plan requires an active ₹499/month subscription.",
      );
    if (!plan.eligible)
      throw new AppError(
        400,
        "PLAN_UNAVAILABLE",
        "Automated meal planning is unavailable for this profile.",
      );
    const current = this.current(userId);
    if (!current) {
      this.start(userId, plan);
      return;
    }
    const age = this.clock().getTime() - new Date(current.startedAt).getTime();
    if (current.completedCount < PLAN_LENGTH && age < PLAN_LENGTH * dayMs)
      throw new AppError(
        409,
        "PLAN_IN_PROGRESS",
        "Finish this checklist or wait until this plan’s 30-day period ends before starting the next one.",
      );
    this.db
      .prepare(
        "INSERT INTO plan_programs(id,user_id,cycle,started_at,plan) VALUES(?,?,?,?,?)",
      )
      .run(
        randomUUID(),
        userId,
        current.cycle + 1,
        this.clock().toISOString(),
        JSON.stringify(plan),
      );
  }
}
