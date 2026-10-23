import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MealStore } from "../server/store";
import { PlanPrograms } from "../server/programs";
import { Billing } from "../server/billing";
import { createApp } from "../server/app";
import { buildPlan } from "../server/plan";
import type { Profile } from "../shared/profile";

// All provider entities and credentials below are test fixtures. No real payments.
const profile: Profile = {
  name: "Subscription test",
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
const config = {
  keyId: "rzp_test_fixture",
  keySecret: "fixture-secret-not-real",
  webhookSecret: "fixture-webhook-not-real",
  planId: "plan_fixture",
};
const seconds = (iso: string) => new Date(iso).getTime() / 1000;
const firstStart = "2026-11-20T10:00:00Z",
  firstEnd = "2026-12-20T10:00:00Z";
const sign = (raw: Buffer) =>
  createHmac("sha256", config.webhookSecret).update(raw).digest("hex");
const callback = (sub = "sub_fixture", pay = "pay_first") => ({
  razorpay_subscription_id: sub,
  razorpay_payment_id: pay,
  razorpay_signature: createHmac("sha256", config.keySecret)
    .update(`${pay}|${sub}`)
    .digest("hex"),
});
function providerFixture() {
  const plan = {
    id: "plan_fixture",
    period: "monthly",
    interval: 1,
    item: { amount: 19900, currency: "INR" },
  };
  const sub = {
    id: "sub_fixture",
    plan_id: "plan_fixture",
    status: "created",
    quantity: 1,
    charge_at: null as number | null,
  };
  const invoices: Record<string, any>[] = [];
  const payments = new Map<string, Record<string, any>>();
  const calls: { path: string; method?: string; body?: any }[] = [];
  let creates = 0,
    unavailable = false;
  const fetcher: typeof fetch = async (input, init) => {
    if (unavailable) throw new Error("Fixture provider outage");
    const url = new URL(String(input)),
      path = url.pathname.replace("/v1/", "");
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path, method: init?.method, body });
    if (path === "plans/plan_fixture") return Response.json(plan);
    if (path === "subscriptions" && init?.method === "POST") {
      creates++;
      assert.deepEqual(body, {
        plan_id: "plan_fixture",
        total_count: body.total_count,
        quantity: 1,
        customer_notify: true,
        expire_by: body.expire_by,
      });
      assert.equal(typeof body.expire_by, "number");
      assert.ok([100, 1200].includes(body.total_count));
      if (creates > 1) sub.id = `sub_fixture${creates}`;
      sub.status = "created";
      return Response.json(sub);
    }
    if (path === `subscriptions/${sub.id}/cancel`) {
      assert.equal(typeof body.cancel_at_cycle_end, "boolean");
      if (!body.cancel_at_cycle_end) sub.status = "cancelled";
      return Response.json(sub);
    }
    if (path === `subscriptions/${sub.id}`) return Response.json(sub);
    if (path === "invoices") {
      assert.equal(url.searchParams.get("subscription_id"), sub.id);
      const skip = Number(url.searchParams.get("skip") ?? 0);
      return Response.json({ items: invoices.slice(skip, skip + 100) });
    }
    if (path.startsWith("payments/")) {
      const payment = payments.get(path.slice(9));
      assert.ok(payment, "Unexpected fixture payment");
      return Response.json(payment);
    }
    throw new Error(`Unexpected fixture request ${path}`);
  };
  const charge = (name = "first", start = firstStart, end = firstEnd) => {
    sub.status = "active";
    sub.charge_at = seconds(end);
    const payment = {
      id: `pay_${name}`,
      order_id: `order_${name}`,
      amount: 19900,
      currency: "INR",
      status: "captured",
      captured: true,
      amount_refunded: 0,
    };
    payments.set(payment.id, payment);
    const invoice = {
      id: `inv_${name}`,
      subscription_id: sub.id,
      order_id: payment.order_id,
      payment_id: payment.id,
      status: "paid",
      amount: 19900,
      amount_paid: 19900,
      currency: "INR",
      billing_start: seconds(start),
      billing_end: seconds(end),
    };
    invoices.push(invoice);
    return { payment, invoice };
  };
  return {
    fetcher,
    plan,
    sub,
    invoices,
    payments,
    calls,
    charge,
    creates: () => creates,
    setUnavailable: (value: boolean) => {
      unavailable = value;
    },
  };
}
function setup(path = ":memory:") {
  const store = new MealStore(path);
  let now = new Date("2026-10-21T10:00:00Z");
  const clock = () => now;
  const programs = new PlanPrograms(store.db, clock);
  const provider = providerFixture();
  const billing = new Billing(
    store.db,
    programs,
    config,
    provider.fetcher,
    clock,
  );
  programs.start("owner", buildPlan(profile, now));
  return {
    store,
    programs,
    provider,
    billing,
    clock,
    setNow: (value: string) => {
      now = new Date(value);
    },
  };
}
const chargedEvent = () =>
  Buffer.from(
    JSON.stringify({
      event: "subscription.charged",
      payload: { subscription: { entity: { id: "sub_fixture" } } },
    }),
  );

