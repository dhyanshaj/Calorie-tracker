import { useEffect, useState } from "react";
import { Star, RotateCcw, Plus, Search } from "lucide-react";
import { api } from "./api";
import type { Food, Meal } from "../shared/types";
type LibraryState = {
  recentMeals: Meal[];
  recentFoods: Food[];
  favouriteMeals: Meal[];
  favouriteFoods: Food[];
};
export function QuickLibrary({
  revision,
  disabled,
  onRepeat,
  onFood,
}: {
  revision: number;
  disabled: boolean;
  onRepeat: (meal: Meal) => void;
  onFood: (food: Food) => void;
}) {
  const [state, setState] = useState<LibraryState | null>(null),
    [tab, setTab] = useState<"recent" | "favourites" | "foods">("recent"),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = () => {
    setError("");
    api<LibraryState>("/api/library")
      .then(setState)
      .catch((e) => setError(e.message));
  };
  useEffect(load, [revision]);
  async function toggle(
    kind: "foods" | "meals",
    id: string,
    favourite: boolean,
  ) {
    setBusy(true);
    setError("");
    try {
      setState(
        await api<LibraryState>(
          `/api/favourites/${kind}/${encodeURIComponent(id)}`,
          { method: "PUT", body: JSON.stringify({ favourite }) },
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save favourite.");
    } finally {
      setBusy(false);
    }
  }
  const meals =
      (tab === "foods"
        ? []
        : tab === "recent"
          ? state?.recentMeals
          : state?.favouriteMeals) ?? [],
    foods =
      tab === "foods"
        ? (state?.recentFoods ?? [])
        : tab === "favourites"
          ? (state?.favouriteFoods ?? [])
          : [];
  const matches = (name: string) =>
    name.toLowerCase().includes(query.toLowerCase());
  if (!state && !error)
    return (
      <aside className="quick-empty" role="status">
        Opening your meal shortcuts…
      </aside>
    );
  if (
    state &&
    !state.recentMeals.length &&
    !state.recentFoods.length &&
    !state.favouriteMeals.length &&
    !state.favouriteFoods.length &&
    !error
  )
    return (
      <aside className="quick-empty">
        <Star size={18} />
        <div>
          <strong>One meal now. A shortcut next time.</strong>
          <small>
            Your saved meals and favourite foods will appear here for quicker
            logging.
          </small>
        </div>
      </aside>
    );
  return (
    <section className="card quick-library" aria-label="Quick meal shortcuts">
      <div className="quick-heading">
        <div>
          <span className="eyebrow">LESS TYPING, MORE LIVING</span>
          <h2>Your everyday shortcuts</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Reload shortcuts"
          onClick={load}
        >
          <RotateCcw size={16} />
        </button>
      </div>
      <div
        className="shortcut-tabs"
        role="group"
        aria-label="Shortcut category"
      >
        {(
          [
            ["recent", "Recent meals"],
            ["favourites", "Favourites"],
            ["foods", "Recent foods"],
          ] as const
        ).map(([key, label]) => (
          <button
            aria-pressed={tab === key}
            key={key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <label className="shortcut-search">
        <Search size={16} />
        <input
          aria-label="Search your shortcuts"
          placeholder="Find a familiar meal or food"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="shortcut-cards">
        {tab !== "foods" &&
          meals
            .filter((m) => matches(m.title))
            .slice(0, 6)
            .map((meal) => {
              const favourite =
                state?.favouriteMeals.some((m) => m.id === meal.id) ?? false;
              return (
                <article key={meal.id}>
                  <strong>{meal.title}</strong>
                  <small>
                    {Math.round(meal.totals.kcal)} kcal ·{" "}
                    {meal.totals.protein.toFixed(1)} g protein ·{" "}
                    {meal.totals.fat.toFixed(1)} g fat
                  </small>
                  <div>
                    <button
                      className="text-button"
                      disabled={disabled}
                      aria-label={`Repeat ${meal.title}`}
                      onClick={() => onRepeat(meal)}
                    >
                      <RotateCcw size={14} />
                      Review again
                    </button>
                    <button
                      className={`icon-button ${favourite ? "is-favourite" : ""}`}
                      disabled={busy}
                      aria-label={`${favourite ? "Unstar" : "Star"} meal ${meal.title}`}
                      onClick={() => void toggle("meals", meal.id, !favourite)}
                    >
                      <Star
                        size={16}
                        fill={favourite ? "currentColor" : "none"}
                      />
                    </button>
                  </div>
                </article>
              );
            })}
        {foods
          .filter((f) => matches(f.name))
          .slice(0, 8)
          .map((food) => {
            const favourite =
              state?.favouriteFoods.some((f) => f.id === food.id) ?? false;
            return (
              <article key={food.id}>
                <strong>{food.name}</strong>
                <small>
                  {Math.round(food.per100.kcal)} kcal / 100 g · estimate
                </small>
                <div>
                  <button
                    className="text-button"
                    disabled={disabled}
                    aria-label={`Add ${food.name} from shortcuts`}
                    onClick={() => onFood(food)}
                  >
                    <Plus size={14} />
                    Add to estimate
                  </button>
                  <button
                    className={`icon-button ${favourite ? "is-favourite" : ""}`}
                    disabled={busy}
                    aria-label={`${favourite ? "Unstar" : "Star"} food ${food.name}`}
                    onClick={() => void toggle("foods", food.id, !favourite)}
                  >
                    <Star
                      size={16}
                      fill={favourite ? "currentColor" : "none"}
                    />
                  </button>
                </div>
              </article>
            );
          })}
      </div>
      {!state && !error && <p role="status">Opening your shortcuts…</p>}
      {state &&
        !meals.some((m) => matches(m.title)) &&
        !foods.some((f) => matches(f.name)) && (
          <p className="shortcut-empty">
            {query
              ? "No matching shortcuts. Try a different name."
              : tab === "favourites"
                ? "Star meals or foods to keep them here."
                : "Save a meal once. Review and repeat it here next time, without retyping."}
          </p>
        )}
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      <small className="shortcut-note">
        Repeating opens an editable estimate. Your diary changes only after you
        confirm saving.
      </small>
    </section>
  );
}
