import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import sharp from "sharp";
import { createApp } from "../server/app";
import { MealStore } from "../server/store";
let store: MealStore, server: Server, base: string, dir: string, cookie: string;
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  session = cookie,
  extra: Record<string, string> = {},
) {
  const isForm = body instanceof FormData;
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(session ? { cookie: session } : {}),
      ...(body && !isForm ? { "Content-Type": "application/json" } : {}),
      ...extra,
    },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  const data = response.status === 204 ? null : await response.json();
  return { response, data };
}
before(async () => {
  dir = await mkdtemp(join(tmpdir(), "platewise-api-"));
  store = new MealStore(join(dir, "test.sqlite"));
  const app = createApp(store, { visionModel: "unused" });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
  const { response } = await request(
    "/api/auth/signup",
    "POST",
    {
      name: "Test person",
      email: "test@example.com",
      password: "test-password-123",
    },
    "",
  );
  cookie = response.headers.get("set-cookie")!.split(";")[0];
});
after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  store.close();
  await rm(dir, { recursive: true, force: true });
});
test("accounts require authentication, hash passwords and use HttpOnly sessions", async () => {
  const unauth = await request("/api/foods", "GET", undefined, "");
  assert.equal(unauth.response.status, 401);
  const user = await request("/api/auth/me");
  assert.equal(user.data.user.name, "Test person");
  assert.equal(user.data.user.password_hash, undefined);
  const row = store.db
    .prepare("SELECT password_hash FROM users WHERE email=?")
    .get("test@example.com") as any;
  assert.ok(!row.password_hash.includes("test-password-123"));
  assert.match(row.password_hash, /^[a-f0-9]+:[a-f0-9]+$/);
  const login = await request(
    "/api/auth/login",
    "POST",
    { email: "test@example.com", password: "test-password-123" },
    "",
  );
  assert.equal(login.response.status, 200);
  assert.match(login.response.headers.get("set-cookie")!, /HttpOnly/i);
  assert.match(login.response.headers.get("set-cookie")!, /SameSite=Strict/i);
  const invalid = await request(
    "/api/auth/login",
    "POST",
    { email: "test@example.com", password: "wrong-password" },
    "",
  );
  assert.equal(invalid.response.status, 401);
});
test("description corrections, recalculation, confirmation, editing, persistence and deletion work end to end", async () => {
  const estimate = await request("/api/analyze", "POST", {
    description:
      "Two medium rotis without ghee and four bone-in pieces of chicken curry with some gravy",
  });
  assert.equal(estimate.response.status, 200);
  assert.equal(estimate.data.items[0].quantity, 2);
  const start = "2026-10-20T18:30:00.000Z",
    end = "2026-10-21T18:30:00.000Z";
  const range = `?start=${start}&end=${end}`;
  assert.equal(
    (await request("/api/meals" + range)).data.meals.length,
    0,
    "analysis does not auto-save",
  );
  const items = estimate.data.items.map((i: any) => ({
    id: i.id,
    foodId: i.foodId,
    quantity: i.quantity,
    unit: i.unit,
    gramsPerUnit: i.gramsPerUnit,
  }));
  items[0].quantity = 3;
  const recalc = await request("/api/recalculate", "POST", { items });
  assert.equal(recalc.response.status, 200);
  assert.ok(Math.abs(recalc.data.totals.kcal - 659.1) < 0.001);
  const payload = {
    title: "Roti and curry",
    description: "Corrected to three rotis",
    eatenAt: "2026-10-21T07:00:00.000Z",
    items,
    saveToken: randomUUID(),
    method: "description",
  };
  const saved = await request("/api/meals", "POST", payload);
  assert.equal(saved.response.status, 201);
  const id = saved.data.id;
  const duplicate = await request("/api/meals", "POST", payload);
  assert.equal(duplicate.data.id, id);
  let diary = await request("/api/meals" + range);
  assert.equal(diary.data.meals.length, 1);
  assert.ok(Math.abs(diary.data.totals.kcal - 659.1) < 0.001);
  const reopened = new MealStore(join(dir, "test.sqlite"));
  assert.equal(
    reopened.list(saved.data.id ? "non-owner" : "", start, end).length,
    0,
  );
  const uid = (
    store.db
      .prepare("SELECT id FROM users WHERE email=?")
      .get("test@example.com") as any
  ).id;
  assert.equal(reopened.list(uid, start, end)[0].id, id);
  reopened.close();
  items[0].quantity = 2;
  const edited = await request(`/api/meals/${id}`, "PUT", {
    ...payload,
    items,
    version: 1,
  });
  assert.equal(edited.response.status, 200);
  assert.equal(edited.data.version, 2);
  diary = await request("/api/meals" + range);
  assert.equal(diary.data.meals.length, 1);
  assert.ok(Math.abs(diary.data.totals.kcal - 557.1) < 0.001);
  const stale = await request(`/api/meals/${id}`, "PUT", {
    ...payload,
    version: 1,
  });
  assert.equal(stale.response.status, 409);
  const other = await request(
    "/api/auth/signup",
    "POST",
    {
      name: "Other person",
      email: "other@example.com",
      password: "other-password-123",
    },
    "",
  );
  const otherCookie = other.response.headers.get("set-cookie")!.split(";")[0];
  assert.equal(
    (await request("/api/meals" + range, "GET", undefined, otherCookie)).data
      .meals.length,
    0,
  );
  assert.equal(
    (
      await request(
        `/api/meals/${id}`,
        "PUT",
        { ...payload, version: 2 },
        otherCookie,
      )
    ).response.status,
    404,
  );
  assert.equal(
    (
      await request(
        `/api/meals/${id}?version=2`,
        "DELETE",
        undefined,
        otherCookie,
      )
    ).response.status,
    404,
  );
  assert.equal(
    (await request(`/api/meals/${id}?version=1`, "DELETE")).response.status,
    409,
  );
  assert.equal(
    (await request(`/api/meals/${id}?version=2`, "DELETE")).response.status,
    204,
  );
  diary = await request("/api/meals" + range);
  assert.equal(diary.data.meals.length, 0);
  assert.equal(diary.data.totals.kcal, 0);
});
test("image validation and missing vision credentials return actionable failures without saving photos", async () => {
  const image = await sharp({
    create: { width: 40, height: 40, channels: 3, background: "#ddd" },
  })
    .png()
    .toBuffer();
  const form = new FormData();
  form.append(
    "photo",
    new Blob([new Uint8Array(image)], { type: "image/png" }),
    "fixture.png",
  );
  form.append("description", "one roti");
  const missing = await request("/api/analyze", "POST", form);
  assert.equal(missing.response.status, 503);
  assert.equal(missing.data.error.code, "VISION_NOT_CONFIGURED");
  const broken = new FormData();
  broken.append(
    "photo",
    new Blob(["not an image"], { type: "image/png" }),
    "bad.png",
  );
  assert.equal(
    (await request("/api/analyze", "POST", broken)).data.error.code,
    "INVALID_IMAGE",
  );
  const files = await readdir(dir);
  assert.ok(files.every((f) => f.startsWith("test.sqlite")));
});
test("bad portions, cross-origin mutations, invalid dates and profile data are rejected", async () => {
  assert.equal(
    (
      await request("/api/recalculate", "POST", {
        items: [
          { id: "a", foodId: "rice", quantity: -1, unit: "g", gramsPerUnit: 1 },
        ],
      })
    ).response.status,
    400,
  );
  assert.equal(
    (
      await request("/api/recalculate", "POST", {
        items: [
          { id: "a", foodId: "rice", quantity: 50, unit: "g", gramsPerUnit: 3 },
        ],
      })
    ).response.status,
    400,
  );
  assert.equal(
    (await request("/api/meals?start=bad&end=bad")).response.status,
    400,
  );
  assert.equal(
    (
      await request("/api/auth/logout", "POST", {}, cookie, {
        origin: "https://another.example",
      })
    ).response.status,
    403,
  );
  assert.equal(
    (await request("/api/profile", "PUT", { name: "Test" })).response.status,
    400,
  );
});
test("profile and plan survive sign out/sign in; logged-out session loses access", async () => {
  const profile = {
    name: "Test renamed",
    birthDate: "1996-05-10",
    country: "India",
    gender: "man",
    energyBasis: "male",
    heightCm: 175,
    weightKg: 80,
    goal: "build_muscle",
    targetWeightKg: null,
    timelineWeeks: 12,
    barriers: ["A busy schedule"],
    activity: "moderate",
    diet: "balanced",
    allergies: [],
    needsClinicalGuidance: false,
  };
  const result = await request("/api/profile", "PUT", profile);
  assert.equal(result.response.status, 200);
  assert.ok(result.data.plan.targets.protein > 100);
  assert.equal(result.data.user.name, "Test renamed");
  assert.equal(
    (await request("/api/auth/logout", "POST", {})).response.status,
    204,
  );
  assert.equal((await request("/api/foods")).response.status, 401);
  const login = await request(
    "/api/auth/login",
    "POST",
    { email: "test@example.com", password: "test-password-123" },
    "",
  );
  assert.equal(login.data.user.profile.activity, "moderate");
  assert.ok(login.data.plan.menu.length);
});