test("subscription checkout requires configuration, a completed free period, and an exact monthly merchant plan", async () => {
  const ctx = setup();
  const { store, programs, provider, billing } = ctx;
  await assert.rejects(
    () => billing.createSubscription("owner"),
    (e: any) => e.code === "FREE_PERIOD_ACTIVE",
  );
  assert.equal(provider.calls.length, 0);
  ctx.setNow(firstStart);
  for (const missing of [{}, { ...config, planId: undefined }]) {
    const disabled = new Billing(
      store.db,
      programs,
      missing,
      provider.fetcher,
      ctx.clock,
    );
    assert.equal(disabled.configured, false);
    await assert.rejects(
      () => disabled.createSubscription("owner"),
      (e: any) => e.code === "PAYMENTS_NOT_CONFIGURED",
    );
  }
  for (const change of [{ amount: 99900 }, { currency: "USD" }]) {
    Object.assign(
      provider.plan.item,
      { amount: 19900, currency: "INR" },
      change,
    );
    await assert.rejects(
      () => billing.createSubscription("owner"),
      (e: any) => e.code === "WRONG_SUBSCRIPTION_PLAN",
    );
  }
  Object.assign(provider.plan.item, { amount: 19900, currency: "INR" });
  provider.plan.period = "yearly";
  await assert.rejects(
    () => billing.createSubscription("owner"),
    (e: any) => e.code === "WRONG_SUBSCRIPTION_PLAN",
  );
  provider.plan.period = "monthly";
  provider.plan.interval = 2;
  await assert.rejects(
    () => billing.createSubscription("owner"),
    (e: any) => e.code === "WRONG_SUBSCRIPTION_PLAN",
  );
  assert.equal(provider.creates(), 0);
  store.close();
});

