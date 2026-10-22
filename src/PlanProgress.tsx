import { useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  CreditCard,
  LoaderCircle,
  LockKeyhole,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import type { Account } from "../shared/profile";
import type { CheckoutSubscription, ProgramState } from "../shared/program";
import { api } from "./api";
type CheckoutResponse = {
  razorpay_subscription_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, callback: () => void) => void;
    };
  }
}
let checkoutScript: Promise<void> | null = null;
function loadCheckout() {
  if (window.Razorpay) return Promise.resolve();
  if (checkoutScript) return checkoutScript;
  checkoutScript = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => {
      if (window.Razorpay) resolve();
      else {
        checkoutScript = null;
        reject(new Error("Checkout could not be loaded."));
      }
    };
    script.onerror = () => {
      checkoutScript = null;
      script.remove();
      reject(
        new Error(
          "Could not load the payment provider. Check payment status before trying again.",
        ),
      );
    };
    document.head.appendChild(script);
  });
  return checkoutScript;
}
export function PlanProgress({
  user,
  state,
  loading,
  busy,
  error,
  onStart,
  onNext,
  onRetry,
  onState,
}: {
  user: Account;
  state: ProgramState | null;
  loading: boolean;
  busy: boolean;
  error: string;
  onStart: () => void;
  onNext: () => void;
  onRetry: () => void;
  onState: (state: ProgramState) => void;
}) {
  const [paying, setPaying] = useState(false),
    [paymentError, setPaymentError] = useState(""),
    [paymentNotice, setPaymentNotice] = useState(""),
    [confirmCancel, setConfirmCancel] = useState(false);
  const access = state?.access,
    program = state?.program;
  const paid = access?.hasPaidPlan;
  const subscription = access?.subscription;
  const ended =
    !!subscription &&
    ["cancelled", "completed", "expired"].includes(subscription.status);
  const renewalOff = ended || !!subscription?.cancelAtPeriodEnd;
  const canCancel = !!subscription && !renewalOff;
  const maySubscribe =
    access?.status === "expired" &&
    !paid &&
    (!subscription || ended || subscription.status === "created");
  const paidUntil = access?.paidUntil
    ? new Date(access.paidUntil).toLocaleDateString(undefined, {
        dateStyle: "medium",
      })
    : null;
  async function checkPayment() {
    if (paying) return;
    setPaying(true);
    setPaymentError("");
    try {
      const next = await api<ProgramState>("/api/billing/status", {
        method: "POST",
      });
      onState(next);
      setPaymentNotice(
        next.access.hasPaidPlan
          ? "Your paid planning access is active. Subscription details have been refreshed."
          : "No current paid month has been confirmed. If your bank shows a debit, check again shortly before starting another payment.",
      );
    } catch (error) {
      setPaymentError(
        error instanceof Error
          ? error.message
          : "Could not check payment status.",
      );
    } finally {
      setPaying(false);
    }
  }
  async function buy() {
    if (paying || !access?.checkoutAvailable || !maySubscribe) return;
    setPaying(true);
    setPaymentError("");
    setPaymentNotice("");
    try {
      const subscription = await api<CheckoutSubscription>(
        "/api/billing/subscriptions",
        {
          method: "POST",
        },
      );
      onState(await api<ProgramState>("/api/plan-program"));
      await loadCheckout();
      const checkout = new window.Razorpay!({
        key: subscription.keyId,
        subscription_id: subscription.id,
        name: subscription.name,
        description: subscription.description,
        prefill: { name: user.name, email: user.email },
        theme: { color: "#ddb783" },
        modal: { ondismiss: () => setPaying(false) },
        handler: async (response: CheckoutResponse) => {
          setPaying(true);
          try {
            const confirmed = await api<ProgramState>("/api/billing/verify", {
              method: "POST",
              body: JSON.stringify(response),
            });
            onState(confirmed);
            setPaymentNotice(
              confirmed.access.hasPaidPlan
                ? "Your ₹499/month plan is active. It renews monthly unless you cancel renewal."
                : "Authorization received. Planning activates after the first ₹499 monthly payment is confirmed. Use Check subscription status shortly.",
            );
          } catch (error) {
            setPaymentError(
              error instanceof Error
                ? error.message
                : "Payment confirmation is pending. Use Check payment status before paying again.",
            );
          } finally {
            setPaying(false);
          }
        },
      });
      checkout.on("payment.failed", () => {
        setPaymentError(
          "Payment did not finish. If you were debited, check payment status before retrying.",
        );
        setPaying(false);
      });
      checkout.open();
    } catch (error) {
      setPaymentError(
        error instanceof Error ? error.message : "Could not open checkout.",
      );
      setPaying(false);
    }
  }
  async function cancelRenewal() {
    if (paying || !subscription || !canCancel) return;
    setPaying(true);
    setPaymentError("");
    setPaymentNotice("");
    try {
      const next = await api<ProgramState>(
        `/api/billing/subscriptions/${subscription.id}/cancel`,
        { method: "POST" },
      );
      onState(next);
      setConfirmCancel(false);
      setPaymentNotice(
        next.access.hasPaidPlan
          ? "Renewal is cancelled. Your verified paid access remains available through the paid period shown above."
          : "Subscription cancelled. No further monthly renewals will be requested.",
      );
    } catch (error) {
      setPaymentError(
        error instanceof Error
          ? error.message
          : "Could not confirm cancellation. Please retry.",
      );
    } finally {
      setPaying(false);
    }
  }
  const mayStartNext =
    paid &&
    program &&
    (program.completedCount === 30 ||
      Date.now() - new Date(program.startedAt).getTime() >= 30 * 86400000);
  return (
    <section className="program-section" aria-label="30-day plan progress">
      {loading ? (
        <div className="program-loading" role="status">
          <LoaderCircle className="spin" size={18} />
          Opening your saved checklist…
        </div>
      ) : error ? (
        <div className="error-box" role="alert">
          <span>{error}</span>
          <button className="text-button" onClick={onRetry}>
            Reload checklist <RotateCcw size={13} />
          </button>
        </div>
      ) : !program ? (
        <div className="free-plan-start">
          <div className="program-start-icon">
            <Sparkles size={22} />
          </div>
          <div>
            <span className="eyebrow">YOUR FIRST 30 DAYS, ON US</span>
            <h3>
              {paid ? "Start your 30-day plan" : "Start your free 30-day plan"}
            </h3>
            <p>
              {paid
                ? "Your paid meal planning is active. Start a plan to save your daily checklist."
                : "Your 30-calendar-day free period begins when you press Start. No payment details needed. Afterward, choose ₹499/month meal planning. You are not charged automatically when the free period ends."}
            </p>
          </div>
          <button
            className="button button-primary"
            disabled={busy}
            onClick={onStart}
          >
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <>
                {paid ? "Start my plan" : "Start my free plan"}{" "}
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>
      ) : (
        <>
          <div className="program-summary">
            <div className="program-summary-heading">
              <div>
                <span className="eyebrow">
                  YOUR 30-DAY CHECKLIST · PLAN {program.cycle}
                </span>
                <h3>
                  {program.completedCount === 30
                    ? "All 30 days marked complete."
                    : "A little progress, every day."}
                </h3>
              </div>
              <span className={`access-badge ${paid ? "paid" : ""}`}>
                {paid ? <Sparkles size={13} /> : <Clock3 size={13} />}{" "}
                {paid
                  ? access?.hasLegacyLifetime
                    ? "Existing lifetime access"
                    : "Monthly plan"
                  : access?.status === "expired"
                    ? "Free period ended"
                    : `${access?.freeDaysRemaining} free access days left`}
              </span>
            </div>
            <div className="program-stats" aria-live="polite">
              <div>
                <strong>
                  {program.completedCount}
                  <small>/ 30</small>
                </strong>
                <span>days marked complete</span>
              </div>
              <div>
                <strong>{program.remainingDays}</strong>
                <span>plan days remaining</span>
              </div>
              <div>
                <strong>
                  {Math.round((program.completedCount / 30) * 100)}
                  <small>%</small>
                </strong>
                <span>of your checklist</span>
              </div>
            </div>
            <div
              className="program-progress-bar"
              role="progressbar"
              aria-label="Completed plan days"
              aria-valuemin={0}
              aria-valuemax={30}
              aria-valuenow={program.completedCount}
            >
              <span
                style={{ width: `${(program.completedCount / 30) * 100}%` }}
              />
            </div>
            <p className="program-explanation">
              Mark days you followed. You can undo a tick. These are your own
              progress notes; ticking a day does not add meals or change diary
              totals.
            </p>
            {!paid && access?.trialEndsAt && (
              <p className="trial-end">
                Free access {access.status === "expired" ? "ended" : "ends"}{" "}
                {new Date(access.trialEndsAt).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
                . The clock continues even when a day is unticked.
              </p>
            )}
            {mayStartNext && (
              <button
                className="button button-white next-program"
                disabled={busy}
                onClick={onNext}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <CheckCircle2 size={15} />
                )}
                Start my next 30-day plan
              </button>
            )}
            {state && state.history.length > 1 && (
              <details className="program-history">
                <summary>Previous plan checklists</summary>
                <ul>
                  {state.history
                    .filter((history) => history.id !== program.id)
                    .map((history) => (
                      <li key={history.id}>
                        Plan {history.cycle}
                        <span>
                          {history.completedCount} / 30 days marked complete
                        </span>
                      </li>
                    ))}
                </ul>
              </details>
            )}
          </div>
        </>
      )}
      {state && !access?.hasLegacyLifetime && (
        <div
          className={`subscription-card ${access?.status === "expired" ? "expired" : ""}`}
        >
          <span className="subscription-symbol">
            <LockKeyhole size={20} />
          </span>
          <div>
            <span className="eyebrow">
              {renewalOff
                ? "RENEWAL CANCELLED"
                : "MONTHLY MEMBERSHIP · CANCEL RENEWAL ANYTIME"}
            </span>
            <h3>
              {paid
                ? "Your monthly meal-planning membership"
                : access?.status === "expired"
                  ? "Continue meal planning"
                  : "Keep planning after your free month"}
            </h3>
            <p>
              ₹499 per month for meal plans and checklists. Once you subscribe,
              billing renews monthly unless you cancel renewal. Your saved diary
              remains available when planning access ends.
            </p>
            {paidUntil && (
              <p className="subscription-dates">
                {paid ? "Paid access through" : "Last paid period ended"}{" "}
                {paidUntil}.{renewalOff ? " Renewal is cancelled." : ""}
              </p>
            )}
            {subscription?.nextChargeAt && !renewalOff && (
              <p className="subscription-dates">
                Next charge scheduled:{" "}
                {new Date(subscription.nextChargeAt).toLocaleDateString(
                  undefined,
                  { dateStyle: "medium" },
                )}
                .
              </p>
            )}
            {subscription && (
              <small>
                Subscription:{" "}
                {(
                  {
                    created: "Setup not completed",
                    authenticated: "Authorization received",
                    active: "Active",
                    pending: "Payment pending",
                    halted: "Renewal payment failed",
                    paused: "Paused",
                    cancelled: "Cancelled",
                    completed: "Ended",
                    expired: "Setup expired",
                  } as Record<string, string>
                )[subscription.status] ?? subscription.status}
                .
              </small>
            )}
            {!paid && access?.status !== "expired" && (
              <small>
                Subscribe after your 30-calendar-day free period. No automatic
                charge at trial end.
              </small>
            )}
            {state.paymentMode === "test" && access?.checkoutAvailable && (
              <small>
                Test checkout only. No real money is charged in this mode.
              </small>
            )}
            {!access?.checkoutAvailable && (
              <small>
                Payments are not enabled yet. The app owner needs to finish
                Razorpay Subscriptions setup.
              </small>
            )}
          </div>
          <div className="subscription-purchase">
            <strong>
              ₹499<small>per month</small>
            </strong>
            {!paid &&
              (!subscription || ended || subscription.status === "created") && (
                <button
                  className="button button-primary"
                  disabled={
                    !access?.checkoutAvailable || paying || !maySubscribe
                  }
                  onClick={() => void buy()}
                >
                  {paying ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : (
                    <>
                      <CreditCard size={15} />
                      {subscription?.status === "created"
                        ? "Continue subscription setup"
                        : "Subscribe for ₹499/month"}
                    </>
                  )}
                </button>
              )}
            {subscription && (
              <button
                className="text-button payment-status"
                disabled={!access?.checkoutAvailable || paying}
                onClick={() => void checkPayment()}
              >
                Check subscription status
              </button>
            )}
            {canCancel && !confirmCancel && (
              <button
                className="text-button"
                disabled={paying || !access?.checkoutAvailable}
                onClick={() => setConfirmCancel(true)}
              >
                Cancel renewal
              </button>
            )}
          </div>
          {confirmCancel && canCancel && (
            <div
              className="subscription-cancel"
              role="group"
              aria-label="Confirm subscription cancellation"
            >
              <p>
                Stop future monthly renewals?
                {paidUntil
                  ? ` Your paid access continues through ${paidUntil}.`
                  : " Any verified paid period stays available."}{" "}
                This does not request a refund.
              </p>
              <div>
                <button
                  className="button button-white"
                  disabled={paying}
                  onClick={() => setConfirmCancel(false)}
                >
                  Keep subscription
                </button>
                <button
                  className="button button-primary"
                  disabled={paying}
                  onClick={() => void cancelRenewal()}
                >
                  {paying ? "Cancelling…" : "Confirm cancellation"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {paymentError && (
        <div className="error-box" role="alert">
          {paymentError}
        </div>
      )}
      {paymentNotice && (
        <p className="payment-notice" role="status">
          {paymentNotice}
        </p>
      )}
    </section>
  );
}
