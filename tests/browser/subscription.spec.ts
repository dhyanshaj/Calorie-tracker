import { test, expect } from "@playwright/test";
import type { ProgramState } from "../../shared/program";

// UI-only provider fixtures; backend signature/charge checks run in billing.test.ts.
test("monthly subscription checkout and cancellation disclose renewal terms and preserve paid access", async ({
  page,
}, testInfo) => {
  const signup = await page.request.post("/api/auth/signup", {
    data: {
      name: "Monthly review",
      email: `monthly-${testInfo.project.name}-${Date.now()}@example.com`,
      password: "test-account-password",
    },
  });
  expect(signup.status()).toBe(201);
  const saved = await page.request.put("/api/profile", {
    data: {
      name: "Monthly review",
      birthDate: "1996-05-10",
      country: "India",
      gender: "unspecified",
      energyBasis: "neutral",
      heightCm: 170,
      weightKg: 70,
      goal: "maintain",
      targetWeightKg: null,
      timelineWeeks: 12,
      barriers: [],
      activity: "light",
      diet: "vegetarian",
      allergies: [],
      needsClinicalGuidance: false,
    },
  });
  expect(saved.status()).toBe(200);
  const started = await page.request.post("/api/plan-program/start");
  let state: ProgramState = await started.json();
  state = {
    ...state,
    paymentMode: "test",
    access: {
      ...state.access,
      status: "subscribed",
      hasPaidPlan: true,
      paidUntil: "2050-12-20T10:00:00.000Z",
      checkoutAvailable: true,
      subscription: {
        id: "sub_uiFixture",
        status: "active",
        cancelAtPeriodEnd: false,
        nextChargeAt: "2050-12-20T10:00:00.000Z",
      },
    },
  };
  await page.route("**/api/plan-program", (route) =>
    route.fulfill({ json: state }),
  );
  let cancellations = 0;
  await page.route(
    "**/api/billing/subscriptions/sub_uiFixture/cancel",
    async (route) => {
      cancellations++;
      if (cancellations === 1)
        return route.fulfill({
          status: 502,
          json: {
            error: {
              code: "FIXTURE_OUTAGE",
              message: "Cancellation could not be confirmed. Please retry.",
            },
          },
        });
      state = {
        ...state,
        access: {
          ...state.access,
          subscription: {
            ...state.access.subscription!,
            cancelAtPeriodEnd: true,
            nextChargeAt: null,
          },
        },
      };
      await route.fulfill({ json: state });
    },
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "My nutrition plan", exact: true })
    .click();
  await expect(page.locator(".subscription-card")).toContainText(
    "billing renews monthly unless you cancel renewal",
  );
  await expect(page.locator(".subscription-dates").first()).toContainText(
    "Paid access through",
  );
  await page
    .getByRole("button", { name: "Cancel renewal", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Keep subscription", exact: true })
    .click();
  expect(cancellations).toBe(0);
  await page
    .getByRole("button", { name: "Cancel renewal", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm cancellation", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Cancellation could not be confirmed",
  );
  await expect(page.locator(".subscription-dates").first()).toContainText(
    "Paid access through",
  );
  await page
    .getByRole("button", { name: "Confirm cancellation", exact: true })
    .click();
  await expect(page.locator(".subscription-card .eyebrow")).toHaveText(
    "RENEWAL CANCELLED",
  );
  await expect(
    page.getByRole("checkbox", { name: "Completed Day 1", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Cancel renewal", exact: true }),
  ).toHaveCount(0);
  expect(cancellations).toBe(2);
  await page.reload();
  await page
    .getByRole("button", { name: "My nutrition plan", exact: true })
    .click();
  await expect(page.locator(".subscription-card .eyebrow")).toHaveText(
    "RENEWAL CANCELLED",
  );
  state = {
    ...state,
    access: {
      ...state.access,
      status: "expired",
      hasPaidPlan: false,
      canTrack: false,
      paidUntil: "2026-10-20T10:00:00.000Z",
      subscription: { ...state.access.subscription!, status: "cancelled" },
    },
  };
  await page.reload();
  await page
    .getByRole("button", { name: "My nutrition plan", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Completed Day 1", exact: true }),
  ).toBeDisabled();
  await page.route("**/api/billing/subscriptions", (route) =>
    route.fulfill({
      json: {
        id: "sub_uiNew",
        keyId: "rzp_test_uiFixture",
        amount: 49900,
        currency: "INR",
        name: "Platewise",
        description: "UI fixture subscription",
      },
    }),
  );
  await page.route("**/api/billing/verify", async (route) => {
    const submitted = route.request().postDataJSON();
    expect(submitted.razorpay_subscription_id).toBe("sub_uiNew");
    state = {
      ...state,
      access: {
        ...state.access,
        status: "subscribed",
        hasPaidPlan: true,
        canTrack: true,
        paidUntil: "2050-12-20T10:00:00.000Z",
        subscription: {
          id: "sub_uiNew",
          status: "active",
          cancelAtPeriodEnd: false,
          nextChargeAt: "2050-12-20T10:00:00.000Z",
        },
      },
    };
    await route.fulfill({ json: state });
  });
  await page.evaluate(() => {
    window.Razorpay = class {
      constructor(private options: Record<string, unknown>) {
        (window as any).checkoutFixture = options;
      }
      open() {
        (this.options.handler as Function)({
          razorpay_subscription_id: "sub_uiNew",
          razorpay_payment_id: "pay_uiFixture",
          razorpay_signature: "0".repeat(64),
        });
      }
      on() {}
    };
  });
  await page.getByRole("button", { name: "Subscribe for ₹499/month" }).click();
  await expect(page.locator(".payment-notice")).toContainText(
    "₹499/month plan is active",
  );
  const options = await page.evaluate(() => (window as any).checkoutFixture);
  expect(options.subscription_id).toBe("sub_uiNew");
  expect(options.order_id).toBeUndefined();
  await expect(
    page.getByRole("button", { name: "Cancel renewal", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
});
