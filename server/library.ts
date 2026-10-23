import type { DatabaseSync } from "node:sqlite";
import type { Food, Meal } from "../shared/types";
import { AppError } from "./errors";
export class Library {
  constructor(private db: DatabaseSync) {
    db.exec(
      "CREATE TABLE IF NOT EXISTS favourites(user_id TEXT NOT NULL,kind TEXT NOT NULL,item_id TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(user_id,kind,item_id))",
    );
  }
  set(
    userId: string,
    kind: "food" | "meal",
    id: string,
    value: Food | Meal | null,
  ) {
    if (value)
      this.db
        .prepare(
          "INSERT INTO favourites VALUES(?,?,?,?) ON CONFLICT(user_id,kind,item_id) DO UPDATE SET body=excluded.body",
        )
        .run(userId, kind, id, JSON.stringify(value));
    else
      this.db
        .prepare(
          "DELETE FROM favourites WHERE user_id=? AND kind=? AND item_id=?",
        )
        .run(userId, kind, id);
  }
  meal(userId: string, id: string): Meal | undefined {
    const row = this.db
      .prepare(
        "SELECT body FROM favourites WHERE user_id=? AND kind='meal' AND item_id=?",
      )
      .get(userId, id) as { body: string } | undefined;
    return row ? JSON.parse(row.body) : undefined;
  }
  state(userId: string) {
    const rows = this.db
      .prepare("SELECT kind,item_id,body FROM favourites WHERE user_id=?")
      .all(userId) as { kind: string; item_id: string; body: string }[];
    const recent = (
      this.db
        .prepare(
          "SELECT body FROM meals WHERE user_id=? ORDER BY eaten_at DESC LIMIT 60",
        )
        .all(userId) as { body: string }[]
    ).map((r) => JSON.parse(r.body) as Meal);
    const signatures = new Set<string>();
    const meals = recent
      .filter((meal) => {
        const signature =
          meal.title +
          JSON.stringify(
            meal.items.map((i) => [
              i.foodId,
              i.quantity,
              i.unit,
              i.gramsPerUnit,
            ]),
          );
        if (signatures.has(signature)) return false;
        signatures.add(signature);
        return true;
      })
      .slice(0, 12);
    const foods = new Map<string, Food>();
    for (const meal of recent)
      for (const item of meal.items)
        if (!foods.has(item.foodId)) foods.set(item.foodId, item.food);
    return {
      recentMeals: meals,
      recentFoods: [...foods.values()].slice(0, 20),
      favouriteMeals: rows
        .filter((r) => r.kind === "meal")
        .map((r) => JSON.parse(r.body) as Meal),
      favouriteFoods: rows
        .filter((r) => r.kind === "food")
        .map((r) => JSON.parse(r.body) as Food),
    };
  }
}
