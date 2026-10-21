import type { DailyPlan, Profile } from "../shared/profile";
import { activities } from "../shared/profile";
import { buildWeekMenu } from "./menu";
import { emptyNutrients, sumNutrients } from "../shared/nutrition";
export function ageAt(birthDate: string, now = new Date()) {
  const d = new Date(`${birthDate}T12:00:00Z`);
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  if (
    now.getUTCMonth() < d.getUTCMonth() ||
    (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate())
  )
    age--;
  return age;
}
const tips: Record<string, string> = {
  "A busy schedule":
    "Keep two easy meals on rotation. Log a photo now and review it when you have a moment.",
  "Unclear portion sizes":
    "Measure one familiar serving once, then use it as a visual reference. Edit the edible grams in your meal estimate.",
  "Inconsistent routines":
    "Attach logging to something you already do, such as clearing your plate. One saved meal is a useful start.",
  "Not enough meal ideas":
    "Use the sample menu as a starting point and swap ingredients for foods you enjoy.",
  "Confusing nutrition advice":
    "Start with the three estimates here. Look at patterns over time rather than judging a single meal.",
  "Tracking feels like work":
    "Use a photo plus one sentence. Save only after checking the foods and portions.",
  "Food preferences or restrictions":
    "Review ingredient labels and choose food swaps that suit you. A photo cannot reliably detect allergens.",
};
export function buildPlan(profile: Profile, now = new Date()): DailyPlan {
  const age = ageAt(profile.birthDate, now),
    warnings: string[] = [];
  const barrierTips = profile.barriers
    .filter((b) => tips[b])
    .map((barrier) => ({ barrier, tip: tips[barrier] }));
  const base: DailyPlan = {
    eligible: false,
    targets: null,
    maintenanceKcal: null,
    age,
    warnings,
    notes: [],
    menu: [],
    week: [],
    menuTotals: emptyNutrients(),
    barrierTips,
  };
  if (age < 18 || age > 80) {
    warnings.push(
      "Automated nutrition targets are available for adults aged 18–80. You can still log meals; ask a qualified clinician or dietitian for an appropriate plan.",
    );
    return base;
  }
  if (profile.needsClinicalGuidance) {
    warnings.push(
      "Pregnancy, breastfeeding, or a clinician-prescribed diet needs individualized guidance. Meal tracking is available, but automated targets and menus are paused.",
    );
    return base;
  }
  const bmi = profile.weightKg / (profile.heightCm / 100) ** 2;
  const offset =
    profile.energyBasis === "male"
      ? 5
      : profile.energyBasis === "female"
        ? -161
        : -78;
  const bmr =
    10 * profile.weightKg + 6.25 * profile.heightCm - 5 * age + offset;
  const activity = activities.find((a) => a.id === profile.activity)!;
  const maintenance = Math.round((bmr * activity.factor) / 50) * 50;
  let adjustment =
    profile.goal === "lose_weight"
      ? -300
      : ["gain_weight", "build_muscle"].includes(profile.goal)
        ? 250
        : 0;
  if (
    profile.targetWeightKg !== null &&
    ["lose_weight", "gain_weight"].includes(profile.goal)
  ) {
    const delta = profile.targetWeightKg - profile.weightKg;
    const direction = profile.goal === "lose_weight" ? -1 : 1;
    if (Math.sign(delta) !== direction && delta !== 0)
      warnings.push(
        "Your target weight points in the opposite direction to your selected goal. The default gradual adjustment is used; review your profile.",
      );
    else {
      const requested = (delta * 7700) / (profile.timelineWeeks * 7);
      adjustment = Math.max(-500, Math.min(350, requested));
      if (requested !== adjustment)
        warnings.push(
          "Your requested timeline would require a larger energy change than this tool supports. A gradual adjustment is used instead; consider extending the timeline.",
        );
    }
  }
  if (bmi < 18.5 && adjustment < 0) {
    adjustment = 0;
    warnings.push(
      "A weight-loss calorie reduction is not generated for a BMI below 18.5. Please discuss your goal with a qualified professional.",
    );
  }
  if (
    profile.targetWeightKg !== null &&
    profile.targetWeightKg / (profile.heightCm / 100) ** 2 < 18.5 &&
    adjustment < 0
  ) {
    adjustment = 0;
    warnings.push(
      "Your target weight falls below the adult BMI screening range. A calorie reduction is not generated; review this goal with a qualified professional.",
    );
  }
  const floor = profile.energyBasis === "female" ? 1400 : 1600;
  const calories =
    Math.round(Math.max(floor, Math.min(4500, maintenance + adjustment)) / 50) *
    50;
  if (calories !== Math.round((maintenance + adjustment) / 50) * 50)
    warnings.push(
      "The calculated calories reached this tool’s conservative range. These targets may not fit your needs; get individualized guidance.",
    );
  const proteinFactor =
    profile.goal === "build_muscle"
      ? 1.6
      : profile.goal === "lose_weight"
        ? 1.4
        : 1.2;
  const protein = Math.round(
    Math.min(profile.weightKg * proteinFactor, (calories * 0.3) / 4),
  );
  const fat = Math.round((calories * 0.3) / 9);
  const targets = { kcal: calories, protein, fat };
  const plan: DailyPlan = {
    ...base,
    eligible: true,
    targets,
    maintenanceKcal: maintenance,
    notes: [
      "Starting estimates, not a prescribed diet. Adjust with a qualified dietitian based on your needs, appetite, and health.",
      `Energy uses Mifflin–St Jeor resting metabolism × ${activity.factor} activity. Workout frequency only approximates total daily movement.`,
      ...(profile.energyBasis === "neutral"
        ? [
            "Energy uses the midpoint of the two Mifflin–St Jeor sex constants; this increases uncertainty. Gender identity is not used in the equation.",
          ]
        : []),
      `Protein starts at ${proteinFactor} g/kg (capped at 30% of energy); fat starts at 30% of energy. The remaining energy can come from carbohydrates.`,
      `Your ${profile.timelineWeeks}-week timeline is a planning horizon, not a promise of results. Weight change is not linear; the 7,700 kcal/kg approximation only moderates the initial adjustment.`,
      "Source methods: Mifflin et al. (1990), general adult macronutrient ranges. Sample menu nutrition uses the same documented USDA food references as the tracker.",
    ],
  };
  plan.week = buildWeekMenu(profile, targets);
  plan.menu = plan.week[0].menu;
  plan.menuTotals = sumNutrients(
    plan.menu.map((m) => ({ nutrients: m.totals })),
  );
  if (plan.week.some((day) => !day.closeToTargets))
    warnings.push(
      "Some days cannot fully match all three targets within the selected food preferences. Each day shows its actual totals and differences so you can review and adjust.",
    );
  if (profile.allergies.length)
    warnings.push(
      "The menu excludes listed allergen categories, but brands, sauces, and cross-contact still require label checks. Photos cannot confirm allergy safety.",
    );
  return plan;
}
