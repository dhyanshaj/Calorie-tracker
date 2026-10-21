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
test("calendar expiry is enforced on the server and lifetime access keeps historical checklists", () => {
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
    (e: any) => e.code === "LIFETIME_REQUIRED",
  );
  programs.grantLifetime("owner", "pay_fixture");
  assert.equal(programs.access("owner").status, "lifetime");
  programs.complete("owner", first.id, 1, true, true);
  programs.next("owner", plan);
  assert.equal(programs.current("owner")!.cycle, 2);
  assert.equal(programs.state("owner").history.length, 2);
  assert.equal(programs.state("owner").history[1].completedCount, 1);
  now = new Date("2036-10-21T10:00:00Z");
  assert.equal(programs.access("owner").hasLifetime, true);
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
function providerFixture() {
  let captured = true,
    amount = 99900,
    refunded = 0,
    calls = 0;
  const payment = () => ({
    id: "pay_fixture",
    order_id: "order_fixture",
    amount,
    currency: "INR",
    status:
      refunded >= 99900 ? "refunded" : captured ? "captured" : "authorized",
    captured,
    amount_refunded: refunded,
  });
  const fetcher: typeof fetch = async (url, init) => {
    const path = String(url);
    if (path.endsWith("/orders")) {
      calls++;
      assert.equal(JSON.parse(String(init!.body)).amount, 99900);
      return Response.json({
        id: "order_fixture",
        amount: 99900,
        currency: "INR",
      });
    }
    if (path.endsWith("/orders/order_fixture/payments"))
      return Response.json({ items: [payment()] });
    if (path.endsWith("/payments/pay_fixture")) return Response.json(payment());
    throw new Error("Unexpected fixture request");
  };
  return {
    fetcher,
    calls: () => calls,
    setCaptured: (value: boolean) => (captured = value),
    setAmount: (value: number) => (amount = value),
    setRefunded: (value: number) => (refunded = value),
  };
}
const config = {
  keyId: "rzp_test_fixture",
  keySecret: "fixture-secret-not-real",
  webhookSecret: "fixture-webhook-not-real",
};
const verification = () => ({
  razorpay_order_id: "order_fixture",
  razorpay_payment_id: "pay_fixture",
  razorpay_signature: createHmac("sha256", config.keySecret)
    .update("order_fixture|pay_fixture")
    .digest("hex"),
});
test("payment fulfillment requires ownership, a valid signature, exact INR amount and a captured payment", async () => {
  const store = new MealStore(":memory:");
  const programs = new PlanPrograms(store.db);
  const provider = providerFixture();
  const billing = new Billing(store.db, programs, config, provider.fetcher);
  const [order, concurrentOrder] = await Promise.all([
    billing.createOrder("owner"),
    billing.createOrder("owner"),
  ]);
  assert.equal(concurrentOrder.id, order.id);
  assert.equal(order.amount, 99900);
  assert.equal(order.currency, "INR");
  assert.equal((await billing.createOrder("owner")).id, order.id);
  assert.equal(provider.calls(), 1);
  assert.equal(programs.access("owner").hasLifetime, false);
  await assert.rejects(
    () => billing.verify("other", verification()),
    (e: any) => e.code === "ORDER_NOT_FOUND",
  );
  await assert.rejects(
    () =>
      billing.verify("owner", {
        ...verification(),
        razorpay_signature: "0".repeat(64),
      }),
    (e: any) => e.code === "INVALID_PAYMENT_SIGNATURE",
  );
  provider.setCaptured(false);
  await assert.rejects(
    () => billing.verify("owner", verification()),
    (e: any) => e.code === "PAYMENT_NOT_CAPTURED",
  );
  provider.setCaptured(true);
  provider.setAmount(100);
  await assert.rejects(
    () => billing.verify("owner", verification()),
    (e: any) => e.code === "PAYMENT_NOT_CAPTURED",
  );
  assert.equal(programs.access("owner").hasLifetime, false);
  provider.setAmount(99900);
  await billing.verify("owner", verification());
  await billing.verify("owner", verification());
  assert.equal(programs.access("owner").hasLifetime, true);
  assert.equal(
    (
      store.db
        .prepare(
          "SELECT COUNT(*) AS count FROM payment_orders WHERE status='paid'",
        )
        .get() as any
    ).count,
    1,
  );
  await assert.rejects(
    () => billing.createOrder("owner"),
    (e: any) => e.code === "ALREADY_LIFETIME",
  );
  store.close();
});
test("signed webhooks recover missed checkout callbacks, reject tampering, and revoke full refunds", async () => {
  const store = new MealStore(":memory:");
  const programs = new PlanPrograms(store.db);
  const provider = providerFixture();
  const billing = new Billing(store.db, programs, config, provider.fetcher);
  await billing.createOrder("owner");
  const raw = Buffer.from(
    JSON.stringify({
      event: "payment.captured",
      payload: {
        payment: { entity: { id: "pay_fixture", order_id: "order_fixture" } },
      },
    }),
  );
  await assert.rejects(
    () => billing.webhook(raw, "0".repeat(64)),
    (e: any) => e.code === "INVALID_WEBHOOK_SIGNATURE",
  );
  assert.equal(programs.access("owner").hasLifetime, false);
  const sign = (body: Buffer) =>
    createHmac("sha256", config.webhookSecret).update(body).digest("hex");
  await billing.webhook(raw, sign(raw));
  await billing.webhook(raw, sign(raw));
  assert.equal(programs.access("owner").hasLifetime, true);
  provider.setRefunded(99900);
  const refund = Buffer.from(
    JSON.stringify({
      event: "refund.processed",
      payload: { refund: { entity: { payment_id: "pay_fixture" } } },
    }),
  );
  await billing.webhook(refund, sign(refund));
  assert.equal(programs.access("owner").hasLifetime, false);
  await assert.rejects(
    () => billing.webhook(raw, sign(raw)),
    (e: any) => e.code === "PAYMENT_NOT_CAPTURED",
  );
  store.close();
});
test("payment status recovery verifies with the provider and missing configuration never grants access", async () => {
  const store = new MealStore(":memory:");
  const programs = new PlanPrograms(store.db);
  const missing = new Billing(store.db, programs, {});
  await assert.rejects(
    () => missing.createOrder("owner"),
    (e: any) => e.code === "PAYMENTS_NOT_CONFIGURED",
  );
  assert.equal(programs.access("owner").hasLifetime, false);
  const provider = providerFixture();
  const billing = new Billing(store.db, programs, config, provider.fetcher);
  await billing.createOrder("owner");
  await billing.status("owner");
  assert.equal(programs.access("owner").hasLifetime, true);
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
      (await request("/api/billing/orders", "POST", {}, cookie)).response
        .status,
      503,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
  }
});

