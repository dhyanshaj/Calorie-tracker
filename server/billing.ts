import { createHmac, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import {
  MONTHLY_PRICE_PAISE,
  type CheckoutSubscription,
} from "../shared/program";
import { AppError } from "./errors";
import { PlanPrograms } from "./programs";

export type PaymentConfig = {
  keyId?: string;
  keySecret?: string;
  webhookSecret?: string;
  planId?: string;
};
const subscriptionId = z.string().regex(/^sub_[A-Za-z0-9]+$/);
const paymentId = z.string().regex(/^pay_[A-Za-z0-9]+$/);
const planSchema = z.object({
  id: z.string(),
  period: z.literal("monthly"),
  interval: z.literal(1),
  item: z.object({
    amount: z.literal(MONTHLY_PRICE_PAISE),
    currency: z.literal("INR"),
  }),
});
const subscriptionSchema = z.object({
  id: subscriptionId,
  plan_id: z.string(),
  status: z.enum([
    "created",
    "authenticated",
    "active",
    "pending",
    "halted",
    "cancelled",
    "completed",
    "expired",
    "paused",
  ]),
  quantity: z.literal(1),
  charge_at: z.number().int().nonnegative().nullable().optional().default(null),
});
const invoiceSchema = z.object({
  id: z.string().regex(/^inv_[A-Za-z0-9]+$/),
  subscription_id: subscriptionId,
  order_id: z.string(),
  payment_id: paymentId,
  status: z.literal("paid"),
  amount: z.literal(MONTHLY_PRICE_PAISE),
  amount_paid: z.literal(MONTHLY_PRICE_PAISE),
  currency: z.literal("INR"),
  billing_start: z.number().int().positive(),
  billing_end: z.number().int().positive(),
});
const paymentSchema = z.object({
  id: paymentId,
  order_id: z.string().nullable(),
  amount: z.number().int(),
  currency: z.string(),
  status: z.string(),
  captured: z.boolean(),
  amount_refunded: z.number().int().nonnegative().optional().default(0),
});
export const verificationSchema = z.object({
  razorpay_subscription_id: subscriptionId,
  razorpay_payment_id: paymentId,
  razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/i),
});
type SubscriptionRow = {
  id: string;
  user_id: string;
  plan_id: string;
  status: string;
  cancel_at_period_end: number;
};
const terminal = new Set(["cancelled", "completed", "expired"]);
function signatureMatches(
  message: string | Buffer,
  signature: string,
  secret: string,
) {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  return timingSafeEqual(
    Buffer.from(signature, "hex"),
    createHmac("sha256", secret).update(message).digest(),
  );
}

