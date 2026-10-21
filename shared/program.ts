import type { DailyPlan } from "./profile";
export const PLAN_LENGTH = 30;
export const LIFETIME_PRICE_PAISE = 99900;
export type PlanAccess = {
  status: "not_started" | "free" | "expired" | "lifetime";
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  freeDaysRemaining: number;
  hasLifetime: boolean;
  canTrack: boolean;
  checkoutAvailable: boolean;
  pricePaise: number;
  currency: "INR";
};
export type PlanProgram = {
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
export type CheckoutOrder = {
  id: string;
  amount: number;
  currency: "INR";
  keyId: string;
  name: string;
  description: string;
};
