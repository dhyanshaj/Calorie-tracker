import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MealStore } from "../server/store";
import { createApp, type Config } from "../server/app";
import { Accounts } from "../server/auth";
import { AccountActions } from "../server/account-actions";
import { Mailer } from "../server/mail";
import { PlanPrograms } from "../server/programs";
import { PhotoUsage } from "../server/usage";
import { buildPlan } from "../server/plan";
import { mealAlternatives } from "../server/menu";
import { addMonths } from "../shared/dates";
import { catalog, foodById, recipeMetadata } from "../shared/catalog";
import { analyzeMeal } from "../server/analysis";
import type { Profile } from "../shared/profile";
import sharp from "sharp";
const profile: Profile = {
  name: "Upgrade test",
  birthDate: "1996-05-10",
  country: "India",
  gender: "unspecified",
  energyBasis: "neutral",
  heightCm: 170,
  weightKg: 75,
  goal: "maintain",
  targetWeightKg: null,
  timelineWeeks: 12,
  barriers: [],
  activity: "moderate",
  diet: "balanced",
  allergies: [],
  needsClinicalGuidance: false,
  cuisine: "indian",
  budget: "everyday",
  cookingMinutes: 30,
};
const mailConfig = {
  key: "fixture-mail-not-real",
  from: "Platewise <test@example.com>",
  publicUrl: "https://example.com",
};
async function http(config: Partial<Config> = {}) {
  const store = new MealStore(":memory:"),
    app = createApp(store, { visionModel: "fixture", ...config }),
    server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  let cookie = "";
  const request = async (path: string, method = "GET", body?: unknown) => {
    const response = await fetch(base + path, {
      method,
      headers: {
        Cookie: cookie,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = response.status === 204 ? undefined : await response.json();
    return { response, data };
  };
  const signup = async (email = `${randomUUID()}@example.com`) => {
    const result = await request("/api/auth/signup", "POST", {
      name: profile.name,
      email,
      password: "upgrade-password-123",
    });
    cookie = result.response.headers.get("set-cookie")!.split(";")[0];
    return result.data.user;
  };
  return {
    store,
    base,
    request,
    signup,
    cookie: () => cookie,
    setCookie: (value: string) => {
      cookie = value;
    },
    close: async () => {
      await new Promise<void>((r) => server.close(() => r()));
      store.close();
    },
  };
}
test("verification and recovery tokens are hashed, single-use, purpose-bound, expiring and revoke sessions on reset", async () => {
  const store = new MealStore(":memory:"),
    accounts = new Accounts(store.db);
  let now = new Date("2026-10-23T10:00:00Z");
  const sent: any[] = [];
  const mail = new Mailer(mailConfig, async (_url, init) => {
    sent.push(JSON.parse(String(init?.body)));
    return Response.json({ id: "fixture" });
  });
  const actions = new AccountActions(store.db, accounts, mail, () => now);
  const user = await accounts.signup({
    name: "Recovery",
    email: "recovery@example.com",
    password: "original-password-123",
  });
  try {
    await actions.request("unknown@example.com", "reset");
    assert.equal(sent.length, 0);
    await actions.request(user.email, "verify");
    let token = sent.at(-1).html.match(/token=([a-f0-9]{64})/)[1];
    const saved = store.db.prepare("SELECT * FROM account_tokens").get() as any;
    assert.notEqual(saved.token_hash, token);
    assert.equal(JSON.stringify(saved).includes(token), false);
    await assert.rejects(
      () => actions.consume("reset", token, "new-password-123"),
      (e: any) => e.code === "LINK_INVALID",
    );
    await actions.consume("verify", token);
    assert.equal(accounts.get(user.id)!.emailVerified, true);
    await assert.rejects(
      () => actions.consume("verify", token),
      (e: any) => e.code === "LINK_INVALID",
    );
    store.db
      .prepare("INSERT INTO sessions VALUES(?,?,?)")
      .run("fixture-session-hash", user.id, Date.now() + 100000);
    await actions.request(user.email, "reset");
    token = sent.at(-1).html.match(/token=([a-f0-9]{64})/)[1];
    now = new Date(now.getTime() + 900000);
    await assert.rejects(
      () => actions.consume("reset", token, "new-password-123"),
      (e: any) => e.code === "LINK_INVALID",
    );
    await actions.request(user.email, "reset");
    token = sent.at(-1).html.match(/token=([a-f0-9]{64})/)[1];
    await actions.consume("reset", token, "new-password-123");
    assert.equal(
      (store.db.prepare("SELECT COUNT(*) AS n FROM sessions").get() as any).n,
      0,
    );
    await assert.rejects(
      () =>
        accounts.login({
          email: user.email,
          password: "original-password-123",
        }),
      (e: any) => e.code === "BAD_LOGIN",
    );
    assert.equal(
      (
        await accounts.login({
          email: user.email,
          password: "new-password-123",
        })
      ).id,
      user.id,
    );
  } finally {
    store.close();
  }
});
test("email endpoints disclose missing delivery setup and recovery revokes real HTTP sessions", async () => {
  const sent: any[] = [];
  const ctx = await http({
    mail: mailConfig,
    mailFetch: async (_url, init) => {
      sent.push(JSON.parse(String(init?.body)));
      return Response.json({ id: "fixture" });
    },
  });
  try {
    const user = await ctx.signup("email-http@example.com"),
      old = ctx.cookie();
    const known = await ctx.request("/api/auth/password-request", "POST", {
        email: user.email,
      }),
      unknown = await ctx.request("/api/auth/password-request", "POST", {
        email: "absent@example.com",
      });
    assert.deepEqual(known.data, unknown.data);
    const token = sent[0].html.match(/token=([a-f0-9]{64})/)[1];
    assert.equal(
      (
        await ctx.request("/api/auth/password-reset", "POST", {
          token,
          password: "changed-password-123",
        })
      ).response.status,
      200,
    );
    ctx.setCookie(old);
    assert.equal((await ctx.request("/api/auth/me")).data.user, undefined);
    assert.equal(
      (
        await ctx.request("/api/auth/login", "POST", {
          email: user.email,
          password: "changed-password-123",
        })
      ).response.status,
      200,
    );
  } finally {
    await ctx.close();
  }
  const disabled = await http();
  try {
    await disabled.signup();
    assert.equal(
      (await disabled.request("/api/account/verify-email", "POST")).response
        .status,
      503,
    );
  } finally {
    await disabled.close();
  }
});
test("favourites are isolated and a repeated meal is confirmed and idempotent even after the original is deleted", async () => {
  const ctx = await http();
  try {
    await ctx.signup();
    const estimate = (
      await ctx.request("/api/analyze", "POST", { description: "two rotis" })
    ).data;
    const body = {
      title: "Repeat lunch",
      description: "two rotis",
      items: estimate.items.map(
        ({ id, foodId, quantity, unit, gramsPerUnit }: any) => ({
          id,
          foodId,
          quantity,
          unit,
          gramsPerUnit,
        }),
      ),
      eatenAt: new Date().toISOString(),
      saveToken: randomUUID(),
      method: "description",
    };
    const saved = (await ctx.request("/api/meals", "POST", body)).data;
    await ctx.request(`/api/favourites/meals/${saved.id}`, "PUT", {
      favourite: true,
    });
    await ctx.request("/api/favourites/foods/roti", "PUT", { favourite: true });
    const owner = ctx.cookie();
    await ctx.signup();
    assert.equal(
      (await ctx.request("/api/library")).data.favouriteMeals.length,
      0,
    );
    assert.equal(
      (
        await ctx.request(`/api/favourites/meals/${saved.id}`, "PUT", {
          favourite: true,
        })
      ).response.status,
      404,
    );
    ctx.setCookie(owner);
    await ctx.request(`/api/meals/${saved.id}?version=1`, "DELETE");
    const repeat = { ...body, sourceMealId: saved.id, saveToken: randomUUID() };
    const first = (await ctx.request("/api/meals", "POST", repeat)).data,
      again = (await ctx.request("/api/meals", "POST", repeat)).data;
    assert.equal(first.id, again.id);
    assert.equal(
      (await ctx.request("/api/library")).data.recentMeals.length,
      1,
    );
    assert.equal(
      (await ctx.request("/api/library")).data.favouriteFoods[0].id,
      "roti",
    );
  } finally {
    await ctx.close();
  }
});
test("export excludes authentication secrets and account deletion reauthenticates then removes private data", async () => {
  const ctx = await http();
  try {
    const user = await ctx.signup();
    await ctx.request("/api/profile", "PUT", profile);
    await ctx.request("/api/plan-program/start", "POST");
    await ctx.request("/api/favourites/foods/roti", "PUT", { favourite: true });
    const exported = (await ctx.request("/api/account/export")).data;
    assert.equal(exported.account.email, user.email);
    assert.equal(exported.favourites.length, 1);
    assert.equal(JSON.stringify(exported).includes("password_hash"), false);
    assert.equal(JSON.stringify(exported).includes("token_hash"), false);
    assert.equal(
      (
        await ctx.request("/api/account/delete", "POST", {
          password: "wrong-password-123",
          confirmation: "DELETE",
        })
      ).response.status,
      403,
    );
    assert.equal((await ctx.request("/api/auth/me")).data.user.id, user.id);
    assert.equal(
      (
        await ctx.request("/api/account/delete", "POST", {
          password: "upgrade-password-123",
          confirmation: "DELETE",
        })
      ).response.status,
      204,
    );
    for (const table of [
      "users",
      "sessions",
      "favourites",
      "plan_programs",
      "memberships",
      "account_tokens",
    ]) {
      const key = table === "users" ? "id" : "user_id";
      assert.equal(
        (
          ctx.store.db
            .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${key}=?`)
            .get(user.id) as any
        ).n,
        0,
      );
    }
    assert.equal(
      (await ctx.request("/api/account/export")).response.status,
      401,
    );
  } finally {
    await ctx.close();
  }
});
test("quota reservations avoid concurrent overspend and failed requests release slots without restarting the trial", () => {
  const store = new MealStore(":memory:");
  let now = new Date("2026-10-23T10:00:00Z");
  const programs = new PlanPrograms(store.db, () => now),
    usage = new PhotoUsage(store.db, programs, () => now);
  try {
    assert.throws(
      () => usage.reserve("owner"),
      (e: any) => e.code === "PLUS_REQUIRED",
    );
    programs.startTrial("owner");
    const start = programs.access("owner").trialStartedAt;
    const pending = usage.reserve("owner");
    assert.throws(
      () => usage.reserve("owner"),
      (e: any) => e.code === "PHOTO_BUSY",
    );
    usage.finish(pending, false);
    assert.equal(usage.state("owner").remaining, 100);
    for (let i = 0; i < 100; i++) usage.finish(usage.reserve("owner"), true);
    assert.equal(usage.state("owner").remaining, 0);
    assert.throws(
      () => usage.reserve("owner"),
      (e: any) => e.code === "PHOTO_ALLOWANCE_USED",
    );
    now = new Date("2026-11-22T10:00:00Z");
    programs.startTrial("owner");
    assert.equal(programs.access("owner").trialStartedAt, start);
    assert.equal(usage.state("owner").canAnalyze, false);
  } finally {
    store.close();
  }
});
test("annual photo allowances follow clamped calendar months without granting future or refunded periods", () => {
  const store = new MealStore(":memory:");
  let now = new Date("2027-01-31T10:00:00Z");
  const programs = new PlanPrograms(store.db, () => now),
    usage = new PhotoUsage(store.db, programs, () => now);
  try {
    store.db
      .prepare(
        "INSERT INTO plan_subscriptions(id,user_id,plan_id,status,created_at,amount,cadence) VALUES(?,?,?,?,?,?,?)",
      )
      .run(
        "sub_annual",
        "owner",
        "plan_annual",
        "active",
        now.toISOString(),
        149900,
        "annual",
      );
    store.db
      .prepare("INSERT INTO subscription_payments VALUES(?,?,?,?,?,?)")
      .run(
        "pay_annual",
        "sub_annual",
        "inv_annual",
        now.getTime() / 1000,
        new Date("2028-01-31T10:00:00Z").getTime() / 1000,
        0,
      );
    usage.finish(usage.reserve("owner"), true);
    assert.equal(usage.state("owner").remaining, 99);
    assert.equal(usage.state("owner").periodEndsAt, "2027-02-28T10:00:00.000Z");
    now = new Date("2027-02-28T10:00:00Z");
    assert.equal(usage.state("owner").remaining, 100);
    assert.equal(usage.state("owner").periodEndsAt, "2027-03-31T10:00:00.000Z");
    store.db.prepare("UPDATE subscription_payments SET refunded=1").run();
    assert.equal(usage.state("owner").canAnalyze, false);
    assert.equal(
      addMonths(new Date("2028-01-31T10:00:00Z"), 1).toISOString(),
      "2028-02-29T10:00:00.000Z",
    );
  } finally {
    store.close();
  }
});
test("photo HTTP workflow meters only successful, nonempty analysis and leaves description tracking free", async () => {
  let fail = true,
    empty = false,
    calls = 0;
  const ctx = await http({
    visionKey: "fixture-not-real",
    analysis: async (description) => {
      calls++;
      if (fail) throw new Error("Fixture failure");
      const result = await analyzeMeal("two rotis", undefined, {
        model: "fixture",
      });
      return empty ? { ...result, items: [], incomplete: true } : result;
    },
  });
  try {
    await ctx.signup();
    const photo = await sharp({
      create: { width: 20, height: 20, channels: 3, background: "#ccc" },
    })
      .png()
      .toBuffer();
    const send = async () => {
      const form = new FormData();
      form.set(
        "photo",
        new Blob([photo], { type: "image/png" }),
        "fixture.png",
      );
      const r = await fetch(ctx.base + "/api/analyze", {
        method: "POST",
        headers: { Cookie: ctx.cookie() },
        body: form,
      });
      return { response: r, data: await r.json() };
    };
    assert.equal((await send()).response.status, 403);
    assert.equal(calls, 0);
    await ctx.request("/api/plus/start-trial", "POST");
    assert.equal((await send()).response.status, 500);
    assert.equal((await ctx.request("/api/photo-usage")).data.remaining, 100);
    fail = false;
    empty = true;
    await send();
    assert.equal((await ctx.request("/api/photo-usage")).data.remaining, 100);
    empty = false;
    await send();
    assert.equal((await ctx.request("/api/photo-usage")).data.remaining, 99);
    await ctx.request("/api/analyze", "POST", { description: "two rotis" });
    assert.equal((await ctx.request("/api/photo-usage")).data.remaining, 99);
  } finally {
    await ctx.close();
  }
});
test("regional recipes respect diet/allergies, time and budget, with traceable oil-free corrections", async () => {
  assert.ok(catalog.length > 60);
  assert.ok(foodById.has("rajma"));
  const preferences = {
    ...profile,
    diet: "vegan" as const,
    allergies: [
      "Wheat / gluten",
      "Soy",
      "Peanuts",
      "Tree nuts",
    ] as Profile["allergies"],
    cookingMinutes: 15 as const,
  };
  const plan = buildPlan(preferences);
  for (const day of plan.days)
    for (const meal of day.menu)
      for (const item of meal.items) {
        const meta = recipeMetadata[item.foodId];
        if (meta) {
          assert.equal(meta.diet, "vegan");
          assert.ok(meta.minutes <= 15);
          assert.ok(
            !meta.allergens.some((a) =>
              preferences.allergies.includes(a as any),
            ),
          );
        }
        assert.ok(
          !["salmon", "avocado", "quinoa", "cashews"].includes(item.foodId),
        );
      }
  const normal = await analyzeMeal("200 g chole", undefined, {
      model: "fixture",
    }),
    noOil = await analyzeMeal("200 g chole without oil", undefined, {
      model: "fixture",
    });
  assert.equal(noOil.items[0].foodId, "chole-no-oil");
  assert.ok(noOil.totals.fat < normal.totals.fat);
  assert.equal(noOil.uncertainty!.level, "moderate");
  assert.equal(
    (await analyzeMeal("100 g rice", undefined, { model: "fixture" }))
      .uncertainty!.level,
    "lower",
  );
});
test("meal swaps preserve other meals, completed snapshots, target math and survive profile refresh", async () => {
  const ctx = await http();
  try {
    await ctx.signup();
    await ctx.request("/api/profile", "PUT", profile);
    const started = (await ctx.request("/api/plan-program/start", "POST")).data;
    const id = started.program.id,
      old = started.program.plan.days[0];
    const choices = (
      await ctx.request(`/api/plan-program/${id}/days/1/alternatives?slot=1`)
    ).data;
    assert.ok(choices.alternatives.length);
    const chosen = choices.alternatives[0],
      swapped = (
        await ctx.request(`/api/plan-program/${id}/days/1/swap`, "PUT", {
          slot: 1,
          option: chosen.option,
          revision: choices.revision,
        })
      ).data;
    assert.deepEqual(swapped.program.plan.days[0].menu[0], old.menu[0]);
    assert.deepEqual(swapped.program.plan.days[0].menu[2], old.menu[2]);
    assert.equal(
      Math.round(swapped.program.plan.days[0].totals.kcal),
      Math.round(chosen.dayTotals.kcal),
    );
    assert.equal(
      (
        await ctx.request(`/api/plan-program/${id}/days/1/swap`, "PUT", {
          slot: 1,
          option: chosen.option,
          revision: choices.revision,
        })
      ).response.status,
      409,
    );
    await ctx.request("/api/profile", "PUT", profile);
    assert.deepEqual(
      (await ctx.request("/api/plan-program")).data.program.plan.days[0]
        .menu[1],
      chosen.meal,
    );
    await ctx.request(`/api/plan-program/${id}/days/1`, "PUT", {
      completed: true,
    });
    const nextChoices = (
      await ctx.request(`/api/plan-program/${id}/days/1/alternatives?slot=1`)
    ).data;
    assert.equal(
      (
        await ctx.request(`/api/plan-program/${id}/days/1/swap`, "PUT", {
          slot: 1,
          option: nextChoices.alternatives[0].option,
          revision: nextChoices.revision,
        })
      ).data.error.code,
      "DAY_COMPLETE",
    );
  } finally {
    await ctx.close();
  }
});

test("account deletion preserves the account when renewal cancellation fails and anonymizes billing only after confirmation", async () => {
  let now = new Date("2026-10-23T10:00:00Z"),
    failCancel = true;
  const subscription = {
    id: "sub_deleteFixture",
    plan_id: "plan_deleteFixture",
    status: "created",
    quantity: 1,
  };
  const ctx = await http({
    clock: () => now,
    payments: {
      keyId: "rzp_test_fixture",
      keySecret: "fixture-not-real",
      webhookSecret: "fixture-not-real",
      planId: "plan_deleteFixture",
    },
    paymentFetch: async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/plans/plan_deleteFixture"))
        return Response.json({
          id: "plan_deleteFixture",
          period: "monthly",
          interval: 1,
          item: { amount: 19900, currency: "INR" },
        });
      if (
        path.endsWith("/subscriptions") ||
        path.endsWith("/subscriptions/sub_deleteFixture")
      )
        return Response.json(subscription);
      if (path.endsWith("/invoices")) return Response.json({ items: [] });
      if (path.endsWith("/cancel")) {
        if (failCancel) return Response.json({}, { status: 503 });
        subscription.status = "cancelled";
        return Response.json(subscription);
      }
      throw new Error("Unexpected fixture provider request");
    },
  });
  try {
    const user = await ctx.signup();
    await ctx.request("/api/plus/start-trial", "POST");
    now = new Date("2026-11-22T10:00:00Z");
    assert.equal(
      (await ctx.request("/api/billing/subscriptions", "POST", {})).response
        .status,
      200,
    );
    const body = { password: "upgrade-password-123", confirmation: "DELETE" };
    assert.equal(
      (await ctx.request("/api/account/delete", "POST", body)).response.status,
      502,
    );
    assert.equal((await ctx.request("/api/auth/me")).data.user.id, user.id);
    assert.equal(
      (
        ctx.store.db
          .prepare("SELECT deleting_at FROM users WHERE id=?")
          .get(user.id) as any
      ).deleting_at,
      null,
    );
    failCancel = false;
    assert.equal(
      (await ctx.request("/api/account/delete", "POST", body)).response.status,
      204,
    );
    const row = ctx.store.db
      .prepare(
        "SELECT user_id,cancel_at_period_end FROM plan_subscriptions WHERE id=?",
      )
      .get(subscription.id) as any;
    assert.match(row.user_id, /^deleted:/);
    assert.notEqual(row.user_id, user.id);
    assert.equal(row.cancel_at_period_end, 1);
  } finally {
    await ctx.close();
  }
});