test("checkout reuses subscriptions and a signature or active mandate alone never grants a paid month", async () => {
  const ctx = setup();
  const { store, programs, provider, billing } = ctx;
  ctx.setNow(firstStart);
  const [checkout, concurrent] = await Promise.all([
    billing.createSubscription("owner"),
    billing.createSubscription("owner"),
  ]);
  assert.equal(checkout.id, concurrent.id);
  assert.equal(checkout.amount, 19900);
  assert.equal(checkout.currency, "INR");
  assert.equal(provider.creates(), 1);
  assert.equal("keySecret" in checkout, false);
  await assert.rejects(
    () => billing.verify("other", callback()),
    (e: any) => e.code === "SUBSCRIPTION_NOT_FOUND",
  );
  await assert.rejects(
    () =>
      billing.verify("owner", {
        ...callback(),
        razorpay_signature: "0".repeat(64),
      }),
    (e: any) => e.code === "INVALID_PAYMENT_SIGNATURE",
  );
  provider.sub.status = "authenticated";
  await billing.verify("owner", callback());
  assert.equal(programs.access("owner").hasPaidPlan, false);
  provider.sub.status = "active";
  await billing.status("owner");
  assert.equal(programs.access("owner").hasPaidPlan, false);
  const { payment, invoice } = provider.charge();
  payment.captured = false;
  await billing.status("owner");
  assert.equal(programs.access("owner").hasPaidPlan, false);
  payment.captured = true;
  payment.amount = 1;
  await billing.status("owner");
  assert.equal(programs.access("owner").hasPaidPlan, false);
  payment.amount = 19900;
  invoice.subscription_id = "sub_other";
  await billing.status("owner");
  assert.equal(programs.access("owner").hasPaidPlan, false);
  invoice.subscription_id = "sub_fixture";
  invoice.amount_paid = 40000;
  await billing.status("owner");
  assert.equal(programs.access("owner").hasPaidPlan, false);
  invoice.amount_paid = 19900;
  payment.order_id = "order_other";
  await billing.status("owner");
  assert.equal(programs.access("owner").hasPaidPlan, false);
  payment.order_id = "order_first";
  await billing.verify("owner", callback());
  await billing.verify("owner", callback());
  assert.equal(programs.access("owner").status, "subscribed");
  assert.equal(programs.access("owner").paidUntil, "2026-12-20T10:00:00.000Z");
  assert.equal(
    (
      store.db
        .prepare("SELECT COUNT(*) AS count FROM subscription_payments")
        .get() as any
    ).count,
    1,
  );
  await assert.rejects(
    () => billing.createSubscription("owner"),
    (e: any) => e.code === "ALREADY_SUBSCRIBED",
  );
  store.close();
});

test("signed renewals extend only the paid calendar month and failed renewal expires without deleting history", async () => {
  const ctx = setup();
  const { store, programs, provider, billing } = ctx;
  ctx.setNow(firstStart);
  await billing.createSubscription("owner");
  provider.charge();
  const raw = chargedEvent();
  await assert.rejects(
    () => billing.webhook(raw, "0".repeat(64)),
    (e: any) => e.code === "INVALID_WEBHOOK_SIGNATURE",
  );
  assert.equal(programs.access("owner").hasPaidPlan, false);
  await billing.webhook(raw, sign(raw));
  programs.complete("owner", programs.current("owner")!.id, 1, true, true);
  ctx.setNow(firstEnd);
  provider.sub.status = "pending";
  await billing.webhook(raw, sign(raw));
  assert.equal(programs.access("owner").status, "expired");
  assert.deepEqual(programs.current("owner")!.completedDays, [1]);
  await assert.rejects(
    () => billing.createSubscription("owner"),
    (e: any) => e.code === "EXISTING_SUBSCRIPTION",
  );
  provider.charge("second", firstEnd, "2027-01-20T10:00:00Z");
  await billing.webhook(raw, sign(raw));
  await billing.webhook(raw, sign(raw));
  assert.equal(programs.access("owner").paidUntil, "2027-01-20T10:00:00.000Z");
  assert.equal(
    (
      store.db
        .prepare("SELECT COUNT(*) AS count FROM subscription_payments")
        .get() as any
    ).count,
    2,
  );
  ctx.setNow("2027-01-20T10:00:00Z");
  assert.equal(programs.access("owner").canTrack, false);
  store.close();
});

