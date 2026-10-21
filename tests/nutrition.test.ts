import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDescription } from "../server/description";
import { analyzeMeal } from "../server/analysis";
import { recognizeMeal } from "../server/vision";
import { foodById } from "../shared/catalog";
import { calculateItem, sumNutrients } from "../shared/nutrition";
import { buildPlan, ageAt } from "../server/plan";
import type { Profile } from "../shared/profile";
const sample =
  "Two medium rotis without ghee and four bone-in pieces of chicken curry with a little gravy.";
test("USDA-based roti and curry calculation uses stated counts and excludes ghee", () => {
  const parsed = parseDescription(sample);
  assert.equal(parsed.items.length, 2);
  assert.deepEqual(
    parsed.items.map((i) => [i.foodId, i.quantity]),
    [
      ["roti", 2],
      ["chicken-curry", 4],
    ],
  );
  assert.equal(parsed.questions.length, 0);
  const totals = sumNutrients(parsed.items);
  assert.ok(Math.abs(totals.kcal - 557.1) < 0.001);
  assert.ok(Math.abs(totals.protein - 41.3924) < 0.001);
  const roti = parsed.items[0];
  const edited = calculateItem({ ...roti, quantity: 3 }, roti.food);
  assert.ok(Math.abs(edited.nutrients.kcal - roti.nutrients.kcal - 102) < 1e-9);
});
test("gram quantities, fractions, small portions and negation are parsed", () => {
  assert.equal(parseDescription("150 g rice").items[0].grams, 150);
  assert.equal(parseDescription("half a cup of rice").items[0].grams, 79);
  assert.equal(parseDescription("1/2 cup rice").items[0].grams, 79);
  assert.equal(parseDescription("two small rotis").items[0].grams, 60);
  assert.equal(parseDescription("one roti without any ghee").items.length, 1);
  assert.equal(parseDescription("two and a half rotis").items[0].quantity, 2.5);
  assert.equal(
    parseDescription("I ate two of the four rotis").items[0].quantity,
    2,
  );
  assert.equal(
    parseDescription("I ate half of the four rotis").items[0].quantity,
    2,
  );
});
test("declared oil replaces a recipe baseline instead of double counting it", () => {
  const none = parseDescription("4 pieces of chicken curry without oil");
  assert.equal(none.items[0].foodId, "chicken-curry-no-oil");
  const one = parseDescription("4 pieces of chicken curry with 1 tsp oil");
  assert.deepEqual(
    one.items.map((i) => i.foodId),
    ["chicken-curry-no-oil", "oil"],
  );
  const extra = parseDescription(
    "4 pieces of chicken curry with 2 tsp extra oil",
  );
  assert.equal(extra.items[0].foodId, "chicken-curry");
  assert.equal(extra.items[1].quantity, 2);
  assert.equal(
    parseDescription("4 pieces of chicken curry without added oil").items
      .length,
    1,
  );
});
test("unrecognized dishes produce a targeted gap instead of invented nutrients", async () => {
  const result = await analyzeMeal("two slices of pizza", undefined, {
    model: "unused",
  });
  assert.equal(result.items.length, 0);
  assert.equal(result.incomplete, true);
  assert.equal(result.totals.kcal, 0);
  assert.ok(result.questions.some((q) => q.includes("pizza")));
});
test("photo analysis refuses to pretend when no key is available", async () => {
  await assert.rejects(
    () => analyzeMeal(sample, Buffer.from("photo"), { model: "unused" }),
    (e: any) => e.code === "VISION_NOT_CONFIGURED",
  );
});
test("explicit description quantities override fixture vision guesses", async () => {
  const result = await analyzeMeal(
    sample,
    Buffer.from("photo"),
    { key: "test-only-not-a-real-key", model: "test" },
    async () => ({
      foods: [
        {
          foodId: "roti",
          name: "Roti",
          quantity: 5,
          unit: "piece",
          gramsPerUnit: 90,
          assumption: "Fixture visual guess",
        },
        {
          foodId: "chicken-curry",
          name: "Curry",
          quantity: 2,
          unit: "piece",
          gramsPerUnit: 100,
          assumption: "Fixture visual guess",
        },
      ],
      questions: [],
      assumptions: [],
    }),
  );
  assert.deepEqual(
    result.items.map((i) => [i.foodId, i.quantity, i.gramsPerUnit]),
    [
      ["roti", 2, 45],
      ["chicken-curry", 4, 55],
    ],
  );
  assert.equal(result.method, "vision");
});
test("vision contract sends image and text, requests structured output, and opts out of stored completions", async () => {
  let body: any;
  const result = await recognizeMeal(
    Buffer.from("test-photo"),
    sample,
    { key: "fixture", model: "fixture-model" },
    async (_url, init) => {
      body = JSON.parse(init!.body as string);
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({
                  foods: [],
                  questions: ["Is this a meal?"],
                  assumptions: [],
                }),
              },
            },
          ],
        }),
        { status: 200 },
      );
    },
  );
  assert.equal(body.store, false);
  assert.equal(body.response_format.json_schema.strict, true);
  assert.ok(body.messages[1].content.some((c: any) => c.type === "image_url"));
  assert.ok(
    body.messages[1].content.some(
      (c: any) => c.text === `Meal description and corrections: ${sample}`,
    ),
  );
  assert.equal(result.questions[0], "Is this a meal?");
});
test("provider failures and malformed output remain errors", async () => {
  await assert.rejects(
    () =>
      recognizeMeal(
        undefined,
        "rice",
        { key: "fixture", model: "fixture" },
        async () => new Response("{}", { status: 401 }),
      ),
    (e: any) => e.code === "VISION_PROVIDER_ERROR",
  );
  await assert.rejects(
    () =>
      recognizeMeal(
        undefined,
        "rice",
        { key: "fixture", model: "fixture" },
        async () =>
          new Response(
            JSON.stringify({
              choices: [
                { finish_reason: "stop", message: { content: "not-json" } },
              ],
            }),
          ),
      ),
    (e: any) => e.code === "VISION_INVALID_RESPONSE",
  );
});
const profile: Profile = {
  name: "Test person",
  birthDate: "1996-05-10",
  country: "India",
  gender: "man",
  energyBasis: "male",
  heightCm: 175,
  weightKg: 80,
  goal: "lose_weight",
  targetWeightKg: 75,
  timelineWeeks: 16,
  barriers: ["A busy schedule"],
  activity: "moderate",
  diet: "balanced",
  allergies: [],
  needsClinicalGuidance: false,
};
test("plan responds to profile, uses weekly activity, and sums real menu nutrients", () => {
  const p = buildPlan(profile, new Date("2026-10-21"));
  assert.equal(p.age, 30);
  assert.equal(p.eligible, true);
  assert.equal(p.menu.length, 4);
  assert.ok(p.targets!.kcal < p.maintenanceKcal!);
  assert.ok(p.barrierTips[0].tip.includes("rotation"));
  const expected = sumNutrients(p.menu.flatMap((m) => m.items));
  for (const key of ["kcal", "protein", "fat"] as const)
    assert.ok(Math.abs(p.menuTotals[key] - expected[key]) < 1e-8);
  const light = buildPlan(
    { ...profile, activity: "light" },
    new Date("2026-10-21"),
  );
  assert.ok(light.targets!.kcal < p.targets!.kcal);
  const gain = buildPlan(
    { ...profile, goal: "gain_weight", targetWeightKg: 83 },
    new Date("2026-10-21"),
  );
  assert.ok(gain.targets!.kcal > p.targets!.kcal);
  for (const m of p.menu)
    for (const item of m.items) {
      assert.ok(foodById.has(item.foodId));
      assert.equal(
        item.nutrients.kcal,
        (foodById.get(item.foodId)!.per100.kcal * item.grams) / 100,
      );
    }
});
test("allergens and vegan preferences filter the actual sample menu", () => {
  const p = buildPlan(
    {
      ...profile,
      diet: "vegan",
      allergies: ["Soy", "Tree nuts", "Wheat / gluten"],
    },
    new Date("2026-10-21"),
  );
  const ids = p.days.flatMap((day) =>
    day.menu.flatMap((m) => m.items.map((i) => i.foodId)),
  );
  for (const excluded of [
    "chicken",
    "milk",
    "yogurt",
    "tofu",
    "almonds",
    "roti",
    "oats",
    "salmon",
    "egg",
    "bread",
  ])
    assert.ok(!ids.includes(excluded));
  assert.ok(p.warnings.some((w) => w.includes("cross-contact")));
});
test("all thirty days contain distinct meals, edible portions, preparation steps and accurate totals", () => {
  const plan = buildPlan(profile, new Date("2026-10-21"));
  assert.equal(plan.days.length, 30);
  assert.equal(new Set(plan.days.map((day) => day.day)).size, 30);
  assert.ok(
    new Set(
      plan.days.map((day) =>
        JSON.stringify(
          day.menu.map((meal) => meal.items.map((item) => item.foodId)),
        ),
      ),
    ).size === 30,
  );
  for (const day of plan.days) {
    assert.deepEqual(
      day.menu.map((meal) => meal.name),
      ["Breakfast", "Lunch", "Dinner", "Snack"],
    );
    const expected = sumNutrients(day.menu.flatMap((meal) => meal.items));
    for (const nutrient of ["kcal", "protein", "fat"] as const)
      assert.ok(Math.abs(day.totals[nutrient] - expected[nutrient]) < 1e-7);
    for (const meal of day.menu) {
      assert.ok(
        meal.title.length > 3 &&
          meal.preparation.length > 0 &&
          meal.items.length > 0,
      );
      assert.equal(
        new Set(meal.items.map((item) => item.foodId)).size,
        meal.items.length,
      );
      for (const item of meal.items) {
        const food = foodById.get(item.foodId)!;
        assert.ok(
          item.grams > 0 && item.grams <= 450 && item.portionLabel.length > 0,
        );
        const wholePortions: Record<string, number> = {
          egg: 50,
          bread: 32,
          roti: 45,
        };
        if (wholePortions[item.foodId])
          assert.equal(item.grams % wholePortions[item.foodId], 0);
        for (const nutrient of ["kcal", "protein", "fat"] as const)
          assert.ok(
            Math.abs(
              item.nutrients[nutrient] -
                (food.per100[nutrient] * item.grams) / 100,
            ) < 1e-7,
          );
      }
    }
    assert.ok(
      Math.abs(day.totals.kcal - plan.targets!.kcal) < plan.targets!.kcal * 0.1,
    );
  }
});
test("weekly meals substitute all listed allergens and retain vegetarian preferences", () => {
  const restricted = buildPlan({
    ...profile,
    diet: "vegan",
    allergies: [
      "Milk",
      "Eggs",
      "Fish",
      "Soy",
      "Peanuts",
      "Tree nuts",
      "Wheat / gluten",
    ],
  });
  const excluded = new Set([
    "milk",
    "yogurt",
    "ghee",
    "egg",
    "salmon",
    "chicken",
    "chicken-curry",
    "tofu",
    "peanut-butter",
    "almonds",
    "bread",
    "roti",
    "oats",
  ]);
  for (const day of restricted.days)
    for (const meal of day.menu)
      for (const item of meal.items) assert.ok(!excluded.has(item.foodId));
  const vegetarian = buildPlan({ ...profile, diet: "vegetarian" });
  for (const day of vegetarian.days)
    for (const meal of day.menu)
      for (const item of meal.items)
        assert.ok(
          !["chicken", "chicken-curry", "salmon"].includes(item.foodId),
        );
  assert.ok(
    restricted.warnings.some((warning) => warning.includes("actual totals")),
  );
  assert.equal(
    buildPlan({ ...profile, needsClinicalGuidance: true }).week.length,
    0,
  );
});
test("age, clinical flags, underweight goals and aggressive timelines receive guarded outcomes", () => {
  assert.equal(
    buildPlan({ ...profile, birthDate: "2012-01-01" }, new Date("2026-10-21"))
      .eligible,
    false,
  );
  assert.equal(
    buildPlan({ ...profile, needsClinicalGuidance: true }).targets,
    null,
  );
  const rapid = buildPlan(
    { ...profile, targetWeightKg: 50, timelineWeeks: 4 },
    new Date("2026-10-21"),
  );
  assert.ok(rapid.warnings.some((w) => w.includes("timeline")));
  assert.ok(rapid.targets!.kcal >= rapid.maintenanceKcal! - 500);
  const under = buildPlan({ ...profile, targetWeightKg: 40 });
  assert.ok(under.warnings.some((w) => w.includes("screening")));
  assert.ok(under.targets!.kcal >= under.maintenanceKcal!);
  assert.equal(ageAt("2000-10-22", new Date("2026-10-21")), 25);
});
