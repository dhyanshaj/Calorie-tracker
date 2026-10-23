import type { DailyPlan } from "./profile";
export const PLAN_LENGTH = 30;
export const MONTHLY_PRICE_PAISE = 19900;
export const ANNUAL_PRICE_PAISE = 149900;
export const PHOTO_LIMIT = 100;
export type BillingCadence = "monthly" | "annual";
export type PlanSubscription = {
  id: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  nextChargeAt: string | null;
  cadence?: BillingCadence;
  amountPaise?: number;
};
export type PlanAccess = {
  status: "not_started" | "free" | "expired" | "subscribed" | "legacy_lifetime";
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  freeDaysRemaining: number;
  hasPaidPlan: boolean;
  hasLegacyLifetime: boolean;
  paidUntil: string | null;
  subscription: PlanSubscription | null;
  canTrack: boolean;
  checkoutAvailable: boolean;
  annualCheckoutAvailable?: boolean;
  pricePaise: number;
  currency: "INR";
};
export type PlanProgram = {
  revision?: number;
  id: string;
  cycle: number;
  startedAt: string;
  plan: DailyPlan;
  completedDays: number[];
  completedCount: number;
  remainingDays: number;
};
export type ProgramState = {
  paymentMode?: "test" | "live";
  program: PlanProgram | null;
  access: PlanAccess;
  history: {
    id: string;
    cycle: number;
    completedCount: number;
    startedAt: string;
  }[];
};
export type CheckoutSubscription = {
  id: string;
  amount: number;
  currency: "INR";
  keyId: string;
  name: string;
  description: string;
};