test("payment HTTP webhook preserves raw bytes, requires its signature and grants an owned lifetime pass", async () => {
  const store = new MealStore(":memory:");
  const provider = providerFixture();
  const app = createApp(store, {
    visionModel: "unused",
    payments: config,
    paymentFetch: provider.fetcher,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    const signup = await fetch(base + "/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Payment route test",
        email: "payment-route@example.com",
        password: "route-test-password",
      }),
    });
    const cookie = signup.headers.get("set-cookie")!.split(";")[0];
    const order = await fetch(base + "/api/billing/orders", {
      method: "POST",
      headers: { cookie },
    });
    assert.equal(order.status, 200);
    assert.equal(((await order.json()) as any).amount, 99900);
    const event = JSON.stringify({
      event: "payment.captured",
      payload: {
        payment: { entity: { id: "pay_fixture", order_id: "order_fixture" } },
      },
    });
    const invalid = await fetch(base + "/api/billing/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": "0".repeat(64),
      },
      body: event,
    });
    assert.equal(invalid.status, 400);
    const signature = createHmac("sha256", config.webhookSecret)
      .update(event)
      .digest("hex");
    const confirmed = await fetch(base + "/api/billing/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": signature,
      },
      body: event,
    });
    assert.equal(confirmed.status, 200);
    const state = await fetch(base + "/api/plan-program", {
      headers: { cookie },
    });
    assert.equal(((await state.json()) as any).access.hasLifetime, true);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
  }
});