test("cancelling renewal is owned and idempotent, retaining the entire verified paid period", async () => {
  const ctx = setup();
  const { store, programs, provider, billing } = ctx;
  ctx.setNow(firstStart);
  await billing.createSubscription("owner");
  provider.charge();
  await billing.status("owner");
  await assert.rejects(
    () => billing.cancel("other", "sub_fixture"),
    (e: any) => e.code === "SUBSCRIPTION_NOT_FOUND",
  );
  await billing.cancel("owner", "sub_fixture");
  await billing.cancel("owner", "sub_fixture");
  const requests = provider.calls.filter((call) =>
    call.path.endsWith("/cancel"),
  );
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.cancel_at_cycle_end, true);
  assert.equal(programs.access("owner").subscription!.cancelAtPeriodEnd, true);
  assert.equal(programs.access("owner").subscription!.nextChargeAt, null);
  assert.equal(programs.access("owner").hasPaidPlan, true);
  await billing.status("owner");
  assert.equal(programs.access("owner").subscription!.cancelAtPeriodEnd, true);
  ctx.setNow(firstEnd);
  provider.sub.status = "cancelled";
  await billing.status("owner");
  assert.equal(programs.access("owner").canTrack, false);
  const next = await billing.createSubscription("owner");
  assert.equal(next.id, "sub_fixture2");
  assert.equal(provider.creates(), 2);
  store.close();
});

test("an uncharged mandate can be cancelled immediately without manufacturing paid access", async () => {
  const ctx = setup();
  ctx.setNow(firstStart);
  await ctx.billing.createSubscription("owner");
  ctx.provider.sub.status = "authenticated";
  await ctx.billing.cancel("owner", "sub_fixture");
  assert.equal(
    ctx.provider.calls.find((call) => call.path.endsWith("/cancel"))!.body
      .cancel_at_cycle_end,
    false,
  );
  assert.equal(ctx.programs.access("owner").canTrack, false);
  assert.equal(ctx.programs.access("owner").subscription!.status, "cancelled");
  ctx.store.close();
});

test("full refunds revoke only their paid month and delayed webhook replays cannot restore it", async () => {
  const ctx = setup();
  const { store, programs, provider, billing } = ctx;
  ctx.setNow(firstStart);
  await billing.createSubscription("owner");
  const { payment } = provider.charge();
  await billing.status("owner");
  const refund = Buffer.from(
    JSON.stringify({
      event: "refund.processed",
      payload: { refund: { entity: { payment_id: "pay_first" } } },
    }),
  );
  payment.amount_refunded = 10000;
  await billing.webhook(refund, sign(refund));
  assert.equal(programs.access("owner").hasPaidPlan, true);
  payment.amount_refunded = 19900;
  payment.status = "refunded";
  await billing.webhook(refund, sign(refund));
  await billing.webhook(refund, sign(refund));
  assert.equal(programs.access("owner").hasPaidPlan, false);
  payment.amount_refunded = 0;
  payment.status = "captured"; // Simulate stale data on a delayed event.
  const charged = chargedEvent();
  await billing.webhook(charged, sign(charged));
  assert.equal(programs.access("owner").hasPaidPlan, false);
  ctx.setNow(firstEnd);
  provider.charge("second", firstEnd, "2027-01-20T10:00:00Z");
  await billing.status("owner");
  assert.equal(programs.access("owner").hasPaidPlan, true);
  await billing.webhook(refund, sign(refund));
  assert.equal(programs.access("owner").hasPaidPlan, true);
  store.close();
});

test("status recovery handles invoice pagination and preserves an already paid month during provider outages", async () => {
  const ctx = setup();
  ctx.setNow(firstStart);
  await ctx.billing.createSubscription("owner");
  ctx.provider.invoices.push(
    ...Array.from({ length: 100 }, (_, i) => ({
      id: `inv_unpaid${i}`,
      status: "issued",
    })),
  );
  ctx.provider.charge();
  await ctx.billing.status("owner");
  assert.equal(ctx.programs.access("owner").hasPaidPlan, true);
  ctx.provider.setUnavailable(true);
  await assert.rejects(
    () => ctx.billing.status("owner"),
    (e: any) => e.code === "PAYMENT_UNREACHABLE",
  );
  assert.equal(ctx.programs.access("owner").hasPaidPlan, true);
  ctx.setNow(firstEnd);
  assert.equal(ctx.programs.access("owner").canTrack, false);
  ctx.store.close();
});

