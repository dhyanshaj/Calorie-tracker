export type Nutrients = { kcal: number; protein: number; fat: number };
export type Portion = { unit: string; grams: number; label: string };
export type Food = {
  id: string;
  name: string;
  category: string;
  aliases: string[];
  per100: Nutrients;
  portions: Portion[];
  assumption: string;
  source: { label: string; url: string; note: string };
};
export type ItemInput = {
  id: string;
  foodId: string;
  quantity: number;
  unit: string;
  gramsPerUnit: number;
};
export type MealItem = ItemInput & {
  food: Food;
  grams: number;
  nutrients: Nutrients;
};
export type Analysis = {
  items: MealItem[];
  totals: Nutrients;
  assumptions: string[];
  questions: string[];
  method: "description" | "vision" | "manual";
  incomplete: boolean;
};
export type Meal = Analysis & {
  id: string;
  title: string;
  description: string;
  eatenAt: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  saveToken: string;
};
export type Status = {
  visionAvailable: boolean;
  usdaAvailable: boolean;
  storage: "sqlite";
  model: string;
};
