import "dotenv/config";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { analyzeMeal } from "../server/analysis";
const manifest = process.argv[2];
if (!manifest)
  throw new Error(
    "Usage: npm run benchmark:photos -- /path/to/consented-meal-manifest.json",
  );
if (!process.env.MEAL_VISION_API_KEY)
  throw new Error(
    "Set MEAL_VISION_API_KEY securely before a live benchmark. Each image incurs provider usage.",
  );
const nutrient = z.object({
  kcal: z.number().nonnegative(),
  protein: z.number().nonnegative(),
  fat: z.number().nonnegative(),
});
const samples = z
  .array(
    z.object({
      id: z.string(),
      image: z.string(),
      description: z.string().default(""),
      measured: nutrient,
      notes: z.string().optional(),
    }),
  )
  .min(1)
  .max(50)
  .parse(JSON.parse(await readFile(manifest, "utf8")));
const results = [];
for (const sample of samples) {
  const raw = await readFile(resolve(dirname(manifest), sample.image));
  if (raw.length > 8 * 1024 * 1024)
    throw new Error("Benchmark photo exceeds 8 MB");
  const image = await sharp(raw, { limitInputPixels: 24000000 })
    .rotate()
    .resize({
      width: 1536,
      height: 1536,
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 82 })
    .toBuffer();
  try {
    const prediction = await analyzeMeal(sample.description, image, {
      key: process.env.MEAL_VISION_API_KEY!,
      model: process.env.MEAL_VISION_MODEL ?? "gpt-4.1-mini",
    });
    const errors = Object.fromEntries(
      (["kcal", "protein", "fat"] as const).map((key) => [
        key,
        {
          absolute: Math.abs(prediction.totals[key] - sample.measured[key]),
          percent:
            sample.measured[key] > 0
              ? (Math.abs(prediction.totals[key] - sample.measured[key]) /
                  sample.measured[key]) *
                100
              : null,
        },
      ]),
    );
    results.push({
      id: sample.id,
      estimated: prediction.totals,
      measured: sample.measured,
      incomplete: prediction.incomplete,
      errors,
      questions: prediction.questions,
    });
  } catch {
    results.push({
      id: sample.id,
      error:
        "Analysis failed; inspect provider configuration and retry. No benchmark accuracy is claimed for this sample.",
    });
  }
}
await mkdir(".benchmarks", { recursive: true, mode: 0o700 });
const output = `.benchmarks/report-${Date.now()}.json`;
await writeFile(
  output,
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      sampleCount: samples.length,
      results,
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log(
  `Benchmark report written to ${output}. Review every failed/incomplete sample; a fixture test is not a live accuracy measurement.`,
);