test("production test credentials cannot create subscriptions or fulfill signed test webhooks", async () => {
  const ctx = setup();
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    ctx.setNow(firstStart);
    assert.equal(ctx.billing.configured, false);
    await assert.rejects(
      () => ctx.billing.createSubscription("owner"),
      (e: any) => e.code === "PAYMENTS_NOT_CONFIGURED",
    );
    const event = chargedEvent();
    await assert.rejects(
      () => ctx.billing.webhook(event, sign(event)),
      (e: any) => e.code === "PAYMENTS_NOT_CONFIGURED",
    );
    assert.equal(ctx.programs.access("owner").hasPaidPlan, false);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
    ctx.store.close();
  }
});

test("upgrading preserves trial clocks, saved ticks and fulfilled legacy purchases without converting them to subscriptions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "platewise-billing-upgrade-"));
  try {
    const path = join(dir, "existing.sqlite");
    const ctx = setup(path);
    ctx.store.db
      .prepare(
        "INSERT INTO memberships(user_id,lifetime_payment_id,purchased_at) VALUES(?,?,?)",
      )
      .run("legacy", "pay_legacy", firstStart);
    ctx.programs.complete(
      "owner",
      ctx.programs.current("owner")!.id,
      1,
      true,
      true,
    );
    ctx.setNow(firstStart);
    await ctx.billing.createSubscription("owner");
    ctx.provider.charge();
    await ctx.billing.status("owner");
    ctx.store.close();
    const store = new MealStore(path);
    let restoredNow = new Date("2026-11-21T10:00:00Z");
    const programs = new PlanPrograms(store.db, () => restoredNow);
    assert.equal(programs.access("owner").hasPaidPlan, true);
    assert.equal(
      programs.access("owner").paidUntil,
      "2026-12-20T10:00:00.000Z",
    );
    restoredNow = new Date("2036-10-21T10:00:00Z");
    assert.deepEqual(programs.current("owner")!.completedDays, [1]);
    assert.equal(
      programs.access("owner").trialStartedAt,
      "2026-10-21T10:00:00.000Z",
    );
    assert.equal(programs.access("legacy").hasLegacyLifetime, true);
    assert.equal(programs.access("legacy").subscription, null);
    assert.equal(programs.access("owner").status, "expired");
    store.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("HTTP subscription checkout, raw signed webhooks and cancellation enforce account ownership", async () => {
  const store = new MealStore(":memory:");
  let now = new Date("2026-10-21T10:00:00Z");
  const provider = providerFixture();
  const app = createApp(store, {
    visionModel: "unused",
    payments: config,
    paymentFetch: provider.fetcher,
    clock: () => now,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  let cookie = "";
  const request = async (path: string, body?: unknown) => {
    const response = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    };
  };
  try {
    assert.equal((await request("/api/billing/subscriptions", {})).status, 401);
    const signup = await request("/api/auth/signup", {
      name: profile.name,
      email: "billing@example.com",
      password: "fixture-password-123",
    });
    cookie = signup.cookie!;
    await fetch(base + "/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(profile),
    });
    await request("/api/plan-program/start", {});
    assert.equal((await request("/api/billing/subscriptions", {})).status, 409);
    now = new Date(firstStart);
    assert.equal((await request("/api/billing/orders", {})).status, 404);
    await fetch(base + "/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ ...profile, needsClinicalGuidance: true }),
    });
    assert.equal((await request("/api/auth/me")).data.plan.eligible, false);
    assert.equal((await request("/api/billing/subscriptions", {})).status, 200);
    assert.equal(provider.creates(), 1); // Plus photos remain usable while clinical planning is paused.
    await fetch(base + "/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(profile),
    });
    const checkout = await request("/api/billing/subscriptions", {});
    assert.equal(checkout.status, 200);
    assert.equal(checkout.data.amount, 19900);
    provider.charge();
    const raw = chargedEvent();
    const invalid = await fetch(base + "/api/billing/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": "0".repeat(64),
      },
      body: raw,
    });
    assert.equal(invalid.status, 400);
    const valid = await fetch(base + "/api/billing/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": sign(raw),
      },
      body: raw,
    });
    assert.equal(valid.status, 200);
    let state = (await request("/api/plan-program")).data;
    assert.equal(state.access.hasPaidPlan, true);
    assert.equal(state.access.paidUntil, "2026-12-20T10:00:00.000Z");
    const owner = cookie;
    cookie = (
      await request("/api/auth/signup", {
        name: "Other",
        email: "other-billing@example.com",
        password: "fixture-password-123",
      })
    ).cookie!;
    assert.equal(
      (await request("/api/billing/subscriptions/sub_fixture/cancel", {}))
        .status,
      404,
    );
    assert.equal(
      (await request("/api/billing/verify", callback())).status,
      404,
    );
    cookie = owner;
    const cancelled = await request(
      "/api/billing/subscriptions/sub_fixture/cancel",
      {},
    );
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.data.access.subscription.cancelAtPeriodEnd, true);
    assert.equal(cancelled.data.access.hasPaidPlan, true);
    now = new Date(firstEnd);
    state = (await request("/api/plan-program")).data;
    assert.equal(state.access.canTrack, false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
  }
});

