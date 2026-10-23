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
    ingredients: [
      { key: `ndb:${ndb}`, name: usda[ndb].description, gramsPer100: 100 },
    ],
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

// Additional USDA ingredients; each uses a real SR28 record in the pinned archive.
const additions: [string, string, string, string[], number][] = [
  [
    "kidney-beans",
    "16028",
    "Cooked kidney beans",
    ["rajma beans", "kidney beans"],
    177,
  ],
  ["brown-rice", "20037", "Cooked brown rice", ["brown rice"], 195],
  ["quinoa", "20137", "Cooked quinoa", ["quinoa"], 185],
  ["millet", "20032", "Cooked millet", ["millet"], 174],
  ["cauliflower", "11136", "Cooked cauliflower", ["cauliflower", "gobi"], 124],
  ["carrot", "11125", "Cooked carrot", ["carrot", "carrots", "gajar"], 156],
  ["peas", "11305", "Cooked green peas", ["green peas", "matar", "peas"], 160],
  ["cucumber", "11205", "Raw cucumber", ["cucumber", "kheera"], 104],
  ["cabbage", "11109", "Raw cabbage", ["cabbage"], 89],
  ["orange", "09200", "Orange", ["orange", "oranges"], 131],
  [
    "greek-yogurt",
    "01256",
    "Plain nonfat Greek yogurt",
    ["greek yogurt", "greek yoghurt"],
    170,
  ],
  ["mung", "16081", "Cooked mung beans", ["mung beans", "moong beans"], 202],
  [
    "peanuts",
    "16390",
    "Unsalted roasted peanuts",
    ["roasted peanuts", "peanuts"],
    28,
  ],
  ["cashews", "12087", "Raw cashews", ["cashew", "cashews", "kaju"], 28],
];
for (const [id, ndb, name, aliases, grams] of additions)
  catalog.push(
    food(
      id,
      ndb,
      name,
      aliases,
      [p("serving", grams)],
      `Reference portion ≈ ${grams} g edible. No added oil, sugar, or sauce. Weigh and adjust for your serving.`,
    ),
  );
