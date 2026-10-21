import raw from "../data/usda-sr28.json";
import type { Food, Nutrients, Portion } from "./types";
const usda = raw as Record<string, Nutrients & { description: string }>;
const p = (unit: string, grams: number, label = unit): Portion => ({
  unit,
  grams,
  label,
});
const g = p("g", 1, "grams");
function source(ids: string[], recipe = false) {
  return {
    label: recipe ? "Recipe estimate · USDA SR28" : "USDA SR28",
    url: "https://fdc.nal.usda.gov/data-documentation.html",
    note: ids.map((id) => `NDB ${id}: ${usda[id].description}`).join("; "),
  };
}
function density(id: string): Nutrients {
  const { kcal, protein, fat } = usda[id];
  return { kcal, protein, fat };
}
function recipe(parts: [string, number][]): Nutrients {
  return parts.reduce(
    (acc, [id, weight]) => {
      const n = density(id);
      return {
        kcal: acc.kcal + (n.kcal * weight) / 100,
        protein: acc.protein + (n.protein * weight) / 100,
        fat: acc.fat + (n.fat * weight) / 100,
      };
    },
    { kcal: 0, protein: 0, fat: 0 },
  );
}
function food(
  id: string,
  ndb: string,
  name: string,
  aliases: string[],
  portions: Portion[],
  assumption: string,
  category = "Everyday foods",
): Food {
  return {
    id,
    name,
    aliases,
    per100: density(ndb),
    portions: [...portions, g],
    assumption,
    category,
    source: source([ndb]),
  };
}
export const catalog: Food[] = [
  {
    id: "roti",
    name: "Plain whole-wheat roti",
    category: "Indian kitchen",
    aliases: ["roti", "rotis", "chapati", "chapatis", "phulka", "phulkas"],
    per100: recipe([["20080", (100 * 30) / 45]]),
    portions: [p("piece", 45, "medium roti"), g],
    assumption:
      "1 medium roti = 30 g whole-wheat flour + 15 g water (45 g cooked). No ghee or oil included.",
    source: source(["20080"], true),
  },
  {
    id: "chicken-curry",
    name: "Chicken curry",
    category: "Indian kitchen",
    aliases: ["chicken curry", "chicken pieces", "curry chicken"],
    per100: recipe([
      ["05098", 60],
      ["11529", 25],
      ["11283", 10],
      ["04053", 5],
    ]),
    portions: [
      p("piece", 55, "bone-in piece + gravy, edible part"),
      p("cup", 200),
      g,
    ],
    assumption:
      "1 bone-in piece ≈ 35 g edible meat/curry + 20 g gravy, excluding bone. Curry baseline: 60% cooked thigh, 35% tomato/onion, 5% oil. Adjust edible grams for your pieces.",
    source: source(["05098", "11529", "11283", "04053"], true),
  },
  {
    id: "dal",
    name: "Lentil dal",
    category: "Indian kitchen",
    aliases: ["dal", "daal", "dhal", "lentil curry"],
    per100: recipe([
      ["16070", 90],
      ["11529", 7],
      ["04053", 3],
    ]),
    portions: [p("cup", 200), g],
    assumption:
      "Dal recipe: 90% cooked lentils, 7% tomato, 3% oil. A cup is estimated at 200 g; watery or richer dal differs.",
    source: source(["16070", "11529", "04053"], true),
  },
  food(
    "rice",
    "20045",
    "Cooked white rice",
    ["rice", "white rice", "basmati rice"],
    [p("cup", 158)],
    "1 cup ≈ 158 g cooked rice, without added oil.",
  ),
  food(
    "chicken",
    "05064",
    "Cooked chicken breast",
    ["chicken breast", "grilled chicken", "chicken"],
    [p("piece", 120, "breast portion")],
    "Skinless cooked breast. 1 portion ≈ 120 g edible meat; bone is excluded.",
  ),
  food(
    "lentils",
    "16070",
    "Cooked lentils",
    ["lentils"],
    [p("cup", 198)],
    "Boiled without oil. 1 cup ≈ 198 g.",
  ),
  food(
    "chickpeas",
    "16057",
    "Cooked chickpeas",
    ["chickpeas", "chana", "garbanzo beans"],
    [p("cup", 164)],
    "Boiled without oil or gravy. 1 cup ≈ 164 g.",
  ),
  food(
    "egg",
    "01129",
    "Boiled egg",
    ["boiled eggs", "boiled egg", "eggs", "egg"],
    [p("piece", 50, "large egg")],
    "1 large egg ≈ 50 g edible portion. No cooking oil included.",
  ),
  food(
    "oil",
    "04053",
    "Olive oil / added cooking oil",
    ["olive oil", "cooking oil", "oil"],
    [p("tsp", 4.5, "teaspoon"), p("tbsp", 13.5, "tablespoon")],
    "Olive oil used as a reference for added cooking oil. Enter only the amount you ate.",
  ),
  food(
    "ghee",
    "01003",
    "Ghee / butter oil",
    ["ghee", "butter"],
    [p("tsp", 4.5, "teaspoon"), p("tbsp", 13.5, "tablespoon")],
    "Anhydrous butter oil used as a ghee reference; regular butter contains more water.",
  ),
  food(
    "yogurt",
    "01116",
    "Plain whole-milk yogurt",
    ["yogurt", "yoghurt", "curd", "dahi"],
    [p("cup", 245)],
    "Plain, unsweetened whole-milk yogurt. 1 cup ≈ 245 g.",
  ),
  food(
    "banana",
    "09040",
    "Banana",
    ["banana", "bananas"],
    [p("piece", 118, "medium banana")],
    "1 medium banana ≈ 118 g without peel.",
  ),
  food(
    "apple",
    "09003",
    "Apple",
    ["apple", "apples"],
    [p("piece", 182, "medium apple")],
    "1 medium apple ≈ 182 g, including skin, excluding core.",
  ),
  food(
    "broccoli",
    "11091",
    "Cooked broccoli",
    ["broccoli"],
    [p("cup", 156)],
    "Boiled, drained; no oil or butter included.",
  ),
  food(
    "salmon",
    "15237",
    "Cooked salmon",
    ["salmon"],
    [p("piece", 150, "fillet")],
    "Farmed Atlantic salmon, dry heat. 1 fillet ≈ 150 g, no added oil.",
  ),
  food(
    "tofu",
    "16426",
    "Firm tofu",
    ["tofu"],
    [p("cup", 252)],
    "Firm calcium-set tofu; no cooking oil included.",
  ),
  food(
    "bread",
    "18075",
    "Whole-wheat bread",
    ["whole wheat bread", "whole-wheat bread", "bread", "toast"],
    [p("slice", 32)],
    "1 slice ≈ 32 g. Butter and spreads are separate.",
  ),
  food(
    "milk",
    "01077",
    "Whole milk",
    ["milk"],
    [p("cup", 244), p("ml", 1.03, "millilitres")],
    "3.25% fat whole milk. 1 cup ≈ 244 g.",
  ),
  food(
    "potato",
    "11674",
    "Baked potato",
    ["baked potato", "potatoes", "potato"],
    [p("piece", 173, "medium potato")],
    "Skin included; no butter or oil. 1 medium baked potato ≈ 173 g.",
  ),
  food(
    "avocado",
    "09037",
    "Avocado",
    ["avocado", "avocados"],
    [p("piece", 150, "avocado, edible flesh")],
    "1 avocado ≈ 150 g flesh; skin and pit excluded.",
  ),
  food(
    "oats",
    "08121",
    "Cooked oatmeal",
    ["oatmeal", "porridge", "oats"],
    [p("cup", 234)],
    "Oats cooked in water without milk, sugar, or added fat.",
  ),
  food(
    "spinach",
    "11458",
    "Cooked spinach",
    ["spinach"],
    [p("cup", 180)],
    "Boiled, drained spinach without added oil.",
  ),
  food(
    "peanut-butter",
    "16398",
    "Peanut butter",
    ["peanut butter"],
    [p("tbsp", 16, "tablespoon")],
    "Smooth peanut butter without salt. 1 tbsp ≈ 16 g.",
  ),
  food(
    "almonds",
    "12061",
    "Almonds",
    ["almonds", "almond"],
    [p("piece", 1.2, "almond")],
    "1 almond ≈ 1.2 g edible nut. Plain, uncoated.",
  ),
];
// Keep oil-free variants explicit so declared cooking fat never gets counted twice.
for (const [baseId, parts] of [
  [
    "chicken-curry",
    [
      ["05098", 60],
      ["11529", 25],
      ["11283", 10],
    ],
  ],
  [
    "dal",
    [
      ["16070", 90],
      ["11529", 7],
    ],
  ],
] as [string, [string, number][]][]) {
  const base = catalog.find((f) => f.id === baseId)!;
  catalog.push({
    ...base,
    id: `${baseId}-no-oil`,
    name: `${base.name} · no added oil`,
    aliases: [],
    per100: recipe(parts),
    assumption: `${base.assumption} This variant replaces the baseline oil with water. Add any stated oil separately.`,
    source: source(
      parts.map(([id]) => id),
      true,
    ),
  });
}
export const foodById = new Map(catalog.map((f) => [f.id, f]));
