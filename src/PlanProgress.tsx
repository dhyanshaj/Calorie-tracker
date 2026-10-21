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
import type { CheckoutOrder, ProgramState } from "../shared/program";
import { api } from "./api";
type CheckoutResponse = {
  razorpay_order_id: string;
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
    [paymentNotice, setPaymentNotice] = useState("");
  const access = state?.access,
    program = state?.program;
  const paid = access?.hasLifetime;
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
        next.access.hasLifetime
          ? "Lifetime access is active. Thank you!"
          : "No captured payment has been confirmed yet. Do not pay again if your bank shows a debit; check again shortly.",
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
    if (paying || !access?.checkoutAvailable) return;
    setPaying(true);
    setPaymentError("");
    setPaymentNotice("");
    try {
      const order = await api<CheckoutOrder>("/api/billing/orders", {
        method: "POST",
      });
      await loadCheckout();
      const checkout = new window.Razorpay!({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.id,
        name: order.name,
        description: order.description,
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
            setPaymentNotice("Lifetime access is active. No renewal payments.");
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
                ? "Lifetime meal planning is active. Start a plan to save your daily checklist."
                : "Your 30-calendar-day free period begins when you press Start. No payment details needed. Afterward, lifetime meal planning is ₹999 once, with no automatic renewal."}
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
              <span className={`access-badge ${paid ? "lifetime" : ""}`}>
                {paid ? <Sparkles size={13} /> : <Clock3 size={13} />}{" "}
                {paid
                  ? "Lifetime access"
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
      {state && !paid && (
        <div
          className={`lifetime-card ${access?.status === "expired" ? "expired" : ""}`}
        >
          <span className="lifetime-symbol">
            <LockKeyhole size={20} />
          </span>
          <div>
            <span className="eyebrow">ONE PAYMENT. NO RENEWALS.</span>
            <h3>
              {access?.status === "expired"
                ? "Continue with lifetime meal planning"
                : "Keep planning after your free month"}
            </h3>
            <p>
              ₹999 once for continued meal plans and checklists. Your saved
              diary remains available when the free period ends.
            </p>
            {state.paymentMode === "test" && access?.checkoutAvailable && (
              <small>
                Test checkout only. No real money is charged in this mode.
              </small>
            )}
            {!access?.checkoutAvailable && (
              <small>
                Payments are not enabled yet. The app owner needs to finish
                Razorpay setup.
              </small>
            )}
          </div>
          <div className="lifetime-purchase">
            <strong>
              ₹999<small>one time</small>
            </strong>
            <button
              className="button button-primary"
              disabled={!access?.checkoutAvailable || paying}
              onClick={() => void buy()}
            >
              {paying ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <>
                  <CreditCard size={15} />
                  Get lifetime access
                </>
              )}
            </button>
            <button
              className="text-button payment-status"
              disabled={!access?.checkoutAvailable || paying}
              onClick={() => void checkPayment()}
            >
              Already paid? Check status
            </button>
          </div>
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
