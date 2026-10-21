import type { DailyPlan, Profile } from "../shared/profile";
import { activities } from "../shared/profile";
import { foodById } from "../shared/catalog";
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
  plan.menu = buildMenu(profile, targets);
  plan.menuTotals = sumNutrients(
    plan.menu.map((m) => ({ nutrients: m.totals })),
  );
  if (
    Math.abs(plan.menuTotals.protein - targets.protein) >
      targets.protein * 0.15 ||
    Math.abs(plan.menuTotals.kcal - targets.kcal) > targets.kcal * 0.1
  )
    warnings.push(
      "The sample menu does not fully match your targets within the selected preferences. Review its actual totals and adjust foods with a dietitian.",
    );
  if (profile.allergies.length)
    warnings.push(
      "The menu excludes listed allergen categories, but brands, sauces, and cross-contact still require label checks. Photos cannot confirm allergy safety.",
    );
  return plan;
}
const allergenMap: Record<string, string[]> = {
  milk: ["Milk"],
  yogurt: ["Milk"],
  ghee: ["Milk"],
  egg: ["Eggs"],
  salmon: ["Fish"],
  tofu: ["Soy"],
  "peanut-butter": ["Peanuts"],
  almonds: ["Tree nuts"],
  roti: ["Wheat / gluten"],
  bread: ["Wheat / gluten"],
  oats: ["Wheat / gluten"],
};
function buildMenu(
  profile: Profile,
  targets: { kcal: number; protein: number; fat: number },
) {
  const allowed = (id: string) =>
    !allergenMap[id]?.some((a) => profile.allergies.includes(a as any));
  const vegan = profile.diet === "vegan";
  const balanced = profile.diet === "balanced";
  const candidates: [string, [string, number, number, number][]][] = [
    [
      "Breakfast",
      [
        [allowed("oats") ? "oats" : "rice", 234, 120, 400],
        ["banana", 118, 80, 160],
        ...(!vegan
          ? [["milk", 200, 100, 300] as [string, number, number, number]]
          : []),
      ],
    ],
    [
      "Lunch",
      [
        ["rice", 180, 100, 300],
        [balanced ? "chicken" : "tofu", 150, 80, 250],
        ["broccoli", 150, 100, 220],
        ["oil", 8, 0, 18],
      ],
    ],
    [
      "Dinner",
      [
        [
          allowed("roti") ? "roti" : "rice",
          allowed("roti") ? 90 : 160,
          50,
          250,
        ],
        ["dal", 220, 150, 350],
        ["spinach", 150, 80, 220],
        ...(!vegan
          ? [["yogurt", 150, 100, 250] as [string, number, number, number]]
          : []),
      ],
    ],
    [
      "Snack",
      [
        ["apple", 182, 100, 220],
        ["almonds", 25, 10, 40],
        ["chickpeas", 100, 60, 220],
      ],
    ],
  ];
  // Coordinate descent finds practical portions near all three daily targets.
  const entries = candidates.flatMap(([meal, foods]) =>
    foods
      .filter(([id]) => allowed(id))
      .map(([id, grams, min, max]) => ({
        meal,
        id,
        grams,
        min,
        max,
        n: foodById.get(id)!.per100,
      })),
  );
  const score = () => {
    const n = entries.reduce(
      (a, e) => ({
        kcal: a.kcal + (e.n.kcal * e.grams) / 100,
        protein: a.protein + (e.n.protein * e.grams) / 100,
        fat: a.fat + (e.n.fat * e.grams) / 100,
      }),
      emptyNutrients(),
    );
    return (
      ((n.kcal - targets.kcal) / targets.kcal) ** 2 * 3 +
      ((n.protein - targets.protein) / targets.protein) ** 2 +
      ((n.fat - targets.fat) / targets.fat) ** 2
    );
  };
  for (const step of [20, 10, 5, 1])
    for (let iter = 0; iter < 20; iter++)
      for (const e of entries) {
        const original = e.grams;
        let best = score(),
          chosen = original;
        for (const d of [-step, step]) {
          e.grams = Math.max(e.min, Math.min(e.max, original + d));
          const s = score();
          if (s < best) {
            best = s;
            chosen = e.grams;
          }
        }
        e.grams = chosen;
      }
  return candidates.map(([name]) => {
    const items = entries
      .filter((e) => e.meal === name && e.grams > 0)
      .map((e) => ({
        foodId: e.id,
        name: foodById.get(e.id)!.name,
        grams: e.grams,
        nutrients: {
          kcal: (e.n.kcal * e.grams) / 100,
          protein: (e.n.protein * e.grams) / 100,
          fat: (e.n.fat * e.grams) / 100,
        },
      }));
    return { name, items, totals: sumNutrients(items) };
  });
}