test("annual checkout verifies the yearly price and grants one finite paid year with cancellation and refund handling", async () => {
  const ctx = setup();
  ctx.setNow(firstStart);
  const provider = ctx.provider;
  const billing = new Billing(
    ctx.store.db,
    ctx.programs,
    { ...config, annualPlanId: config.planId },
    provider.fetcher,
    ctx.clock,
  );
  provider.plan.period = "yearly";
  provider.plan.item.amount = 149900;
  try {
    const checkout = await billing.createSubscription("owner", "annual");
    assert.equal(checkout.amount, 149900);
    assert.equal(
      provider.calls.find((c) => c.path === "subscriptions")!.body.total_count,
      100,
    );
    const charge = provider.charge(
      "annual",
      firstStart,
      "2027-11-20T10:00:00Z",
    );
    charge.invoice.amount = 149900;
    charge.invoice.amount_paid = 149900;
    charge.payment.amount = 149900;
    await billing.verify("owner", callback("sub_fixture", "pay_annual"));
    assert.equal(
      ctx.programs.access("owner").paidUntil,
      "2027-11-20T10:00:00.000Z",
    );
    assert.equal(ctx.programs.access("owner").subscription!.cadence, "annual");
    await billing.cancel("owner", "sub_fixture");
    assert.equal(ctx.programs.access("owner").hasPaidPlan, true);
    charge.payment.amount_refunded = 149900;
    charge.payment.status = "refunded";
    const refund = Buffer.from(
      JSON.stringify({
        event: "refund.processed",
        payload: { refund: { entity: { payment_id: "pay_annual" } } },
      }),
    );
    await billing.webhook(refund, sign(refund));
    assert.equal(ctx.programs.access("owner").hasPaidPlan, false);
  } finally {
    ctx.store.close();
  }
});

test("existing ₹499 monthly subscriptions reconcile against their original verified price during upgrade", async () => {
  const ctx = setup();
  ctx.setNow(firstStart);
  try {
    ctx.store.db
      .prepare(
        "INSERT INTO plan_subscriptions(id,user_id,plan_id,status,created_at) VALUES(?,?,?,?,?)",
      )
      .run("sub_fixture", "owner", "plan_fixture", "active", firstStart);
    ctx.provider.plan.item.amount = 49900;
    const charge = ctx.provider.charge();
    charge.invoice.amount = 49900;
    charge.invoice.amount_paid = 49900;
    charge.payment.amount = 49900;
    await ctx.billing.status("owner");
    assert.equal(ctx.programs.access("owner").hasPaidPlan, true);
    assert.equal(ctx.programs.access("owner").subscription!.amountPaise, 49900);
  } finally {
    ctx.store.close();
  }
});
