# Validate photo estimates with real meals

Automated fixtures prove API behavior, portion corrections and nutrient math;
they do not measure a vision model's accuracy on real meals. No measured real-photo
benchmark has been completed in this repository. A photo cannot reveal exact
ingredients, weights, absorbed oil or edible meat yield.

## What works locally

The bundled catalog now has 44 actual USDA SR28 ingredient records and 22 added
calculated reference recipes, with per-ingredient weights and explicit oil-free
variants. Sources, preparation assumptions and editable portions remain visible.
Indian examples include rajma, chole, khichdi, chilla, upma, raita and sabzi.
These are reference formulations, not laboratory measurements of restaurant food.
Optional live USDA search expands coverage when its key is configured.

Explicit supported amounts override visual guesses. Unknown foods remain gaps.
The interface shows qualitative uncertainty and the reasons behind it; it does
not invent a percentage confidence or precision claim. Fat, recipe composition,
household measures and cooked/edible weights should be reviewed before saving.
Description-only analysis uses the local parser, without a paid model call.

## Run a live benchmark

1. Configure a valid server-side OpenAI key and billing using [PHOTO-SETUP.md](PHOTO-SETUP.md).
2. Photograph representative meals you have permission to process externally.
   Include different lighting/angles and regional mixed dishes. Keep photos in
   a private folder outside Git; never upload someone else's private images
   without permission. The benchmark sends images and descriptions to OpenAI
   and incurs API costs.
3. Weigh edible ingredients and cooking fat, record raw/cooked states and the
   amount eaten, then calculate ground-truth comparison nutrients from verified
   records or packaging. Record bone/skin leftovers and preparation yields.
   These comparison nutrients still inherit database/measurement uncertainty.
4. Create a private JSON manifest. For example, replace every placeholder and
   every zero below with the actual measured sample values:

   ```json
   [
     {
       "id": "YOUR_SAMPLE_ID",
       "image": "YOUR_MEAL.jpg",
       "description": "YOUR_ACTUAL_MEAL_AND_AMOUNT_EATEN",
       "measured": { "kcal": 0, "protein": 0, "fat": 0 },
       "notes": "How ingredients, edible weights and oil were measured"
     }
   ]
   ```

5. Run `npm run benchmark:photos -- /absolute/path/to/manifest.json`. Use the
   same machine where your key is securely configured. The script strips image
   metadata, resizes photos, requests real analysis, and writes a private report
   under `.benchmarks/`. It does not store image copies or add diary meals.
6. Review per-sample absolute and percentage errors for kcal, protein and fat,
   alongside failures, unknown foods and missing portions. Percentage error is
   undefined when a measured value is zero; use absolute error there. Do not
   omit failed/incomplete samples to inflate an accuracy claim. Validate both
   photo-only and photo-plus-description use with a diverse held-out set.

Before publishing claims, define acceptable error ranges and review results with
a qualified nutrition professional. Improve prompts/catalog references where
failures recur, repeat validation after a model change, and retain the full
evaluation methodology. A passing code test or configured-key indicator cannot
replace this validation.

## Photo allowances

Basic diary/manual/description tracking stays free. A Plus trial starts only
when explicitly chosen and includes 100 successful photo analyses over 30 calendar
days. Paid Plus includes 100 per calendar billing month. Annual subscriptions
also reset their allowance monthly, anchored to the paid period start; month-end
dates clamp correctly. It is not 1,200 analyses available immediately.

The server reserves an allowance slot before requesting the model to prevent
concurrent overspend. Provider errors and non-food/empty results release it;
successful nonempty results, including partial estimates requiring corrections,
consume one. Photos and image hashes are not retained in the usage ledger.
Refresh, sign-out and new checklist cycles do not reset the allowance. Access
expiry and verified full refunds stop further photo requests. Rate limits still
protect attempts even when requests do not consume the successful-analysis quota.