export type RecipeMetadata = {
  allergens: string[];
  diet: "vegan" | "vegetarian" | "balanced";
  minutes: number;
  budget: "everyday" | "flexible";
  cuisine: "indian" | "mediterranean" | "international";
};
export const recipeMetadata: Record<string, RecipeMetadata> = {};
function addRecipe(
  id: string,
  name: string,
  aliases: string[],
  parts: [string, number][],
  grams: number,
  meta: Partial<RecipeMetadata> = {},
) {
  const ingredientText = parts
    .map(([ndb, g]) => `${g} g ${usda[ndb].description.toLowerCase()}`)
    .join(", ");
  const used = parts.reduce((n, [, g]) => n + g, 0);
  if (used > 100.001) throw new Error(`Recipe ${id} exceeds 100 g`);
  catalog.push({
    id,
    name,
    aliases,
    category:
      meta.cuisine === "mediterranean"
        ? "Mediterranean kitchen"
        : "Indian kitchen",
    per100: recipe(parts),
    portions: [p("serving", grams), g],
    source: source(
      parts.map(([ndb]) => ndb),
      true,
    ),
    assumption: `Calculated recipe per 100 g finished edible food: ${ingredientText}${used < 100 ? `, plus ${Number((100 - used).toFixed(1))} g water` : ""}. Portion ≈ ${grams} g. Oil is already included. Restaurant recipes and cooking yields vary; this is a reference recipe, not a measured serving.`,
  });
  catalog.at(-1)!.ingredients = parts.map(([ndb, g]) => ({
    key: `ndb:${ndb}`,
    name: usda[ndb].description,
    gramsPer100: g,
  }));
  recipeMetadata[id] = {
    allergens: [],
    diet: "vegan",
    minutes: 30,
    budget: "everyday",
    cuisine: "indian",
    ...meta,
  };
  if (parts.some(([ndb]) => ndb === "04053")) {
    catalog.push({
      ...catalog.at(-1)!,
      id: `${id}-no-oil`,
      name: `${name} · no added oil`,
      aliases: [],
      per100: recipe(parts.filter(([ndb]) => ndb !== "04053")),
      assumption:
        catalog.at(-1)!.assumption +
        " This variant replaces its oil with water. Add any declared oil separately.",
    });
    recipeMetadata[`${id}-no-oil`] = recipeMetadata[id];
    catalog.at(-1)!.ingredients = parts
      .filter(([ndb]) => ndb !== "04053")
      .map(([ndb, g]) => ({
        key: `ndb:${ndb}`,
        name: usda[ndb].description,
        gramsPer100: g,
      }));
  }
}
addRecipe(
  "chole",
  "Chole · chickpea curry",
  ["chole", "chana masala"],
  [
    ["16057", 78],
    ["11529", 12],
    ["11283", 7],
    ["04053", 3],
  ],
  200,
);
addRecipe(
  "rajma",
  "Rajma · kidney bean curry",
  ["rajma", "rajma curry"],
  [
    ["16028", 78],
    ["11529", 12],
    ["11283", 7],
    ["04053", 3],
  ],
  200,
);
addRecipe(
  "khichdi",
  "Moong dal khichdi",
  ["khichdi", "khichri"],
  [
    ["20045", 45],
    ["16081", 35],
    ["11125", 10],
    ["11305", 7],
    ["04053", 3],
  ],
  250,
);
addRecipe(
  "veg-pulao",
  "Vegetable pulao",
  ["pulao", "veg pulao", "vegetable pulao"],
  [
    ["20045", 75],
    ["11305", 10],
    ["11125", 7],
    ["11283", 5],
    ["04053", 3],
  ],
  200,
);
addRecipe(
  "egg-bhurji",
  "Egg bhurji",
  ["egg bhurji", "anda bhurji"],
  [
    ["01129", 65],
    ["11529", 20],
    ["11283", 10],
    ["04053", 5],
  ],
  120,
  { diet: "vegetarian", allergens: ["Eggs"], minutes: 15 },
);
addRecipe(
  "besan-chilla",
  "Besan chilla",
  ["besan chilla", "chilla", "cheela"],
  [
    ["16157", 35],
    ["11529", 15],
    ["11282", 10],
    ["04053", 3],
  ],
  100,
  { minutes: 15 },
);
addRecipe(
  "moong-chilla",
  "Moong dal chilla",
  ["moong chilla", "moong dal chilla"],
  [
    ["16080", 35],
    ["11529", 10],
    ["11282", 10],
    ["04053", 3],
  ],
  100,
);
addRecipe(
  "upma",
  "Vegetable upma",
  ["upma", "vegetable upma"],
  [
    ["20466", 25],
    ["11305", 15],
    ["11125", 10],
    ["11282", 7],
    ["04053", 3],
  ],
  200,
  { allergens: ["Wheat / gluten"], minutes: 15 },
);
addRecipe(
  "mung-chaat",
  "Cooked moong chaat",
  ["moong chaat", "mung chaat"],
  [
    ["16081", 70],
    ["11529", 15],
    ["11205", 15],
  ],
  180,
  { minutes: 15 },
);
addRecipe(
  "raita",
  "Cucumber raita",
  ["raita", "cucumber raita"],
  [
    ["01116", 70],
    ["11205", 25],
    ["11529", 5],
  ],
  150,
  { diet: "vegetarian", allergens: ["Milk"], minutes: 15 },
);
addRecipe(
  "palak-tofu",
  "Palak tofu",
  ["palak tofu", "tofu palak"],
  [
    ["16426", 60],
    ["11458", 30],
    ["11529", 7],
    ["04053", 3],
  ],
  180,
  { allergens: ["Soy"] },
);
addRecipe(
  "aloo-gobi",
  "Aloo gobi",
  ["aloo gobi"],
  [
    ["11674", 50],
    ["11136", 40],
    ["11529", 7],
    ["04053", 3],
  ],
  180,
);
addRecipe(
  "mixed-sabzi",
  "Mixed vegetable sabzi",
  ["mixed sabzi", "vegetable sabzi", "mixed vegetable sabzi"],
  [
    ["11136", 35],
    ["11125", 25],
    ["11305", 25],
    ["11529", 12],
    ["04053", 3],
  ],
  180,
  { minutes: 15 },
);
addRecipe(
  "sambar",
  "Vegetable sambar",
  ["sambar", "sambhar"],
  [
    ["16070", 50],
    ["11125", 10],
    ["11283", 5],
    ["11529", 10],
    ["04053", 2],
  ],
  200,
);
addRecipe(
  "paratha",
  "Plain whole-wheat paratha",
  ["plain paratha", "paratha"],
  [
    ["20080", 45],
    ["04053", 7],
  ],
  80,
  { allergens: ["Wheat / gluten"] },
);
addRecipe(
  "aloo-paratha",
  "Aloo paratha",
  ["aloo paratha"],
  [
    ["20080", 30],
    ["11674", 35],
    ["04053", 5],
  ],
  100,
  { allergens: ["Wheat / gluten"] },
);
addRecipe(
  "curd-rice",
  "Curd rice",
  ["curd rice", "dahi rice"],
  [
    ["20045", 65],
    ["01116", 30],
    ["11205", 5],
  ],
  220,
  { diet: "vegetarian", allergens: ["Milk"], minutes: 15 },
);
addRecipe(
  "tandoori-chicken",
  "Yogurt-marinated chicken",
  ["tandoori chicken", "chicken tikka"],
  [
    ["05064", 85],
    ["01116", 10],
    ["04053", 3],
    ["11529", 2],
  ],
  150,
  { diet: "balanced", allergens: ["Milk"], minutes: 45 },
);
addRecipe(
  "fruit-chaat",
  "Fresh fruit chaat",
  ["fruit chaat", "fruit salad"],
  [
    ["09003", 40],
    ["09040", 30],
    ["09200", 30],
  ],
  180,
  { minutes: 15 },
);
addRecipe(
  "hummus",
  "Chickpea dip · no tahini",
  ["hummus", "chickpea dip"],
  [
    ["16057", 75],
    ["04053", 8],
  ],
  80,
  { cuisine: "mediterranean", minutes: 15 },
);
addRecipe(
  "quinoa-bowl",
  "Quinoa & chickpea bowl",
  ["quinoa bowl"],
  [
    ["20137", 60],
    ["16057", 25],
    ["11205", 10],
    ["04053", 5],
  ],
  250,
  { cuisine: "mediterranean", budget: "flexible", minutes: 15 },
);
addRecipe(
  "oat-yogurt-bowl",
  "Oat, yogurt & banana bowl",
  ["oat yogurt bowl"],
  [
    ["08121", 60],
    ["01256", 25],
    ["09040", 15],
  ],
  240,
  {
    diet: "vegetarian",
    allergens: ["Milk"],
    cuisine: "international",
    minutes: 15,
  },
);
for (const [id, parts] of [
  ["roti", [["20080", (100 * 30) / 45]]],
  [
    "chicken-curry",
    [
      ["05098", 60],
      ["11529", 25],
      ["11283", 10],
      ["04053", 5],
    ],
  ],
  [
    "dal",
    [
      ["16070", 90],
      ["11529", 7],
      ["04053", 3],
    ],
  ],
] as [string, [string, number][]][]) {
  catalog.find((f) => f.id === id)!.ingredients = parts.map(([ndb, g]) => ({
    key: `ndb:${ndb}`,
    name: usda[ndb].description,
    gramsPer100: g,
  }));
  const variant = catalog.find((f) => f.id === `${id}-no-oil`);
  if (variant)
    variant.ingredients = parts
      .filter(([ndb]) => ndb !== "04053")
      .map(([ndb, g]) => ({
        key: `ndb:${ndb}`,
        name: usda[ndb].description,
        gramsPer100: g,
      }));
}
export const foodById = new Map(catalog.map((f) => [f.id, f]));
