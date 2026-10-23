import { useEffect, useState } from "react";
import type { Account } from "../shared/profile";
import { api } from "./api";
import { PlanProgress } from "./PlanProgress";
import { usePlanProgram } from "./usePlanProgram";
export function Membership({ user }: { user: Account }) {
  const progress = usePlanProgram();
  async function start() {
    try {
      await api("/api/plus/start-trial", { method: "POST" });
      await progress.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start trial.");
    }
  }
  const [error, setError] = useState("");
  return (
    <section className="membership-page">
      <span className="eyebrow">A SMALLER PRICE. A MORE USEFUL EVERYDAY.</span>
      <h2>
        A little more support,
        <br />
        <em>on your terms.</em>
      </h2>
      <p>
        Basic tracking is free, always. Try Plus for 30 calendar days before
        deciding. No card needed and no automatic charge when your trial ends.
      </p>
      <div className="membership-features">
        <article>
          <span>FREE</span>
          <h3>Your everyday diary</h3>
          <p>
            Manual foods, descriptions, calories, protein, fat, recent meals and
            favourites. Keep your saved records.
          </p>
          <strong>₹0</strong>
        </article>
        <article>
          <span>PLUS · MONTHLY OR YEARLY</span>
          <h3>Less guesswork. More choice.</h3>
          <p>
            30-day meal plans, meal swaps, weekly shopping lists and 100
            successful photo analyses per month. The trial includes 100
            successful analyses in total.
          </p>
          <strong>
            ₹199<small>/month</small>
          </strong>
          <p>Or ₹1,499 upfront per year, about ₹125/month.</p>
        </article>
      </div>
      <PlanProgress
        membershipOnly
        user={user}
        state={progress.state}
        loading={progress.loading}
        busy={progress.busy}
        error={progress.error || error}
        onStart={() => void start()}
        onNext={() => {}}
        onRetry={() => void progress.refresh()}
        onState={progress.setState}
      />
      <p className="service-note">
        Photo recognition needs the owner’s configured image service. Check its
        status in the meal form. Plans and photo portions are estimates; no
        result or rate of weight change is guaranteed.
      </p>
    </section>
  );
}
type Usage = {
  limit: number;
  used: number;
  remaining: number;
  periodEndsAt: string | null;
  kind: string;
  canAnalyze: boolean;
  needsTrial: boolean;
};
export function PhotoAllowance({
  revision,
  onPlus,
  visionAvailable,
}: {
  revision: number;
  onPlus: () => void;
  visionAvailable: boolean;
}) {
  const [state, setState] = useState<Usage | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    api<Usage>("/api/photo-usage")
      .then((s) => {
        if (current) setState(s);
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [revision]);
  return (
    <div className="photo-allowance">
      {state ? (
        <>
          <strong>
            {state.kind === "free"
              ? "Photo analysis is a Plus feature"
              : `${state.remaining} of ${state.limit} photo analyses left${state.kind === "trial" ? " in your trial" : " this month"}`}
          </strong>
          {state.periodEndsAt && (
            <small>
              {state.kind === "trial" ? "Trial ends" : "Allowance resets"}{" "}
              {new Date(state.periodEndsAt).toLocaleDateString()}
            </small>
          )}
          <small>
            Failed requests and non-food images do not use your
            successful-analysis allowance.
          </small>
          <button className="text-button" onClick={onPlus}>
            {state.needsTrial
              ? "Explore your free Plus trial"
              : "Manage Plus & allowance"}
          </button>
        </>
      ) : (
        <small>{error || "Checking your photo allowance…"}</small>
      )}
      {!visionAvailable && (
        <small>
          Photo service setup is pending. Description and manual tracking work
          now.
        </small>
      )}
    </div>
  );
}
