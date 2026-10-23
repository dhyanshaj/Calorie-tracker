import { randomUUID } from "node:crypto";
import { catalog, foodById } from "../shared/catalog";
import { calculateItem } from "../shared/nutrition";
import type { MealItem } from "../shared/types";
const words: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  half: 0.5,
  quarter: 0.25,
};
const num =
  "(?:\\d+(?:\\.\\d+)?(?:/\\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|half|quarter|an?|½|¼)";
function number(s: string) {
  if (s === "½") return 0.5;
  if (s === "¼") return 0.25;
  if (s.includes("/")) {
    const [a, b] = s.split("/").map(Number);
    return a / b;
  }
  return words[s] ?? Number(s);
}
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function parseDescription(description: string): {
  items: MealItem[];
  explicit: Set<string>;
  excluded: Set<string>;
  questions: string[];
  unmatched: string[];
} {
  const text = description
    .toLowerCase()
    .replace(/\b(?:with no|no added)\b/g, "without")
    .replace(
      /\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+and\s+(?:a\s+)?half\b/g,
      (_match, count: string) => String(number(count) + 0.5),
    );
  const candidates: {
    start: number;
    end: number;
    food: (typeof catalog)[number];
  }[] = [];
  for (const food of catalog)
    for (const alias of food.aliases) {
      const re = new RegExp(`\\b${escape(alias)}\\b`, "g");
      for (const m of text.matchAll(re))
        candidates.push({ start: m.index!, end: m.index! + m[0].length, food });
    }
  candidates.sort(
    (a, b) => a.start - b.start || b.end - b.start - (a.end - a.start),
  );
  const matches: typeof candidates = [];
  for (const m of candidates)
    if (!matches.some((n) => m.start < n.end && m.end > n.start))
      matches.push(m);
  const items: MealItem[] = [];
  const explicit = new Set<string>();
  const excluded = new Set<string>();
  const questions: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const m = { ...matches[i] };
    const priorEnd = matches[i - 1]?.end ?? 0;
    const prefix = text.slice(Math.max(priorEnd, m.start - 85), m.start);
    const tail = text.slice(m.end, matches[i + 1]?.start ?? text.length);
    if (
      /\b(?:without|no|skip|excluding)\s*(?:(?:any|added)\s+)*$/.test(prefix)
    ) {
      excluded.add(m.food.id);
      continue;
    }
    // A quantity must be adjacent to this food through a short list of portion words.
    const modifiers =
      "(?:(?:medium|small|large|bone-in|boneless|skinless|cooked|boiled|grilled|baked|whole|extra|additional|added|servings?|pieces?|slices?|cups?|grams?|g|kg|ml|tsp|tbsp|teaspoons?|tablespoons?|of|a|an)\\s*)*";
    const before = prefix.match(new RegExp(`\\b(${num})\\s*(${modifiers})$`));
    const after = tail.match(
      new RegExp(
        `^\\s*(?:[:=-]\\s*)?(${num})\\s*(g(?:rams?)?|kg|servings?|cups?|pieces?|slices?|ml|tsp|tbsp)\\b`,
      ),
    );
    const consumed = prefix.match(
      new RegExp(
        `\\b(?:ate|had|finished)\\s+(${num})\\s+of\\s+(?:the\\s+)?(${num})\\s*${modifiers}$`,
      ),
    );
    const q = consumed?.[1] ?? before?.[1] ?? after?.[1];
    const unitText = before?.[2] ?? after?.[2] ?? "";
    if (foodById.has(`${m.food.id}-no-oil`)) {
      const explicitOil =
        /\b(?:no|without)\s+(?:added\s+)?oil\b/.test(text) ||
        (matches.some((f) => f.food.id === "oil") &&
          !/\b(?:extra|additional)\b/.test(text));
      if (explicitOil) m.food = foodById.get(`${m.food.id}-no-oil`)!;
    }
    let quantity = q ? number(q) : 1;
    if (consumed && ["half", "quarter", "½", "¼"].includes(consumed[1]))
      quantity *= number(consumed[2]);
    let portion = m.food.portions[0];
    const unitMatch = unitText.match(
      /\b(kg|g|grams?|ml|servings?|cups?|slices?|pieces?|tsp|tbsp|teaspoons?|tablespoons?)\b/,
    );
    const unitRaw = unitMatch?.[1];
    const unit =
      unitRaw === "kg"
        ? "g"
        : unitRaw?.startsWith("gram")
          ? "g"
          : unitRaw?.startsWith("teaspoon")
            ? "tsp"
            : unitRaw?.startsWith("tablespoon")
              ? "tbsp"
              : unitRaw?.replace(/s$/, "");
    if (unit) {
      const found = m.food.portions.find((p) => p.unit === unit);
      if (found) portion = found;
      else
        questions.push(
          `What is the edible weight in grams for ${m.food.name.toLowerCase()}? ${unitRaw} is not a supported portion.`,
        );
      if (unitRaw === "kg") quantity *= 1000;
    }
    let gramsPerUnit = portion.grams;
    if (portion.unit === "piece" && /\bsmall\b/.test(prefix))
      gramsPerUnit *= 2 / 3;
    if (portion.unit === "piece" && /\blarge\b/.test(prefix))
      gramsPerUnit *= 4 / 3;
    // A standalone food mention is an assumption, never an explicit quantity override.
    if (q) explicit.add(m.food.id);
    else
      questions.push(
        `How much ${m.food.name.toLowerCase()} did you eat? We used 1 ${portion.label} (${portion.grams} g).`,
      );
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 10000) {
      questions.push(`Please give a positive quantity for ${m.food.name}.`);
      continue;
    }
    items.push(
      calculateItem(
        {
          id: randomUUID(),
          foodId: m.food.id,
          quantity,
          unit: portion.unit,
          gramsPerUnit,
        },
        m.food,
      ),
    );
  }
  // Unsupported food names remain explicit gaps rather than silently becoming invented nutrients.
  let remainder = text;
  for (const m of [...matches].reverse())
    remainder =
      remainder.slice(0, m.start) +
      " ".repeat(m.end - m.start) +
      remainder.slice(m.end);
  remainder = remainder
    .replace(new RegExp(`\\b${num}\\b`, "g"), " ")
    .replace(
      /\b(i|we|ate|eat|had|have|finished|my|meal|was|is|the|and|with|without|of|some|a|an|little|bit|medium|small|large|bone|in|boneless|skinless|servings?|pieces?|slices?|cups?|grams?|g|kg|ml|tsp|tbsp|teaspoons?|tablespoons?|cooked|boiled|grilled|baked|raw|plain|extra|additional|added|no|for|lunch|dinner|breakfast|gravy|actually|only|about|approximately|around|all|served|portion|on|side)\b/g,
      " ",
    );
  const unmatched = remainder.split(/[^a-z]+/).filter((s) => s.length > 2);
  if (unmatched.length)
    questions.push(
      `We could not match “${[...new Set(unmatched)].join(" ")}” to the local food list. Add or choose the food below, or describe it more specifically.`,
    );
  if (!text.trim() && !items.length)
    questions.push("Which foods did you eat, and how much of each?");
  return { items, explicit, excluded, questions, unmatched };
}
