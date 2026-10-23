import { recipeMetadata } from "../shared/catalog";
import type { Profile } from "../shared/profile";
export type Serving = [id: string, grams: number, min: number, max: number];
const s = (id: string, g: number, min = 80, max = 300): Serving => [
  id,
  g,
  min,
  max,
];
const indian: Serving[][][] = [
  [
    [s("besan-chilla", 160, 100, 250), s("yogurt", 150), s("orange", 130)],
    [s("upma", 220), s("mung", 150), s("banana", 100)],
    [s("moong-chilla", 180), s("raita", 120)],
    [s("aloo-paratha", 150), s("yogurt", 150), s("cucumber", 100)],
    [s("egg-bhurji", 140), s("roti", 90, 45, 180), s("orange", 130)],
    [s("oats", 230, 120, 350), s("greek-yogurt", 150), s("banana", 110)],
    [s("curd-rice", 220), s("mung-chaat", 160)],
  ],
  [
    [s("chole", 200), s("brown-rice", 180, 100, 300), s("cucumber", 120)],
    [s("rajma", 220), s("rice", 180, 100, 300), s("carrot", 120)],
    [s("khichdi", 300, 200, 450), s("raita", 150), s("mung", 140)],
    [s("chicken-curry", 220), s("roti", 90, 45, 180), s("mixed-sabzi", 150)],
    [s("palak-tofu", 230), s("roti", 90, 45, 180), s("dal", 160)],
    [s("veg-pulao", 220), s("chickpeas", 180), s("raita", 120)],
    [s("dal", 240), s("millet", 180), s("aloo-gobi", 150)],
  ],
  [
    [s("rajma", 230), s("roti", 90, 45, 180), s("spinach", 120)],
    [s("chole", 200), s("rice", 180, 100, 300), s("mixed-sabzi", 150)],
    [s("khichdi", 300, 200, 450), s("tofu", 150), s("cucumber", 100)],
    [s("palak-tofu", 230), s("brown-rice", 180), s("carrot", 150)],
    [s("sambar", 240), s("rice", 180, 100, 300), s("mung", 160)],
    [s("tandoori-chicken", 170), s("veg-pulao", 200), s("cucumber", 120)],
    [s("dal", 240), s("roti", 90, 45, 180), s("aloo-gobi", 150)],
    [s("mung-chaat", 230), s("rice", 180), s("tofu", 150)],
  ],
  [
    [s("fruit-chaat", 180), s("peanuts", 25, 10, 40)],
    [s("mung-chaat", 180), s("orange", 130)],
    [s("greek-yogurt", 180), s("banana", 110), s("almonds", 20, 10, 35)],
    [s("chickpeas", 130), s("apple", 150), s("peanuts", 25, 10, 40)],
    [s("yogurt", 180), s("fruit-chaat", 180), s("almonds", 20, 10, 35)],
    [s("egg", 100, 50, 150), s("orange", 130), s("peanuts", 20, 10, 35)],
  ],
];
const mediterranean: Serving[][][] = [
  [
    [s("oat-yogurt-bowl", 260), s("almonds", 25, 10, 40)],
    [s("bread", 64, 32, 128), s("hummus", 90), s("cucumber", 130)],
    [s("greek-yogurt", 200), s("oats", 200), s("orange", 130)],
  ],
  [
    [s("quinoa-bowl", 280), s("tofu", 160)],
    [
      s("chickpeas", 200),
      s("brown-rice", 170),
      s("cucumber", 120),
      s("oil", 8, 0, 18),
    ],
    [
      s("chicken", 160),
      s("potato", 220),
      s("broccoli", 150),
      s("oil", 8, 0, 18),
    ],
  ],
  [
    [s("salmon", 150), s("quinoa", 180), s("broccoli", 170)],
    [
      s("lentils", 230),
      s("brown-rice", 180),
      s("carrot", 160),
      s("oil", 10, 0, 18),
    ],
    [s("tofu", 220), s("rice", 180), s("spinach", 160), s("oil", 10, 0, 18)],
  ],
  [
    [s("hummus", 80), s("carrot", 150), s("bread", 64, 32, 128)],
    [s("orange", 130), s("almonds", 25, 10, 40), s("yogurt", 180)],
    [s("apple", 150), s("peanut-butter", 25, 10, 35), s("bread", 64, 32, 128)],
  ],
];
export function mealOptions(
  profile: Profile,
  slot: number,
  fallback: Serving[][],
): Serving[][] {
  const cuisine =
    profile.cuisine ??
    (/india/i.test(profile.country) ? "indian" : "international");
  const pool =
    cuisine === "indian"
      ? indian[slot]
      : cuisine === "mediterranean"
        ? mediterranean[slot]
        : [...indian[slot], ...mediterranean[slot], ...fallback];
  const result = pool.filter((servings) =>
    servings.every(([id]) => {
      const meta = recipeMetadata[id];
      if (
        (profile.budget ?? "everyday") === "everyday" &&
        ["salmon", "avocado", "cashews", "quinoa", "quinoa-bowl"].includes(id)
      )
        return false;
      if (
        meta &&
        (meta.minutes > (profile.cookingMinutes ?? 30) ||
          meta.allergens.some((a) => profile.allergies.includes(a as any)) ||
          (profile.diet === "vegan" && meta.diet !== "vegan") ||
          (profile.diet === "vegetarian" && meta.diet === "balanced"))
      )
        return false;
      return true;
    }),
  );
  // A neutral pantry bowl is available when preference filters exhaust a slot.
  const candidates: Serving[][] = result.length
    ? result
    : [
        [
          s("rice", 160, 100, 300),
          s("lentils", 200),
          s("carrot", 130),
          s("oil", 8, 0, 18),
        ],
      ];
  return candidates.map((servings) =>
    (slot === 1 || slot === 2) && !servings.some(([id]) => id === "oil")
      ? [...servings, s("oil", 5, 0, 15)]
      : servings,
  );
}
