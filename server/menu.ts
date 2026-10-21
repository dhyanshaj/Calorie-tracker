import { foodById } from "../shared/catalog";
import { emptyNutrients, sumNutrients } from "../shared/nutrition";
import type { MealPlanDay, PlannedMeal, Profile } from "../shared/profile";
import type { Nutrients } from "../shared/types";

type Serving = [id: string, grams: number, min: number, max: number];
const allergens: Record<string, Profile["allergies"][number][]> = {
  milk: ["Milk"],
  yogurt: ["Milk"],
  ghee: ["Milk"],
  egg: ["Eggs"],
  salmon: ["Fish"],
  tofu: ["Soy"],
  "peanut-butter": ["Peanuts"],
  almonds: ["Tree nuts"],
  roti: ["Wheat / gluten"],
  bread: ["Wheat / gluten"],
  oats: ["Wheat / gluten"],
};
const days = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const slots = ["Breakfast", "Lunch", "Dinner", "Snack"];
const templates: Serving[][][] = [
  [
    [
      ["oats", 234, 120, 400],
      ["banana", 118, 80, 160],
      ["milk", 200, 100, 300],
    ],
    [
      ["rice", 180, 100, 300],
      ["chicken", 150, 80, 260],
      ["broccoli", 150, 100, 220],
      ["oil", 8, 0, 18],
    ],
    [
      ["roti", 90, 45, 180],
      ["dal", 220, 150, 350],
      ["spinach", 150, 80, 220],
      ["yogurt", 150, 100, 250],
    ],
    [
      ["apple", 182, 100, 220],
      ["almonds", 25, 10, 40],
      ["chickpeas", 100, 60, 220],
    ],
  ],
  [
    [
      ["bread", 64, 32, 96],
      ["egg", 100, 50, 150],
      ["avocado", 70, 30, 120],
      ["apple", 150, 100, 220],
    ],
    [
      ["potato", 230, 150, 350],
      ["salmon", 150, 90, 240],
      ["broccoli", 150, 100, 220],
    ],
    [
      ["rice", 180, 100, 300],
      ["lentils", 220, 140, 350],
      ["tofu", 130, 80, 240],
      ["spinach", 120, 80, 200],
      ["oil", 8, 0, 18],
    ],
    [
      ["yogurt", 200, 120, 300],
      ["banana", 118, 80, 160],
      ["almonds", 20, 10, 40],
    ],
  ],
  [
    [
      ["yogurt", 220, 120, 300],
      ["banana", 118, 80, 160],
      ["oats", 200, 120, 350],
      ["peanut-butter", 20, 10, 35],
    ],
    [
      ["roti", 90, 45, 180],
      ["chicken-curry", 200, 120, 300],
      ["spinach", 120, 80, 200],
    ],
    [
      ["potato", 220, 150, 350],
      ["chickpeas", 200, 120, 320],
      ["broccoli", 150, 100, 220],
      ["oil", 8, 0, 18],
    ],
    [
      ["egg", 100, 50, 150],
      ["apple", 182, 100, 220],
      ["almonds", 25, 10, 40],
    ],
  ],
  [
    [
      ["bread", 64, 32, 128],
      ["peanut-butter", 25, 10, 40],
      ["banana", 118, 80, 160],
      ["milk", 200, 100, 300],
    ],
    [
      ["rice", 180, 100, 300],
      ["tofu", 200, 120, 320],
      ["broccoli", 160, 100, 220],
      ["oil", 8, 0, 18],
    ],
    [
      ["roti", 90, 45, 180],
      ["dal", 240, 150, 350],
      ["chicken", 130, 80, 220],
      ["spinach", 100, 80, 180],
    ],
    [
      ["yogurt", 200, 120, 300],
      ["apple", 182, 100, 220],
      ["almonds", 20, 10, 40],
    ],
  ],
  [
    [
      ["oats", 250, 150, 400],
      ["milk", 220, 100, 300],
      ["apple", 182, 100, 220],
      ["almonds", 20, 10, 35],
    ],
    [
      ["potato", 230, 150, 350],
      ["chicken", 150, 80, 260],
      ["spinach", 150, 80, 220],
      ["oil", 8, 0, 18],
    ],
    [
      ["rice", 180, 100, 300],
      ["chickpeas", 200, 120, 320],
      ["tofu", 130, 80, 240],
      ["broccoli", 150, 100, 220],
      ["oil", 8, 0, 18],
    ],
    [
      ["bread", 32, 32, 64],
      ["peanut-butter", 20, 10, 35],
      ["banana", 118, 80, 160],
    ],
  ],
  [
    [
      ["bread", 64, 32, 96],
      ["egg", 100, 50, 150],
      ["spinach", 100, 80, 180],
      ["avocado", 70, 30, 120],
    ],
    [
      ["roti", 90, 45, 180],
      ["dal", 220, 150, 350],
      ["yogurt", 180, 100, 280],
      ["broccoli", 150, 100, 220],
    ],
    [
      ["rice", 180, 100, 300],
      ["salmon", 150, 90, 240],
      ["spinach", 150, 80, 220],
      ["oil", 8, 0, 18],
    ],
    [
      ["banana", 118, 80, 160],
      ["almonds", 25, 10, 40],
      ["chickpeas", 140, 80, 240],
    ],
  ],
  [
    [
      ["yogurt", 220, 120, 300],
      ["apple", 182, 100, 220],
      ["oats", 200, 120, 350],
      ["almonds", 25, 10, 40],
    ],
    [
      ["rice", 180, 100, 300],
      ["chicken-curry", 220, 120, 320],
      ["broccoli", 150, 100, 220],
    ],
    [
      ["potato", 230, 150, 350],
      ["lentils", 220, 140, 350],
      ["tofu", 150, 80, 250],
      ["spinach", 150, 80, 220],
      ["oil", 8, 0, 18],
    ],
    [
      ["bread", 64, 32, 96],
      ["peanut-butter", 20, 10, 35],
      ["banana", 118, 80, 160],
    ],
  ],
];
const shortNames: Record<string, string> = {
  rice: "Rice",
  roti: "Roti",
  bread: "Whole-wheat toast",
  oats: "Oatmeal",
  chicken: "Chicken",
  "chicken-curry": "Chicken curry",
  dal: "Lentil dal",
  lentils: "Lentils",
  chickpeas: "Chickpeas",
  tofu: "Tofu",
  salmon: "Salmon",
  egg: "Boiled eggs",
  yogurt: "Yogurt",
  milk: "Milk",
  banana: "Banana",
  apple: "Apple",
  broccoli: "Broccoli",
  spinach: "Spinach",
  potato: "Baked potato",
  avocado: "Avocado",
  almonds: "Almonds",
  "peanut-butter": "Peanut butter",
  oil: "Olive oil",
};
function substitute(serving: Serving, profile: Profile): Serving | null {
  const allowed = (id: string) =>
    !allergens[id]?.some((a) => profile.allergies.includes(a));
  let [id, grams, min, max] = serving;
  if (
    profile.diet !== "balanced" &&
    ["chicken", "chicken-curry", "salmon"].includes(id)
  )
    id = "tofu";
  if (profile.diet === "vegan" && id === "egg") id = "tofu";
  if (
    (profile.diet === "vegan" || !allowed(id)) &&
    ["milk", "yogurt"].includes(id)
  )
    return null;
  if (!allowed(id)) {
    if (["tofu", "egg"].includes(id)) id = "chickpeas";
    else if (id === "salmon")
      id = profile.diet === "balanced" ? "chicken" : "chickpeas";
    else if (["roti", "bread", "oats"].includes(id)) {
      id = "rice";
      grams = 160;
      min = 100;
      max = 300;
    } else if (["almonds", "peanut-butter"].includes(id)) {
      id = "avocado";
      grams = 70;
      min = 30;
      max = 150;
    } else return null;
  }
  return allowed(id) ? [id, grams, min, max] : null;
}
function dishTitle(slot: string, ids: string[]) {
  if (slot === "Breakfast") {
    if (ids.includes("oats")) return "Warm oats, fruit & toppings";
    if (ids.includes("bread")) return "Toast & breakfast sides";
    if (ids.includes("yogurt")) return "Fruit & yogurt breakfast bowl";
    return "Savory breakfast bowl";
  }
  if (slot === "Snack")
    return ids
      .slice(0, 3)
      .map((id) => shortNames[id])
      .join(" · ");
  if (ids.includes("chicken-curry"))
    return `${ids.includes("roti") ? "Roti" : "Rice"} & chicken curry`;
  if (ids.includes("salmon"))
    return `Salmon & ${ids.includes("potato") ? "baked potato" : "rice"}`;
  if (ids.includes("dal"))
    return `${ids.includes("roti") ? "Roti" : "Rice"} & lentil dal`;
  if (ids.includes("chicken"))
    return `Chicken & ${ids.includes("potato") ? "potato plate" : "rice bowl"}`;
  if (ids.includes("tofu")) return "Tofu, grains & vegetables";
  return ids.includes("chickpeas")
    ? "Chickpea & vegetable bowl"
    : "Lentil & vegetable plate";
}
function preparation(ids: string[]) {
  const steps: string[] = [];
  if (ids.includes("oats"))
    steps.push(
      "Cook oats in water, then weigh the cooked portion. Add the listed fruit and toppings.",
    );
  else if (ids.includes("bread"))
    steps.push("Toast the bread without butter; serve with the listed sides.");
  else if (ids.some((id) => ["rice", "potato", "roti"].includes(id)))
    steps.push(
      "Prepare the rice, potato, or rotis without extra fat; use the cooked edible weights shown.",
    );
  if (ids.some((id) => ["chicken", "salmon", "egg", "tofu"].includes(id)))
    steps.push(
      "Cook the protein thoroughly and weigh the edible portion after cooking. Exclude shells, bones, and skin.",
    );
  if (ids.some((id) => ["chickpeas", "lentils"].includes(id)))
    steps.push(
      "Use cooked, drained legumes and warm them with the vegetables.",
    );
  if (ids.some((id) => ["chicken-curry", "dal"].includes(id)))
    steps.push(
      "Measure the prepared curry or dal. Its recipe already includes cooking oil; do not add that oil again.",
    );
  if (ids.includes("oil"))
    steps.push(
      "Use only the displayed extra oil for cooking or dressing; it is included in this meal’s estimate.",
    );
  if (!steps.length)
    steps.push(
      "Assemble the listed foods. Weigh fruit without peels, pits, or cores; use unsweetened yogurt and plain nuts.",
    );
  return steps;
}
function portionLabel(id: string, grams: number) {
  const food = foodById.get(id)!;
  const portion = food.portions.find((p) => p.unit !== "g");
  if (!portion) return `${grams} g edible`;
  const count = Number((grams / portion.grams).toFixed(1));
  return `about ${count} × ${portion.label}`;
}
function buildDay(
  profile: Profile,
  targets: Nutrients,
  index: number,
): MealPlanDay {
  const entries = templates[index].flatMap((servings, slot) =>
    servings.flatMap((s) => {
      const selected = substitute(s, profile);
      if (!selected) return [];
      const [id, grams, min, max] = selected;
      return [{ slot, id, grams, min, max, n: foodById.get(id)!.per100 }];
    }),
  );
  // Merge substitutions that resolve to the same ingredient in the same meal.
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    const prior = entries.findIndex((p) => p.slot === e.slot && p.id === e.id);
    if (prior < i) {
      const p = entries[prior];
      p.grams = Math.min(400, p.grams + e.grams);
      p.min = Math.min(200, p.min + e.min);
      p.max = Math.min(450, p.max + e.max);
      entries.splice(i, 1);
    }
  }
  // Keep eggs, slices and rotis whole; use practical weight increments elsewhere.
  const increments: Record<string, number> = {
    egg: 50,
    bread: 32,
    roti: 45,
    oil: 0.5,
  };
  const practicalWeight = (entry: (typeof entries)[number], grams: number) => {
    const increment = increments[entry.id] ?? 5;
    return Math.max(
      entry.min,
      Math.min(entry.max, Math.round(grams / increment) * increment),
    );
  };
  for (const entry of entries)
    entry.grams = practicalWeight(entry, entry.grams);
  const score = () => {
    const n = entries.reduce(
      (a, e) => ({
        kcal: a.kcal + (e.n.kcal * e.grams) / 100,
        protein: a.protein + (e.n.protein * e.grams) / 100,
        fat: a.fat + (e.n.fat * e.grams) / 100,
      }),
      emptyNutrients(),
    );
    return (
      ((n.kcal - targets.kcal) / targets.kcal) ** 2 * 3 +
      ((n.protein - targets.protein) / targets.protein) ** 2 +
      ((n.fat - targets.fat) / targets.fat) ** 2
    );
  };
  for (const step of [50, 20, 10, 5, 1])
    for (let iter = 0; iter < 20; iter++)
      for (const e of entries) {
        const original = e.grams;
        let best = score(),
          chosen = original;
        for (const delta of [-step, step]) {
          e.grams = practicalWeight(e, original + delta);
          const current = score();
          if (current < best) {
            best = current;
            chosen = e.grams;
          }
        }
        e.grams = chosen;
      }
  const menu: PlannedMeal[] = slots.map((name, slot) => {
    const items = entries
      .filter((e) => e.slot === slot && e.grams > 0)
      .map((e) => ({
        foodId: e.id,
        name: foodById.get(e.id)!.name,
        grams: e.grams,
        portionLabel: portionLabel(e.id, e.grams),
        nutrients: {
          kcal: (e.n.kcal * e.grams) / 100,
          protein: (e.n.protein * e.grams) / 100,
          fat: (e.n.fat * e.grams) / 100,
        },
      }));
    const ids = items.map((i) => i.foodId);
    return {
      name,
      title: dishTitle(name, ids),
      preparation: preparation(ids),
      items,
      totals: sumNutrients(items),
    };
  });
  const totals = sumNutrients(menu.map((meal) => ({ nutrients: meal.totals })));
  const closeToTargets =
    Math.abs(totals.kcal - targets.kcal) <= targets.kcal * 0.1 &&
    Math.abs(totals.protein - targets.protein) <= targets.protein * 0.15 &&
    Math.abs(totals.fat - targets.fat) <= targets.fat * 0.15;
  return { day: days[index], menu, totals, closeToTargets };
}
export function buildWeekMenu(
  profile: Profile,
  targets: Nutrients,
): MealPlanDay[] {
  return days.map((_, index) => buildDay(profile, targets, index));
}