export class Billing {
  private tasks = new Map<string, Promise<unknown>>();
  constructor(
    private db: DatabaseSync,
    private programs: PlanPrograms,
    private config: PaymentConfig,
    private fetcher: typeof fetch = fetch,
    private clock: () => Date = () => new Date(),
  ) {}
  get configured() {
    return (
      !!(
        this.config.keyId?.match(/^rzp_(test|live)_[A-Za-z0-9]+$/) &&
        this.config.keySecret &&
        this.config.webhookSecret &&
        this.config.planId?.match(/^plan_[A-Za-z0-9]+$/)
      ) &&
      !(
        process.env.NODE_ENV === "production" &&
        !this.config.keyId?.startsWith("rzp_live_")
      )
    );
  }
  get mode() {
    return this.config.keyId?.startsWith("rzp_test_") ? "test" : "live";
  }
  private requireConfiguration() {
    if (!this.configured)
      throw new AppError(
        503,
        "PAYMENTS_NOT_CONFIGURED",
        "Subscriptions are not enabled yet. The owner must configure Razorpay and the ₹499 monthly plan before accepting payments.",
      );
  }
  // All requests concerning one account run in order, including webhook recovery.
  private serial<T>(userId: string, work: () => Promise<T>): Promise<T> {
    const task = (this.tasks.get(userId) ?? Promise.resolve())
      .catch(() => {})
      .then(work);
    this.tasks.set(userId, task);
    const cleanup = () => {
      if (this.tasks.get(userId) === task) this.tasks.delete(userId);
    };
    task.then(cleanup, cleanup);
    return task;
  }
  private async provider(path: string, body?: unknown) {
    let response: Response;
    try {
      response = await this.fetcher(`https://api.razorpay.com/v1/${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.config.keyId}:${this.config.keySecret}`).toString("base64")}`,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new AppError(
        502,
        "PAYMENT_UNREACHABLE",
        "The payment provider could not be reached. Check subscription status before trying again.",
      );
    }
    if (!response.ok)
      throw new AppError(
        502,
        "PAYMENT_PROVIDER_ERROR",
        "The payment provider could not complete the request. Check subscription status before starting another payment.",
      );
    return response.json();
  }
  private latest(userId: string) {
    return this.db
      .prepare(
        "SELECT * FROM plan_subscriptions WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1",
      )
      .get(userId) as SubscriptionRow | undefined;
  }
  private owned(id: string, userId?: string) {
    const row = this.db
      .prepare("SELECT * FROM plan_subscriptions WHERE id=?")
      .get(id) as SubscriptionRow | undefined;
    if (!row || (userId && row.user_id !== userId))
      throw new AppError(
        404,
        "SUBSCRIPTION_NOT_FOUND",
        "This subscription does not belong to your account.",
      );
    return row;
  }
  private async validatePlan(id: string) {
    const plan = planSchema.safeParse(
      await this.provider(`plans/${encodeURIComponent(id)}`),
    );
    if (!plan.success || plan.data.id !== id)
      throw new AppError(
        409,
        "WRONG_SUBSCRIPTION_PLAN",
        "The merchant plan must be ₹499 INR every month, with a billing interval of one. Ask the owner to correct the payment setup.",
      );
  }
  private async fetchSubscription(row: SubscriptionRow) {
    const subscription = subscriptionSchema.parse(
      await this.provider(`subscriptions/${encodeURIComponent(row.id)}`),
    );
    if (subscription.id !== row.id || subscription.plan_id !== row.plan_id)
      throw new AppError(
        409,
        "SUBSCRIPTION_MISMATCH",
        "The provider subscription does not match this account’s plan.",
      );
    return subscription;
  }
  private saveMetadata(subscription: z.infer<typeof subscriptionSchema>) {
    this.db
      .prepare("UPDATE plan_subscriptions SET status=?,charge_at=? WHERE id=?")
      .run(subscription.status, subscription.charge_at, subscription.id);
  }
  private async sync(row: SubscriptionRow) {
    const subscription = await this.fetchSubscription(row);
    await this.validatePlan(row.plan_id);
    const proofs: {
      id: string;
      invoice: string;
      start: number;
      end: number;
      refunded: boolean;
    }[] = [];
    // Fetch all pages, without assuming the provider's collection ordering.
    for (let skip = 0; ; skip += 100) {
      if (skip >= 2000)
        throw new AppError(
          502,
          "TOO_MANY_INVOICES",
          "Subscription history needs a support review. Your existing paid period has been preserved.",
        );
      const page = z
        .object({ items: z.array(z.unknown()).max(100) })
        .parse(
          await this.provider(
            `invoices?subscription_id=${encodeURIComponent(row.id)}&count=100&skip=${skip}`,
          ),
        );
      for (const raw of page.items) {
        const parsed = invoiceSchema.safeParse(raw);
        if (!parsed.success) continue; // Draft, unpaid, partial, or differently priced invoices never grant access.
        const invoice = parsed.data;
        if (
          invoice.subscription_id !== row.id ||
          invoice.billing_end <= invoice.billing_start ||
          invoice.billing_end - invoice.billing_start > 32 * 86400
        )
          continue;
        const saved = this.db
          .prepare("SELECT * FROM subscription_payments WHERE id=?")
          .get(invoice.payment_id) as
          | {
              subscription_id: string;
              invoice_id: string;
              period_end: number;
              refunded: number;
            }
          | undefined;
        if (
          saved &&
          (saved.subscription_id !== row.id ||
            saved.invoice_id !== invoice.id ||
            saved.period_end !== invoice.billing_end)
        )
          throw new AppError(
            409,
            "PAYMENT_MISMATCH",
            "A payment was already linked to a different billing period.",
          );
        // Old, expired periods do not need another provider request on every status check.
        if (invoice.billing_end * 1000 <= this.clock().getTime()) continue;
        const payment = paymentSchema.parse(
          await this.provider(
            `payments/${encodeURIComponent(invoice.payment_id)}`,
          ),
        );
        if (
          payment.id !== invoice.payment_id ||
          payment.order_id !== invoice.order_id ||
          payment.amount !== MONTHLY_PRICE_PAISE ||
          payment.currency !== "INR" ||
          !payment.captured ||
          !["captured", "refunded"].includes(payment.status)
        )
          continue;
        proofs.push({
          id: payment.id,
          invoice: invoice.id,
          start: invoice.billing_start,
          end: invoice.billing_end,
          refunded: payment.amount_refunded >= MONTHLY_PRICE_PAISE,
        });
      }
      if (page.items.length < 100) break;
    }
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.saveMetadata(subscription);
      for (const proof of proofs)
        this.db
          .prepare(
            "INSERT INTO subscription_payments(id,subscription_id,invoice_id,period_start,period_end,refunded) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET refunded=MAX(subscription_payments.refunded,excluded.refunded)",
          )
          .run(
            proof.id,
            row.id,
            proof.invoice,
            proof.start,
            proof.end,
            Number(proof.refunded),
          );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  createSubscription(userId: string): Promise<CheckoutSubscription> {
    return this.serial(userId, async () => {
      this.requireConfiguration();
      const access = this.programs.access(userId);
      if (access.hasPaidPlan)
        throw new AppError(
          409,
          "ALREADY_SUBSCRIBED",
          "You already have paid meal-planning access. Manage your existing subscription instead.",
        );
      if (access.status !== "expired")
        throw new AppError(
          409,
          "FREE_PERIOD_ACTIVE",
          "Use your full 30-calendar-day free period first. No subscription or payment details are needed during the trial.",
        );
      let row = this.latest(userId);
      if (row) {
        await this.sync(row);
        row = this.owned(row.id, userId);
        if (
          this.programs.access(userId).hasPaidPlan ||
          (!terminal.has(row.status) &&
            !["created", "authenticated"].includes(row.status))
        )
          throw new AppError(
            409,
            "EXISTING_SUBSCRIPTION",
            "An existing subscription needs attention. Check status or cancel it before creating another.",
          );
      }
      if (!row || terminal.has(row.status)) {
        await this.validatePlan(this.config.planId!);
        const created = subscriptionSchema.parse(
          await this.provider("subscriptions", {
            plan_id: this.config.planId,
            total_count: 1200, // Razorpay's documented maximum duration is 100 years.
            quantity: 1,
            customer_notify: true,
            expire_by: Math.floor(this.clock().getTime() / 1000) + 7 * 86400,
          }),
        );
        if (
          created.plan_id !== this.config.planId ||
          created.status !== "created"
        )
          throw new AppError(
            409,
            "SUBSCRIPTION_MISMATCH",
            "The provider did not create the requested monthly subscription.",
          );
        this.db
          .prepare(
            "INSERT INTO plan_subscriptions(id,user_id,plan_id,status,created_at) VALUES(?,?,?,?,?)",
          )
          .run(
            created.id,
            userId,
            created.plan_id,
            created.status,
            this.clock().toISOString(),
          );
        row = this.owned(created.id, userId);
      }
      return {
        id: row.id,
        amount: MONTHLY_PRICE_PAISE,
        currency: "INR",
        keyId: this.config.keyId!,
        name: "Platewise",
        description:
          "₹499/month meal planning · renews monthly · cancel renewal anytime",
      };
    });
  }
  async verify(userId: string, input: z.infer<typeof verificationSchema>) {
    return this.serial(userId, async () => {
      this.requireConfiguration();
      const row = this.owned(input.razorpay_subscription_id, userId);
      // Subscription signatures use payment_id|subscription_id, unlike order checkout.
      if (
        !signatureMatches(
          `${input.razorpay_payment_id}|${row.id}`,
          input.razorpay_signature,
          this.config.keySecret!,
        )
      )
        throw new AppError(
          400,
          "INVALID_PAYMENT_SIGNATURE",
          "Subscription verification failed. Check status before starting another payment.",
        );
      await this.sync(row); // A signed authorisation alone is not proof of a paid month.
    });
  }
  async status(userId: string) {
    return this.serial(userId, async () => {
      const row = this.latest(userId);
      if (row && this.configured) await this.sync(row);
    });
  }
  async cancel(userId: string, id: string) {
    return this.serial(userId, async () => {
      this.requireConfiguration();
      const row = this.owned(id, userId);
      if (row.cancel_at_period_end || terminal.has(row.status)) return;
      const current = await this.fetchSubscription(row);
      if (terminal.has(current.status)) {
        this.saveMetadata(current);
        return;
      }
      const paidUntil = this.programs.access(userId).paidUntil;
      const atEnd =
        !!paidUntil &&
        new Date(paidUntil).getTime() > this.clock().getTime() &&
        current.status === "active";
      const cancelled = subscriptionSchema.parse(
        await this.provider(`subscriptions/${encodeURIComponent(id)}/cancel`, {
          cancel_at_cycle_end: atEnd,
        }),
      );
      if (cancelled.id !== id || cancelled.plan_id !== row.plan_id)
        throw new AppError(
          409,
          "SUBSCRIPTION_MISMATCH",
          "Cancellation could not be confirmed. Check status before retrying.",
        );
      this.db.exec("BEGIN IMMEDIATE");
      try {
        this.saveMetadata(cancelled);
        this.db
          .prepare(
            "UPDATE plan_subscriptions SET cancel_at_period_end=1 WHERE id=? AND user_id=?",
          )
          .run(id, userId);
        this.db.exec("COMMIT");
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
      // Never remove a verified paid period just because renewal was cancelled.
    });
  }
  async webhook(raw: Buffer, signature: string) {
    if (!this.config.webhookSecret)
      throw new AppError(
        503,
        "WEBHOOK_NOT_CONFIGURED",
        "Payment webhooks are not configured.",
      );
    if (!signatureMatches(raw, signature, this.config.webhookSecret))
      throw new AppError(
        400,
        "INVALID_WEBHOOK_SIGNATURE",
        "Invalid webhook signature.",
      );
    if (
      process.env.NODE_ENV === "production" &&
      !this.config.keyId?.startsWith("rzp_live_")
    )
      throw new AppError(
        503,
        "PAYMENTS_NOT_CONFIGURED",
        "Production subscriptions require live merchant credentials.",
      );
    const event = JSON.parse(raw.toString("utf8")) as {
      event?: string;
      payload?: {
        subscription?: { entity?: { id?: string } };
        payment?: { entity?: { id?: string } };
        refund?: { entity?: { payment_id?: string } };
      };
    };
    if (["refund.processed", "payment.refunded"].includes(event.event ?? "")) {
      const id =
        event.payload?.refund?.entity?.payment_id ??
        event.payload?.payment?.entity?.id;
      if (!id || !paymentId.safeParse(id).success)
        throw new AppError(400, "INVALID_WEBHOOK", "Missing refund payment.");
      const paid = this.db
        .prepare(
          "SELECT s.user_id FROM subscription_payments p JOIN plan_subscriptions s ON s.id=p.subscription_id WHERE p.id=?",
        )
        .get(id) as { user_id: string } | undefined;
      const legacy = this.db
        .prepare("SELECT user_id FROM memberships WHERE lifetime_payment_id=?")
        .get(id) as { user_id: string } | undefined;
      if (!paid && !legacy) return;
      await this.serial((paid ?? legacy)!.user_id, async () => {
        const payment = paymentSchema.parse(
          await this.provider(`payments/${encodeURIComponent(id)}`),
        );
        const expected = paid ? MONTHLY_PRICE_PAISE : 99900; // Honor refund revocations for fulfilled legacy purchases.
        if (
          payment.id !== id ||
          payment.currency !== "INR" ||
          payment.amount !== expected ||
          payment.amount_refunded < expected
        )
          return;
        if (paid)
          this.db
            .prepare("UPDATE subscription_payments SET refunded=1 WHERE id=?")
            .run(id);
        else
          this.db
            .prepare(
              "UPDATE memberships SET lifetime_payment_id=NULL,purchased_at=NULL WHERE user_id=? AND lifetime_payment_id=?",
            )
            .run(legacy!.user_id, id);
      });
      return;
    }
    if (!event.event?.startsWith("subscription.")) return;
    const id = event.payload?.subscription?.entity?.id;
    if (!id || !subscriptionId.safeParse(id).success)
      throw new AppError(
        400,
        "INVALID_WEBHOOK",
        "Missing subscription information.",
      );
    const row = this.db
      .prepare("SELECT * FROM plan_subscriptions WHERE id=?")
      .get(id) as SubscriptionRow | undefined;
    if (!row) return; // Subscriptions outside this app cannot grant access.
    await this.serial(row.user_id, () => this.sync(row));
  }
}
