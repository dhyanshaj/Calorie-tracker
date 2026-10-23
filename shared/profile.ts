import { z } from "zod";
import type { Nutrients } from "./types";
export const goals = [
  {
    id: "lose_weight",
    name: "Lose weight",
    note: "A gradual, sustainable approach",
  },
  {
    id: "build_muscle",
    name: "Build muscle",
    note: "Support training and recovery",
  },
  {
    id: "gain_weight",
    name: "Gain weight",
    note: "Build a consistent eating routine",
  },
  {
    id: "maintain",
    name: "Maintain my weight",
    note: "Find a rhythm that works",
  },
  {
    id: "awareness",
    name: "Understand my food",
    note: "More awareness, less guesswork",
  },
] as const;
export const barriers = [
  "A busy schedule",
  "Unclear portion sizes",
  "Inconsistent routines",
  "Not enough meal ideas",
  "Confusing nutrition advice",
  "Tracking feels like work",
  "Food preferences or restrictions",
  "None of these",
] as const;
export const activities = [
  {
    id: "sedentary",
    label: "Mostly sedentary",
    detail: "0–1 workouts per week",
    factor: 1.2,
  },
  {
    id: "light",
    label: "Lightly active",
    detail: "2–3 workouts per week",
    factor: 1.375,
  },
  {
    id: "moderate",
    label: "Moderately active",
    detail: "4–5 workouts per week",
    factor: 1.55,
  },
  {
    id: "high",
    label: "Highly active",
    detail: "6–7 workouts per week",
    factor: 1.725,
  },
] as const;
export const allergies = [
  "Milk",
  "Eggs",
  "Fish",
  "Soy",
  "Peanuts",
  "Tree nuts",
  "Wheat / gluten",
] as const;
export const profileSchema = z.object({
  name: z.string().trim().min(1).max(80),
  birthDate: z.iso.date(),
  country: z.string().trim().min(2).max(80),
  gender: z.enum(["woman", "man", "nonbinary", "unspecified"]),
  energyBasis: z.enum(["female", "male", "neutral"]),
  heightCm: z.number().min(120).max(230),
  weightKg: z.number().min(30).max(300),
  goal: z.enum([
    "lose_weight",
    "build_muscle",
    "gain_weight",
    "maintain",
    "awareness",
  ]),
  targetWeightKg: z.number().min(30).max(300).nullable(),
  timelineWeeks: z.number().int().min(4).max(104),
  barriers: z.array(z.string().max(100)).max(8),
  activity: z.enum(["sedentary", "light", "moderate", "high"]),
  diet: z.enum(["balanced", "vegetarian", "vegan"]),
  allergies: z.array(z.enum(allergies)).max(7),
  needsClinicalGuidance: z.boolean(),
  cuisine: z.enum(["indian", "mediterranean", "international"]).optional(),
  budget: z.enum(["everyday", "flexible"]).optional(),
  cookingMinutes: z
    .union([z.literal(15), z.literal(30), z.literal(45)])
    .optional(),
});
export type Profile = z.infer<typeof profileSchema>;
export type Account = {
  id: string;
  name: string;
  email: string;
  profile: Profile | null;
  emailVerified?: boolean;
};
export type MenuItem = {
  ingredients?: { key: string; name: string; gramsPer100: number }[];
  foodId: string;
  name: string;
  grams: number;
  nutrients: Nutrients;
  portionLabel: string;
};
export type PlannedMeal = {
  name: string;
  title: string;
  preparation: string[];
  items: MenuItem[];
  totals: Nutrients;
};
export type MealPlanDay = {
  day: string;
  targets: Nutrients;
  menu: PlannedMeal[];
  totals: Nutrients;
  closeToTargets: boolean;
};
export type DailyPlan = {
  sourceProfile?: string;
  eligible: boolean;
  targets: Nutrients | null;
  maintenanceKcal: number | null;
  age: number;
  warnings: string[];
  notes: string[];
  menu: PlannedMeal[];
  week: MealPlanDay[];
  days: MealPlanDay[];
  menuTotals: Nutrients;
  barrierTips: { barrier: string; tip: string }[];
};
