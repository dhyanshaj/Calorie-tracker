import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { LIFETIME_PRICE_PAISE, type CheckoutOrder } from "../shared/program";
import { AppError } from "./errors";
import { PlanPrograms } from "./programs";
export type PaymentConfig = {
  keyId?: string;
  keySecret?: string;
  webhookSecret?: string;
};
const orderSchema = z.object({
  id: z.string().regex(/^order_[A-Za-z0-9]+$/),
  amount: z.literal(LIFETIME_PRICE_PAISE),
  currency: z.literal("INR"),
});
const paymentSchema = z.object({
  id: z.string().regex(/^pay_[A-Za-z0-9]+$/),
  order_id: z.string(),
  amount: z.number().int(),
  currency: z.string(),
  status: z.string(),
  captured: z.boolean(),
  amount_refunded: z.number().int().nonnegative().optional().default(0),
});
export const verificationSchema = z.object({
  razorpay_order_id: z.string().regex(/^order_[A-Za-z0-9]+$/),
  razorpay_payment_id: z.string().regex(/^pay_[A-Za-z0-9]+$/),
  razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/i),
});
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
  private creating = new Map<string, Promise<CheckoutOrder>>();
  constructor(
    private db: DatabaseSync,
    private programs: PlanPrograms,
    private config: PaymentConfig,
    private fetcher: typeof fetch = fetch,
  ) {
    db.exec(
      `CREATE TABLE IF NOT EXISTS payment_orders(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,amount INTEGER NOT NULL,currency TEXT NOT NULL,status TEXT NOT NULL,payment_id TEXT UNIQUE,created_at TEXT NOT NULL);`,
    );
  }
  get configured() {
    return (
      !!(
        this.config.keyId &&
        this.config.keySecret &&
        this.config.webhookSecret
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
        "The payment provider could not be reached. Please retry. If you already paid, use Check payment status.",
      );
    }
    if (!response.ok)
      throw new AppError(
        502,
        "PAYMENT_PROVIDER_ERROR",
        "The payment provider could not complete the request. Please retry or check an existing payment before paying again.",
      );
    return response.json();
  }
  createOrder(userId: string): Promise<CheckoutOrder> {
    const pending = this.creating.get(userId);
    if (pending) return pending;
    const task = this.createOrderOnce(userId).finally(() =>
      this.creating.delete(userId),
    );
    this.creating.set(userId, task);
    return task;
  }
  private async createOrderOnce(userId: string): Promise<CheckoutOrder> {
    if (!this.configured)
      throw new AppError(
        503,
        "PAYMENTS_NOT_CONFIGURED",
        "Payments are not enabled yet. The owner must configure Razorpay before accepting purchases.",
      );
    if (this.programs.access(userId).hasLifetime)
      throw new AppError(
        409,
        "ALREADY_LIFETIME",
        "Your account already has lifetime access.",
      );
    // Reuse an unfinished order so retries do not create multiple checkout requests.
    const pending = this.db
      .prepare(
        "SELECT id FROM payment_orders WHERE user_id=? AND status='created' ORDER BY created_at DESC LIMIT 1",
      )
      .get(userId) as { id: string } | undefined;
    let order: {
      id: string;
      amount: typeof LIFETIME_PRICE_PAISE;
      currency: "INR";
    };
    if (pending)
      order = { id: pending.id, amount: LIFETIME_PRICE_PAISE, currency: "INR" };
    else {
      order = orderSchema.parse(
        await this.provider("orders", {
          amount: LIFETIME_PRICE_PAISE,
          currency: "INR",
          receipt: `pw_${randomUUID().replaceAll("-", "")}`,
        }),
      );
      this.db
        .prepare(
          "INSERT INTO payment_orders(id,user_id,amount,currency,status,created_at) VALUES(?,?,?,?,?,?)",
        )
        .run(
          order.id,
          userId,
          LIFETIME_PRICE_PAISE,
          "INR",
          "created",
          new Date().toISOString(),
        );
    }
    return {
      ...order,
      keyId: this.config.keyId!,
      name: "Platewise",
      description: "Lifetime meal planning · one-time payment · no renewal",
    };
  }
  private async fulfill(
    paymentId: string,
    expectedUserId?: string,
    expectedOrderId?: string,
  ) {
    const payment = paymentSchema.parse(
      await this.provider(`payments/${encodeURIComponent(paymentId)}`),
    );
    const order = this.db
      .prepare("SELECT * FROM payment_orders WHERE id=?")
      .get(payment.order_id) as
      | {
          id: string;
          user_id: string;
          amount: number;
          currency: string;
          status: string;
          payment_id: string | null;
        }
      | undefined;
    if (
      !order ||
      (expectedUserId && order.user_id !== expectedUserId) ||
      (expectedOrderId && order.id !== expectedOrderId)
    )
      throw new AppError(
        404,
        "ORDER_NOT_FOUND",
        "This payment does not belong to your checkout.",
      );
    if (
      payment.id !== paymentId ||
      payment.amount !== LIFETIME_PRICE_PAISE ||
      payment.currency !== "INR" ||
      payment.status !== "captured" ||
      !payment.captured ||
      payment.amount_refunded >= LIFETIME_PRICE_PAISE
    )
      throw new AppError(
        409,
        "PAYMENT_NOT_CAPTURED",
        "The payment has not been confirmed as captured. Do not pay again yet; check its status shortly.",
      );
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.db
        .prepare("SELECT status,payment_id FROM payment_orders WHERE id=?")
        .get(order.id) as { status: string; payment_id: string | null };
      if (current.status !== "paid") {
        this.programs.grantLifetime(order.user_id, paymentId);
        this.db
          .prepare(
            "UPDATE payment_orders SET status='paid',payment_id=? WHERE id=?",
          )
          .run(paymentId, order.id);
      } else if (current.payment_id !== paymentId)
        throw new AppError(
          409,
          "PAYMENT_MISMATCH",
          "This order already has a different confirmed payment. Contact support before paying again.",
        );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  async verify(userId: string, input: z.infer<typeof verificationSchema>) {
    if (!this.configured)
      throw new AppError(
        503,
        "PAYMENTS_NOT_CONFIGURED",
        "Payment verification is not configured.",
      );
    const owned = this.db
      .prepare("SELECT user_id FROM payment_orders WHERE id=?")
      .get(input.razorpay_order_id) as { user_id: string } | undefined;
    if (!owned || owned.user_id !== userId)
      throw new AppError(
        404,
        "ORDER_NOT_FOUND",
        "This order does not belong to your account.",
      );
    if (
      !signatureMatches(
        `${input.razorpay_order_id}|${input.razorpay_payment_id}`,
        input.razorpay_signature,
        this.config.keySecret!,
      )
    )
      throw new AppError(
        400,
        "INVALID_PAYMENT_SIGNATURE",
        "Payment verification failed. Check payment status before trying another purchase.",
      );
    await this.fulfill(
      input.razorpay_payment_id,
      userId,
      input.razorpay_order_id,
    );
  }
  async status(userId: string) {
    const pending = this.db
      .prepare(
        "SELECT id FROM payment_orders WHERE user_id=? AND status='created' ORDER BY created_at DESC LIMIT 1",
      )
      .get(userId) as { id: string } | undefined;
    if (!pending || !this.configured) return;
    const response = (await this.provider(
      `orders/${encodeURIComponent(pending.id)}/payments`,
    )) as { items?: unknown[] };
    for (const raw of response.items ?? []) {
      const parsed = paymentSchema.safeParse(raw);
      if (
        parsed.success &&
        parsed.data.status === "captured" &&
        parsed.data.captured
      ) {
        await this.fulfill(parsed.data.id, userId, pending.id);
        return;
      }
    }
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
    const event = JSON.parse(raw.toString("utf8")) as {
      event?: string;
      payload?: {
        payment?: { entity?: { id?: string; order_id?: string } };
        refund?: { entity?: { payment_id?: string } };
      };
    };
    if (
      event.event === "refund.processed" ||
      event.event === "payment.refunded"
    ) {
      const paymentId =
        event.payload?.refund?.entity?.payment_id ??
        event.payload?.payment?.entity?.id;
      if (!paymentId || !/^pay_[A-Za-z0-9]+$/.test(paymentId))
        throw new AppError(400, "INVALID_WEBHOOK", "Missing refund payment.");
      const owned = this.db
        .prepare(
          "SELECT user_id FROM payment_orders WHERE payment_id=? AND status='paid'",
        )
        .get(paymentId) as { user_id: string } | undefined;
      if (!owned) return;
      const payment = paymentSchema.parse(
        await this.provider(`payments/${encodeURIComponent(paymentId)}`),
      );
      if (
        payment.id === paymentId &&
        payment.amount_refunded >= LIFETIME_PRICE_PAISE
      ) {
        this.db.exec("BEGIN IMMEDIATE");
        try {
          this.db
            .prepare(
              "UPDATE memberships SET lifetime_payment_id=NULL,purchased_at=NULL WHERE user_id=? AND lifetime_payment_id=?",
            )
            .run(owned.user_id, paymentId);
          this.db
            .prepare(
              "UPDATE payment_orders SET status='refunded' WHERE payment_id=?",
            )
            .run(paymentId);
          this.db.exec("COMMIT");
        } catch (error) {
          this.db.exec("ROLLBACK");
          throw error;
        }
      }
      return;
    }
    if (event.event !== "payment.captured") return;
    const paymentId = event.payload?.payment?.entity?.id;
    const orderId = event.payload?.payment?.entity?.order_id;
    if (!paymentId || !/^pay_[A-Za-z0-9]+$/.test(paymentId) || !orderId)
      throw new AppError(
        400,
        "INVALID_WEBHOOK",
        "Missing payment information.",
      );
    const owned = this.db
      .prepare("SELECT id FROM payment_orders WHERE id=?")
      .get(orderId);
    if (!owned) return;
    await this.fulfill(paymentId, undefined, orderId);
  }
}
