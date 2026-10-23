import { randomUUID } from "node:crypto";
import { catalog, foodById } from "../shared/catalog";
import { calculateItem, sumNutrients } from "../shared/nutrition";
import type { Analysis } from "../shared/types";
import { parseDescription } from "./description";
import { AppError } from "./errors";
import { recognizeMeal, type VisionResult } from "./vision";
export async function analyzeMeal(
  description: string,
  image: Buffer | undefined,
  config: { key?: string; model: string },
  recognize: typeof recognizeMeal = recognizeMeal,
): Promise<Analysis> {
  if (!image && !description.trim())
    throw new AppError(
      400,
      "INPUT_REQUIRED",
      "Add a meal photo or describe what you ate.",
    );
  const parsed = parseDescription(description);
  let result: VisionResult | undefined;
  if (image && !config.key)
    throw new AppError(
      503,
      "VISION_NOT_CONFIGURED",
      "Photo analysis needs a server-side MEAL_VISION_API_KEY. Your photo has not been sent anywhere. Use your description without the photo, or add foods manually.",
    );
  if (config.key)
    result = await recognize(image, description, {
      key: config.key,
      model: config.model,
    });
  let items = parsed.items;
  let assumptions: string[] = [];
  let questions = parsed.questions;
  let incomplete = parsed.unmatched.length > 0;
  if (result) {
    const unknown = result.foods.filter((f) => !foodById.has(f.foodId));
    items = result.foods.flatMap((f) => {
      let food = foodById.get(f.foodId);
      if (!food) return [];
      const family = (id: string) => id.replace(/-no-oil$/, "");
      if ([...parsed.excluded].some((id) => family(id) === family(food!.id)))
        return [];
      const recipeOverride = parsed.items.find(
        (i) =>
          i.foodId.endsWith("-no-oil") && family(i.foodId) === family(food!.id),
      );
      if (recipeOverride) food = recipeOverride.food;
      const explicit = parsed.items.find(
        (i) =>
          parsed.explicit.has(i.foodId) && family(i.foodId) === family(food.id),
      );
      if (explicit) return [explicit];
      const unit = food.portions.some((p) => p.unit === f.unit) ? f.unit : "g";
      const gramsPerUnit = unit === "g" ? 1 : f.gramsPerUnit;
      const quantity =
        unit === f.unit ? f.quantity : f.quantity * f.gramsPerUnit;
      return [
        calculateItem(
          { id: randomUUID(), foodId: food.id, quantity, unit, gramsPerUnit },
          food,
        ),
      ];
    });
    // Deduplicate any repeated model candidates before applying explicit text corrections.
    items = items.filter(
      (item, index, all) =>
        all.findIndex((i) => i.foodId === item.foodId) === index,
    );
    for (const item of parsed.items)
      if (
        parsed.explicit.has(item.foodId) &&
        !items.some((i) => i.foodId === item.foodId)
      )
        items.push(item);
    assumptions = [
      ...result.assumptions,
      ...result.foods
        .filter(
          (f) =>
            foodById.has(f.foodId) &&
            !parsed.explicit.has(f.foodId) &&
            !parsed.excluded.has(f.foodId),
        )
        .map((f) => f.assumption),
    ];
    questions = [
      ...result.questions,
      ...unknown.map(
        (f) =>
          `What is “${f.name}”? It is not in the current food references. Search the food list to include it.`,
      ),
    ];
    incomplete = unknown.length > 0;
  }
  if (!items.length)
    questions.unshift(
      "No supported foods were identified. Describe the foods and portions, or add them from the food list.",
    );
  if (!result && parsed.items.length)
    assumptions.push(
      "Based on your description and the local food list. The photo has not been analyzed. Household portions are estimates.",
    );
  if (parsed.explicit.size)
    assumptions.push(
      "Your stated quantities take priority over visual portion guesses.",
    );
  assumptions.push(...items.map((i) => i.food.assumption));
  return {
    uncertainty: {
      level:
        incomplete || !items.length
          ? "higher"
          : image
            ? "higher"
            : parsed.explicit.size === items.length &&
                items.every(
                  (i) =>
                    i.unit === "g" && !i.food.source.label.includes("Recipe"),
                )
              ? "lower"
              : "moderate",
      reasons: [
        ...(image
          ? [
              "Photo portions and hidden cooking fats cannot be measured exactly.",
            ]
          : []),
        ...(parsed.explicit.size < items.length
          ? ["Some amounts use assumed household servings."]
          : []),
        ...(items.some((i) => i.food.source.label.includes("Recipe"))
          ? [
              "Mixed dishes use documented reference recipes; oil and cooking yields vary.",
            ]
          : []),
        ...(parsed.explicit.size
          ? [
              "Your explicit quantities override visual guesses; measured edible grams improve the estimate.",
            ]
          : []),
      ],
    },
    items,
    totals: sumNutrients(items),
    method: image ? "vision" : "description",
    assumptions: [...new Set(assumptions)].filter(Boolean),
    questions: [...new Set(questions)],
    incomplete: incomplete || !items.length,
  };
}
