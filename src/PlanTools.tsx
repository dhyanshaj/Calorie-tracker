import { useEffect, useRef, useState } from "react";
import type { DailyPlan, MealPlanDay, PlannedMeal } from "../shared/profile";
import type { PlanProgram, ProgramState } from "../shared/program";
import type { Nutrients } from "../shared/types";
import { api } from "./api";
type Alternative = {
  option: number;
  meal: PlannedMeal;
  dayTotals: Nutrients;
  closeToTargets: boolean;
};
export function MealSwap({
  program,
  day,
  slot,
  disabled,
  onState,
}: {
  program: PlanProgram | null | undefined;
  day: number;
  slot: number;
  disabled: boolean;
  onState: (state: ProgramState) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [open, setOpen] = useState(false),
    [choices, setChoices] = useState<Alternative[]>([]),
    [revision, setRevision] = useState(1),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  async function load() {
    if (!program) return;
    setOpen(true);
    setLoading(true);
    setError("");
    try {
      const result = await api<{
        revision: number;
        alternatives: Alternative[];
      }>(
        `/api/plan-program/${program.id}/days/${day}/alternatives?slot=${slot}`,
      );
      setChoices(result.alternatives);
      setRevision(result.revision);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open alternatives.");
    } finally {
      setLoading(false);
    }
  }
  async function swap(option: number) {
    if (!program || busy) return;
    setBusy(true);
    setError("");
    try {
      onState(
        await api<ProgramState>(
          `/api/plan-program/${program.id}/days/${day}/swap`,
          { method: "PUT", body: JSON.stringify({ slot, option, revision }) },
        ),
      );
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save swap.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="button button-white swap-trigger"
        disabled={disabled || !program}
        onClick={() => void load()}
        title={
          disabled
            ? "Start an active plan and keep this day unticked to swap meals."
            : "Choose a different meal"
        }
      >
        Swap this meal
      </button>
      <dialog
        ref={dialog}
        className="swap-dialog"
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else setOpen(false);
        }}
        aria-labelledby={`swap-title-${slot}`}
      >
        <div className="swap-heading">
          <div>
            <span className="eyebrow">A PLAN YOU CAN ACTUALLY LIVE WITH</span>
            <h2 id={`swap-title-${slot}`}>Something different?</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close meal alternatives"
            disabled={busy}
            onClick={() => setOpen(false)}
          >
            ×
          </button>
        </div>
        <p>
          Options respect your cuisine, diet, allergen exclusions, budget and
          active preparation time. Only this meal changes. Estimated daily
          totals update when you choose.
        </p>
        {loading ? (
          <p role="status">Finding alternatives…</p>
        ) : choices.length ? (
          <div className="swap-options">
            {choices.map((choice) => (
              <article key={choice.option}>
                <h3>{choice.meal.title}</h3>
                <p>
                  {choice.meal.items
                    .map((i) => `${i.name} ${Math.round(i.grams)} g`)
                    .join(" · ")}
                </p>
                <strong>
                  {Math.round(choice.meal.totals.kcal)} kcal ·{" "}
                  {choice.meal.totals.protein.toFixed(1)} g protein ·{" "}
                  {choice.meal.totals.fat.toFixed(1)} g fat
                </strong>
                <small>
                  Day after swap: {Math.round(choice.dayTotals.kcal)} kcal ·{" "}
                  {choice.dayTotals.protein.toFixed(1)} g protein ·{" "}
                  {choice.dayTotals.fat.toFixed(1)} g fat
                  {choice.closeToTargets
                    ? " · close to targets"
                    : " · review target differences"}
                </small>
                <button
                  className="button button-primary"
                  disabled={busy}
                  onClick={() => void swap(choice.option)}
                  aria-label={`Swap to ${choice.meal.title}`}
                >
                  {busy ? "Saving…" : "Choose this meal"}
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p>
            No different meals match these preferences right now. You can adjust
            your profile or manually log the food you eat.
          </p>
        )}
        {error && (
          <div className="error-box" role="alert">
            {error}
            <button className="text-button" onClick={() => void load()}>
              Reload choices
            </button>
          </div>
        )}
        <small>Swapping your plan never creates a diary entry.</small>
      </dialog>
    </>
  );
}
export function WeeklyShopping({
  plan,
  week,
}: {
  plan: DailyPlan;
  week: number;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const days = plan.days.slice(week * 7, week * 7 + 7),
    ingredients = new Map<string, { name: string; grams: number }>();
  for (const day of days)
    for (const meal of day.menu)
      for (const item of meal.items)
        for (const part of item.ingredients ?? [
          { key: item.foodId, name: item.name, gramsPer100: 100 },
        ]) {
          const old = ingredients.get(part.key);
          ingredients.set(part.key, {
            name: part.name,
            grams: (old?.grams ?? 0) + (item.grams * part.gramsPer100) / 100,
          });
        }
  const signature = JSON.stringify([...ingredients]);
  useEffect(() => setChecked(new Set()), [week, signature]);
  function download() {
    const cell = (s: string) =>
      `"${s.replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""')}"`;
    const csv =
      "Ingredient,Quantity (g)\r\n" +
      [...ingredients.values()]
        .map((i) => `${cell(i.name)},${Math.round(i.grams)}`)
        .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `platewise-week-${week + 1}-shopping.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <details className="card weekly-shopping">
      <summary>
        Week {week + 1} shopping list · days {week * 7 + 1}–
        {Math.min(30, week * 7 + 7)}
      </summary>
      <p>
        Combined reference ingredients for these {days.length} days, including
        recipes. Weights follow each reference: cooked beans/grains and edible
        produce, or dry flour where stated. Raw shopping weights, packaging,
        batch yields and cross-contact need your review.
      </p>
      <button className="button button-white" onClick={download}>
        Download shopping list
      </button>
      <ul>
        {[...ingredients]
          .sort((a, b) => a[1].name.localeCompare(b[1].name))
          .map(([key, item]) => (
            <li key={key}>
              <label>
                <input
                  type="checkbox"
                  aria-label={`Bought ${item.name}`}
                  checked={checked.has(key)}
                  onChange={() =>
                    setChecked((old) => {
                      const next = new Set(old);
                      next.has(key) ? next.delete(key) : next.add(key);
                      return next;
                    })
                  }
                />
                <span>{item.name}</span>
                <strong>{Math.round(item.grams).toLocaleString()} g</strong>
              </label>
            </li>
          ))}
      </ul>
      <small>
        Shopping ticks are a convenience for this visit and reset when the menu
        or week changes.
      </small>
    </details>
  );
}
