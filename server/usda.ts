import type { Food } from "../shared/types";
import { catalog, foodById } from "../shared/catalog";
import { AppError } from "./errors";
const remoteCache = new Map<string, Food>();
export function getFood(id: string) {
  return foodById.get(id) ?? remoteCache.get(id);
}
function convert(record: any): Food | undefined {
  if (
    !record ||
    !Number.isInteger(record.fdcId) ||
    !Array.isArray(record.foodNutrients)
  )
    return;
  const get = (id: number) =>
    record.foodNutrients.find(
      (n: any) => (n.nutrientId ?? n.nutrient?.id) === id,
    );
  const nutrient = (id: number) => {
    const n = get(id);
    return n?.value ?? n?.amount;
  };
  const kcal = nutrient(1008),
    protein = nutrient(1003),
    fat = nutrient(1004);
  if (
    ![kcal, protein, fat].every(
      (n) => typeof n === "number" && Number.isFinite(n) && n >= 0,
    )
  )
    return;
  return {
    id: `usda:${record.fdcId}`,
    name: String(record.description).slice(0, 200),
    aliases: [],
    category: "USDA FoodData Central",
    per100: { kcal, protein, fat },
    portions: [{ unit: "g", grams: 1, label: "grams" }],
    assumption:
      "USDA record per 100 g. Enter the edible weight, matching the record’s raw/cooked preparation.",
    source: {
      label: "USDA FoodData Central",
      url: `https://fdc.nal.usda.gov/food-details/${record.fdcId}/nutrients`,
      note: `FDC ${record.fdcId} · ${record.dataType ?? "USDA"}`,
    },
  };
}
export async function searchFoods(
  query: string,
  key?: string,
): Promise<{ foods: Food[]; remote: boolean }> {
  const local = catalog.filter((f) =>
    `${f.name} ${f.aliases.join(" ")}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  if (!key || query.length < 2) return { foods: local, remote: false };
  let response: Response;
  try {
    response = await fetch("https://api.nal.usda.gov/fdc/v1/foods/search", {
      method: "POST",
      headers: { "X-Api-Key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        pageSize: 12,
        dataType: ["Foundation", "SR Legacy"],
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new AppError(
      502,
      "USDA_UNREACHABLE",
      "USDA search could not be reached. The local food list is still available.",
    );
  }
  if (!response.ok)
    throw new AppError(
      502,
      "USDA_ERROR",
      "USDA search failed. Check the server key or use the local food list.",
    );
  const data = (await response.json()) as { foods?: unknown[] };
  const external = (data.foods ?? [])
    .map(convert)
    .filter((f): f is Food => !!f);
  for (const f of external) {
    if (remoteCache.size > 500)
      remoteCache.delete(remoteCache.keys().next().value!);
    remoteCache.set(f.id, f);
  }
  return { foods: [...local, ...external], remote: true };
}
export async function resolveFood(
  id: string,
  key?: string,
): Promise<Food | undefined> {
  const known = getFood(id);
  if (known) return known;
  if (!/^usda:\d+$/.test(id) || !key) return;
  let response: Response;
  try {
    response = await fetch(
      `https://api.nal.usda.gov/fdc/v1/food/${id.slice(5)}`,
      { headers: { "X-Api-Key": key }, signal: AbortSignal.timeout(15000) },
    );
  } catch {
    throw new AppError(
      502,
      "USDA_UNREACHABLE",
      "Cannot refresh the USDA record. Try again when USDA is available.",
    );
  }
  if (!response.ok)
    throw new AppError(
      502,
      "USDA_ERROR",
      "Could not load this USDA record. Retry or choose a local food.",
    );
  const food = convert(await response.json());
  if (food) remoteCache.set(food.id, food);
  return food;
}
