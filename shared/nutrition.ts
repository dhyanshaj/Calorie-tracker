import type { Food, ItemInput, MealItem, Nutrients } from "./types";
export const emptyNutrients = (): Nutrients => ({
  kcal: 0,
  protein: 0,
  fat: 0,
});
export function calculateItem(input: ItemInput, food: Food): MealItem {
  const grams = input.quantity * input.gramsPerUnit;
  const nutrients = {
    kcal: (food.per100.kcal * grams) / 100,
    protein: (food.per100.protein * grams) / 100,
    fat: (food.per100.fat * grams) / 100,
  };
  return { ...input, food, grams, nutrients };
}
export function sumNutrients(items: { nutrients: Nutrients }[]): Nutrients {
  return items.reduce(
    (t, { nutrients: n }) => ({
      kcal: t.kcal + n.kcal,
      protein: t.protein + n.protein,
      fat: t.fat + n.fat,
    }),
    emptyNutrients(),
  );
}
export const round = (n: number, digits = 1) => Number(n.toFixed(digits));
