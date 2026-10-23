import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHmac } from "node:crypto";
import type { Server } from "node:http";
import { MealStore } from "../server/store";
import { PlanPrograms } from "../server/programs";
import { Billing } from "../server/billing";
import { buildPlan } from "../server/plan";
import { createApp } from "../server/app";
import type { Profile } from "../shared/profile";
const profile: Profile = {
  name: "Progress test",
  birthDate: "1996-05-10",
  country: "India",
  gender: "man",
  energyBasis: "male",
  heightCm: 175,
  weightKg: 80,
  goal: "maintain",
  targetWeightKg: null,
  timelineWeeks: 12,
  barriers: [],
  activity: "moderate",
  diet: "balanced",
  allergies: [],
  needsClinicalGuidance: false,
};
let dir: string;
before(async () => {
  dir = await mkdtemp(join(tmpdir(), "platewise-program-tests-"));
});
after(async () => {
  await rm(dir, { recursive: true, force: true });
});
test("trial starts explicitly once, checklist updates are idempotent, persisted and separate from meals", () => {
  const path = join(dir, "progress.sqlite");
  const store = new MealStore(path);
  let now = new Date("2026-10-21T10:00:00Z");
  const programs = new PlanPrograms(store.db, () => now);
  assert.equal(programs.access("owner").status, "not_started");
  const plan = buildPlan(profile, now);
  assert.equal(plan.days.length, 30);
  programs.start("owner", plan);
  const current = programs.current("owner")!;
  assert.equal(current.remainingDays, 30);
  assert.equal(
    programs.access("owner").trialEndsAt,
    "2026-11-20T10:00:00.000Z",
  );
  programs.complete("owner", current.id, 1, true, true);
  programs.complete("owner", current.id, 1, true, true);
  assert.equal(programs.current("owner")!.completedCount, 1);
  assert.equal(programs.current("owner")!.remainingDays, 29);
  now = new Date("2026-10-23T10:00:00Z");
  programs.start("owner", plan);
  assert.equal(
    programs.access("owner").trialStartedAt,
    "2026-10-21T10:00:00.000Z",
  );
  assert.equal(
    store.list("owner", "2026-10-01T00:00:00Z", "2026-11-01T00:00:00Z").length,
    0,
  );
  assert.throws(
    () => programs.complete("other", current.id, 1, true, true),
    (e: any) => e.code === "PROGRAM_NOT_FOUND",
  );
  assert.throws(
    () => programs.complete("owner", current.id, 31, true, true),
    (e: any) => e.code === "INVALID_DAY",
  );
  store.close();
  const reopened = new MealStore(path);
  const saved = new PlanPrograms(reopened.db, () => now);
  assert.deepEqual(saved.current("owner")!.completedDays, [1]);
  saved.complete("owner", current.id, 1, false, true);
  assert.equal(saved.current("owner")!.remainingDays, 30);
  reopened.close();
});
test("calendar expiry, finite paid periods and historical checklists are enforced", () => {
  const store = new MealStore(":memory:");
  let now = new Date("2026-10-21T10:00:00Z");
  const programs = new PlanPrograms(store.db, () => now);
  const plan = buildPlan(profile, now);
  programs.start("owner", plan);
  const first = programs.current("owner")!;
  now = new Date("2026-11-20T09:59:59Z");
  assert.equal(programs.access("owner").canTrack, true);
  now = new Date("2026-11-20T10:00:00Z");
  assert.equal(programs.access("owner").status, "expired");
  assert.throws(
    () => programs.complete("owner", first.id, 1, true, true),
    (e: any) => e.code === "PLAN_EXPIRED",
  );
  assert.throws(
    () => programs.next("owner", plan),
    (e: any) => e.code === "SUBSCRIPTION_REQUIRED",
  );
  // An explicit unit-test ledger fixture, not a provider response or live payment.
  store.db
    .prepare(
      "INSERT INTO plan_subscriptions(id,user_id,plan_id,status,created_at) VALUES(?,?,?,?,?)",
    )
    .run("sub_fixture", "owner", "plan_fixture", "active", now.toISOString());
  store.db
    .prepare(
      "INSERT INTO subscription_payments(id,subscription_id,invoice_id,period_start,period_end) VALUES(?,?,?,?,?)",
    )
    .run(
      "pay_fixture",
      "sub_fixture",
      "inv_fixture",
      now.getTime() / 1000,
      new Date("2026-12-20T10:00:00Z").getTime() / 1000,
    );
  assert.equal(programs.access("owner").status, "subscribed");
  assert.equal(programs.access("owner").pricePaise, 19900);
  programs.complete("owner", first.id, 1, true, true);
  programs.next("owner", plan);
  assert.equal(programs.current("owner")!.cycle, 2);
  assert.equal(programs.state("owner").history.length, 2);
  assert.equal(programs.state("owner").history[1].completedCount, 1);
  now = new Date("2026-12-20T10:00:00Z");
  assert.equal(programs.access("owner").hasPaidPlan, false);
  assert.equal(programs.access("owner").canTrack, false);
  assert.throws(
    () => programs.next("owner", plan),
    (e: any) => e.code === "SUBSCRIPTION_REQUIRED",
  );
  store.close();
});
test("profile changes preserve completed meals and update pending days and their targets", () => {
  const store = new MealStore(":memory:");
  const programs = new PlanPrograms(store.db);
  const plan = buildPlan(profile);
  programs.start("owner", plan);
  const first = programs.current("owner")!;
  programs.complete("owner", first.id, 1, true, true);
  const changed = buildPlan({
    ...profile,
    weightKg: 100,
    diet: "vegan",
    activity: "high",
  });
  programs.refreshProfile("owner", changed);
  const updated = programs.current("owner")!;
  assert.deepEqual(updated.plan.days[0], first.plan.days[0]);
  assert.deepEqual(updated.plan.days[1], changed.days[1]);
  assert.notEqual(
    updated.plan.days[0].targets.kcal,
    updated.plan.days[1].targets.kcal,
  );
  assert.equal(updated.completedCount, 1);
  store.close();
});
test("program HTTP routes protect accounts, return persisted counts and enforce expired access", async () => {
  const store = new MealStore(":memory:");
  let now = new Date("2026-10-21T10:00:00Z");
  const app = createApp(store, { visionModel: "unused", clock: () => now });
  const server: Server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  async function request(
    path: string,
    method = "GET",
    body?: unknown,
    cookie = "",
  ) {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { response, data: await response.json() };
  }
  try {
    const signup = await request("/api/auth/signup", "POST", {
      name: "API progress",
      email: "progress@example.com",
      password: "progress-password-123",
    });
    const cookie = signup.response.headers.get("set-cookie")!.split(";")[0];
    await request("/api/profile", "PUT", profile, cookie);
    assert.equal((await request("/api/plan-program")).response.status, 401);
    assert.equal(
      (await request("/api/plan-program", "GET", undefined, cookie)).data.access
        .status,
      "not_started",
    );
    const start = await request("/api/plan-program/start", "POST", {}, cookie);
    assert.equal(start.data.program.remainingDays, 30);
    const id = start.data.program.id;
    const changed = await request(
      `/api/plan-program/${id}/days/1`,
      "PUT",
      { completed: true },
      cookie,
    );
    assert.equal(changed.data.program.remainingDays, 29);
    assert.equal(
      (
        await request(
          `/api/plan-program/${id}/days/0`,
          "PUT",
          { completed: true },
          cookie,
        )
      ).response.status,
      400,
    );
    now = new Date("2026-11-20T10:00:00Z");
    const expired = await request(
      `/api/plan-program/${id}/days/2`,
      "PUT",
      { completed: true },
      cookie,
    );
    assert.equal(expired.response.status, 403);
    assert.equal(expired.data.error.code, "PLAN_EXPIRED");
    assert.equal(
      (await request("/api/plan-program", "GET", undefined, cookie)).data
        .program.completedCount,
      1,
    );
    assert.equal(
      (await request("/api/billing/subscriptions", "POST", {}, cookie)).response
        .status,
      503,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
  }
});
