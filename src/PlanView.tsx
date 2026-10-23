import { MealSwap, WeeklyShopping } from "./PlanTools";
import { useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Coffee,
  Flame,
  Leaf,
  Moon,
  LoaderCircle,
  ShoppingBasket,
  Sun,
  Sunrise,
  Utensils,
} from "lucide-react";
import type { Account, DailyPlan, PlannedMeal } from "../shared/profile";
import { activities, goals } from "../shared/profile";
import { usePlanProgram } from "./usePlanProgram";
import { PlanProgress } from "./PlanProgress";
import type { Nutrients } from "../shared/types";
const format = (value: number, digits = 0) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(
    value,
  );
const icons = [Sunrise, Sun, Moon, Coffee];
export function PlanView({
  user,
  plan,
  onSettings,
  onAddMeal,
  canLogMeals,
}: {
  user: Account;
  plan: DailyPlan | null;
  onSettings: () => void;
  canLogMeals: boolean;
  onAddMeal: (items: PlannedMeal["items"], title: string) => void;
}) {
  const [selectedDay, setSelectedDay] = useState(0);
  const [monthExpanded, setMonthExpanded] = useState(false);
  const week = Math.floor(selectedDay / 7);
  const progress = usePlanProgram();
  plan = plan?.eligible ? (progress.state?.program?.plan ?? plan) : plan;
  if (!plan)
    return (
      <section className="card plan-empty">
        <h2>Let’s build your meal plan.</h2>
        <p>
          Complete your profile so we can calculate daily portions for your
          needs.
        </p>
        <button className="button button-primary" onClick={onSettings}>
          Complete your profile <ArrowRight size={16} />
        </button>
      </section>
    );
  const activeDay = plan.days?.[selectedDay] ?? {
    day: "Every day",
    menu: plan.menu,
    totals: plan.menuTotals,
    closeToTargets: false,
    targets: plan.targets!,
  };
  const shopping = new Map<string, { name: string; grams: number }>();
  for (const meal of activeDay.menu)
    for (const item of meal.items) {
      const prior = shopping.get(item.foodId);
      shopping.set(item.foodId, {
        name: item.name,
        grams: item.grams + (prior?.grams ?? 0),
      });
    }
  return (
    <section className="plan-page">
      <div className="plan-intro">
        <div>
          <span className="eyebrow">MADE FROM YOUR GOALS & PREFERENCES</span>
          <h2>
            Your next 30 days, planned.
            <br />
            <em>One good meal at a time.</em>
          </h2>
          <p>
            Built for {user.name.split(" ")[0]} ·{" "}
            {goals.find((g) => g.id === user.profile?.goal)?.name} ·{" "}
            {user.profile?.timelineWeeks}-week horizon
          </p>
        </div>
        <button className="button button-white" onClick={onSettings}>
          Edit my profile <ArrowRight size={15} />
        </button>
      </div>
      {plan.targets && (
        <>
          <div className="plan-targets">
            <TargetNumber
              label="Calories"
              value={plan.targets.kcal}
              unit="kcal / day"
            />
            <TargetNumber
              label="Protein"
              value={plan.targets.protein}
              unit="g / day"
            />
            <TargetNumber label="Fat" value={plan.targets.fat} unit="g / day" />
          </div>
          <div className="plan-preferences">
            <span>
              <Leaf size={13} />
              {user.profile?.diet === "balanced"
                ? "Includes meat, eggs & dairy"
                : user.profile?.diet === "vegetarian"
                  ? "Vegetarian · eggs & dairy"
                  : "Plant-based"}
            </span>
            <span>
              <Utensils size={13} />4 meals each day
            </span>
            <span>
              {activities.find((a) => a.id === user.profile?.activity)?.detail}
            </span>
            {!!user.profile?.allergies.length && (
              <span>Excludes: {user.profile.allergies.join(", ")}</span>
            )}
          </div>
        </>
      )}
      {plan.eligible && (
        <PlanProgress
          user={user}
          state={progress.state}
          loading={progress.loading}
          busy={progress.busy}
          error={progress.error}
          onStart={() => void progress.start()}
          onNext={() => {
            void progress.next();
            setSelectedDay(0);
          }}
          onRetry={() => void progress.refresh()}
          onState={progress.setState}
        />
      )}
      {plan.eligible && (
        <section className="weekly-plan" aria-labelledby="meal-plan-title">
          <div className="plan-menu-heading">
            <div>
              <span className="eyebrow">
                WHAT TO EAT, WITH PORTIONS INCLUDED
              </span>
              <h3 id="meal-plan-title">Your daily meal plan</h3>
              <p>
                Thirty days of breakfast, lunch, dinner, and snacks, portioned
                around your estimated daily needs.
              </p>
            </div>
            <span className="weekly-badge">
              <CalendarDays size={15} />
              30-day plan
            </span>
          </div>
          <p className="checklist-instructions">
            Choose a day to view its meals. Tick the separate checkbox when you
            followed that day’s plan.
            {!progress.state?.program
              ? " Start your free plan above to save ticks."
              : ""}
          </p>
          <div className="week-navigation" role="group" aria-label="Plan week">
            {[0, 1, 2, 3, 4].map((w) => (
              <button
                key={w}
                aria-pressed={week === w}
                onClick={() => setSelectedDay(w * 7)}
              >
                Week {w + 1}
              </button>
            ))}
            <button
              className="text-button"
              aria-expanded={monthExpanded}
              onClick={() => setMonthExpanded((v) => !v)}
            >
              {monthExpanded ? "Show one week" : "Show all 30 days"}
            </button>
          </div>
          <div className="month-days" role="tablist" aria-label="Meal plan day">
            {plan.days.map((day, index) => {
              const completed =
                progress.pendingDay?.day === index + 1
                  ? progress.pendingDay.completed
                  : (progress.state?.program?.completedDays.includes(
                      index + 1,
                    ) ?? false);
              return (
                <div
                  className={`month-day ${index === selectedDay ? "selected" : ""} ${completed ? "completed" : ""}`}
                  key={day.day}
                  hidden={!monthExpanded && Math.floor(index / 7) !== week}
                >
                  <button
                    id={`plan-tab-${index}`}
                    role="tab"
                    aria-selected={index === selectedDay}
                    aria-controls="selected-meal-plan"
                    tabIndex={index === selectedDay ? 0 : -1}
                    onClick={() => setSelectedDay(index)}
                    onKeyDown={(event) => {
                      let next: number | undefined;
                      if (event.key === "ArrowRight") next = (index + 1) % 30;
                      if (event.key === "ArrowLeft") next = (index + 29) % 30;
                      if (event.key === "Home") next = 0;
                      if (event.key === "End") next = 29;
                      if (next !== undefined) {
                        event.preventDefault();
                        setSelectedDay(next);
                        window.setTimeout(
                          () =>
                            document
                              .getElementById(`plan-tab-${next}`)
                              ?.focus(),
                          0,
                        );
                      }
                    }}
                  >
                    <span>{day.day}</span>
                    <small>{format(day.totals.kcal)} kcal</small>
                  </button>
                  <label
                    className="day-check"
                    title={
                      completed
                        ? `Undo completion for ${day.day}`
                        : `Mark ${day.day} complete`
                    }
                  >
                    <input
                      aria-label={`Completed ${day.day}`}
                      type="checkbox"
                      aria-busy={progress.pendingDay?.day === index + 1}
                      checked={completed}
                      disabled={
                        !progress.state?.program ||
                        !progress.state.access.canTrack ||
                        progress.busy ||
                        progress.loading
                      }
                      onChange={(event) =>
                        void progress.complete(index + 1, event.target.checked)
                      }
                    />
                    <span>{completed ? <CheckCircle2 size={14} /> : null}</span>
                  </label>
                </div>
              );
            })}
          </div>
          {progress.state?.access.status === "expired" && (
            <p className="plan-expired-note">
              Your past plan is read-only. A Plus subscription enables continued
              checklists and new plans while your paid access is active.
            </p>
          )}
          <div
            id="selected-meal-plan"
            role="tabpanel"
            aria-labelledby={`plan-tab-${selectedDay}`}
            tabIndex={0}
          >
            <div className="day-plan-heading">
              <div>
                <h4>{activeDay.day}’s menu</h4>
                <p>
                  Nutrition values are estimates. Weights are cooked, edible
                  portions.
                </p>
              </div>
              <span
                className={`match-badge ${activeDay.closeToTargets ? "matched" : ""}`}
              >
                {activeDay.closeToTargets ? (
                  <CheckCircle2 size={14} />
                ) : (
                  <CircleHelp size={14} />
                )}{" "}
                {activeDay.closeToTargets
                  ? "Close to your targets"
                  : "Review target differences"}
              </span>
            </div>
            <div className="plan-menu-grid">
              {activeDay.menu.map((meal, index) => {
                const Icon = icons[index];
                return (
                  <article
                    className="card plan-meal"
                    key={`${activeDay.day}-${meal.name}`}
                  >
                    <div className="plan-meal-header">
                      <span className="meal-slot-icon">
                        <Icon size={18} />
                      </span>
                      <div>
                        <small className="meal-slot-label">{meal.name}</small>
                        <h3>{meal.title}</h3>
                      </div>
                      <strong>
                        {format(meal.totals.kcal)}
                        <small> kcal</small>
                      </strong>
                    </div>
                    <ul>
                      {meal.items.map((item) => (
                        <li key={item.foodId}>
                          <span>
                            {item.name}
                            <small className="meal-portion-hint">
                              {item.portionLabel}
                            </small>
                          </span>
                          <strong>{format(item.grams, 1)} g</strong>
                        </li>
                      ))}
                    </ul>
                    <div className="plan-meal-macros">
                      <span>{format(meal.totals.protein, 1)} g protein</span>
                      <span>{format(meal.totals.fat, 1)} g fat</span>
                    </div>
                    <details className="meal-preparation">
                      <summary>
                        How to put it together
                        <ChevronDown size={13} />
                      </summary>
                      <ol>
                        {meal.preparation.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                    </details>
                    <MealSwap
                      program={progress.state?.program}
                      day={selectedDay + 1}
                      slot={index}
                      disabled={
                        !progress.state?.access.canTrack ||
                        !!progress.state?.program?.completedDays.includes(
                          selectedDay + 1,
                        )
                      }
                      onState={progress.setState}
                    />
                    <button
                      className="text-button"
                      disabled={!canLogMeals}
                      onClick={() =>
                        onAddMeal(meal.items, `${meal.name} · ${meal.title}`)
                      }
                    >
                      Review & log this meal <ArrowRight size={14} />
                    </button>
                  </article>
                );
              })}
            </div>
            <div className="day-nutrition-summary">
              <div className="summary-heading">
                <span>
                  <Flame size={17} /> {activeDay.day}’s estimated totals
                </span>
                <small>Compared with your daily targets</small>
              </div>
              <div className="target-comparisons">
                {(["kcal", "protein", "fat"] as const).map((key, index) => {
                  const actual = activeDay.totals[key],
                    target = activeDay.targets[key],
                    difference = actual - target;
                  return (
                    <div
                      key={key}
                      className={`target-comparison comparison-${key}`}
                    >
                      <span>{["Calories", "Protein", "Fat"][index]}</span>
                      <strong>
                        {format(actual, key === "kcal" ? 0 : 1)}
                        <small>{key === "kcal" ? "kcal" : "g"}</small>
                      </strong>
                      <div className="comparison-track">
                        <span
                          style={{
                            width: `${Math.min(100, (actual / target) * 100)}%`,
                          }}
                        />
                      </div>
                      <p>
                        Target {format(target)} {key === "kcal" ? "kcal" : "g"}
                        <span>
                          {Math.abs(difference) < 0.5
                            ? "On target"
                            : `${format(Math.abs(difference), key === "kcal" ? 0 : 1)} ${key === "kcal" ? "kcal" : "g"} ${difference > 0 ? "above" : "below"}`}
                        </span>
                      </p>
                    </div>
                  );
                })}
              </div>
              <p className="plan-log-note">
                A meal plan is a suggestion. Nothing enters your diary until you
                review it and confirm saving.
              </p>
            </div>
            <WeeklyShopping plan={plan} week={week} />
            <details className="card shopping-list">
              <summary>
                <ShoppingBasket size={18} />
                <span>Ingredients for {activeDay.day.toLowerCase()}</span>
                <ChevronDown size={15} />
              </summary>
              <p>
                These are edible, cooked amounts for planning portions. Dry/raw
                shopping weights and package sizes will differ.
              </p>
              <ul>
                {[...shopping].map(([id, item]) => (
                  <li key={id}>
                    <span>{item.name}</span>
                    <strong>{format(item.grams, 1)} g</strong>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        </section>
      )}
      {!plan.eligible && (
        <section className="card plan-unavailable">
          <div className="unavailable-icon">
            <CircleHelp size={24} />
          </div>
          <h3>Why your meal plan isn’t shown</h3>
          <p>{plan.warnings.join(" ")}</p>
          <p>
            Check that your profile details are accurate. Your meal diary and
            manual food tracking are available.
          </p>
          <button className="button button-white" onClick={onSettings}>
            Review profile details <ArrowRight size={15} />
          </button>
        </section>
      )}
      {!!plan.warnings.length && plan.eligible && (
        <details className="plan-warning plan-review-notes">
          <summary>
            <CircleHelp size={17} />
            Notes about your plan
            <ChevronDown size={14} />
          </summary>
          <ul>
            {plan.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      )}
      {!!plan.barrierTips.length && (
        <div className="card barrier-tips">
          <h3>Make it work for your everyday</h3>
          {plan.barrierTips.map((tip) => (
            <div key={tip.barrier}>
              <span>
                <Leaf size={17} />
              </span>
              <div>
                <h4>{tip.barrier}</h4>
                <p>{tip.tip}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      <details className="card plan-method">
        <summary>
          <CircleHelp size={17} />
          How your plan was calculated<span>View details</span>
        </summary>
        {plan.maintenanceKcal && (
          <p>
            Estimated maintenance: {format(plan.maintenanceKcal)} kcal/day. This
            uses your profile data, not a measurement of metabolism.
          </p>
        )}
        <ul>
          {plan.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
        <a
          href="https://pubmed.ncbi.nlm.nih.gov/2305711/"
          target="_blank"
          rel="noreferrer"
        >
          Mifflin–St Jeor equation source ↗
        </a>
      </details>
    </section>
  );
}
function TargetNumber({
  label,
  value,
  unit,
}: {
  label: string;
  value: number;
  unit: string;
}) {
  return (
    <div>
      <span>{label}</span>
      <strong>
        {format(value)}
        <small>{unit}</small>
      </strong>
      <p>Estimated daily starting target</p>
    </div>
  );
}
