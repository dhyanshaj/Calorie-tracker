import express from "express";
import multer from "multer";
import sharp from "sharp";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { PlanPrograms } from "./programs";
import { Billing, verificationSchema, type PaymentConfig } from "./billing";
import { Accounts } from "./auth";
import { profileSchema } from "../shared/profile";
import { ageAt, buildPlan } from "./plan";
import { catalog } from "../shared/catalog";
import { calculateItem, sumNutrients } from "../shared/nutrition";
import type { MealItem } from "../shared/types";
import { MealStore } from "./store";
import { AppError } from "./errors";
import { analyzeMeal } from "./analysis";
import { resolveFood, searchFoods } from "./usda";
export type Config = {
  visionKey?: string;
  visionModel: string;
  usdaKey?: string;
  payments?: PaymentConfig;
  paymentFetch?: typeof fetch;
  clock?: () => Date;
};
const itemSchema = z.object({
  id: z.string().min(1).max(100),
  foodId: z.string().max(100),
  quantity: z.number().finite().positive().max(10000),
  unit: z.string().max(20),
  gramsPerUnit: z.number().finite().positive().max(5000),
});
const itemsSchema = z
  .array(itemSchema)
  .min(1)
  .max(40)
  .refine(
    (items) => new Set(items.map((i) => i.id)).size === items.length,
    "Each food row must have a unique ID.",
  );
const date = z.iso
  .datetime({ offset: true })
  .transform((s) => new Date(s).toISOString());
const saveSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().max(3000).default(""),
  eatenAt: date,
  items: itemsSchema,
  saveToken: z.uuid(),
  version: z.number().int().positive().optional(),
  method: z.enum(["manual", "description", "vision"]).default("manual"),
});
export function createApp(store: MealStore, config: Config) {
  const app = express();
  const accounts = new Accounts(store.db);
  const programs = new PlanPrograms(store.db, config.clock);
  const billing = new Billing(
    store.db,
    programs,
    config.payments ?? {},
    config.paymentFetch,
    config.clock,
  );
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("Cache-Control", "no-store");
    if (["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) {
      const origin = req.get("origin");
      // Mutations are same-origin. No credentialed cross-origin access is exposed.
      if (
        origin &&
        (!/^https?:\/\//.test(origin) ||
          new URL(origin).host !== req.get("host"))
      )
        return res.status(403).json({
          error: {
            code: "ORIGIN_REJECTED",
            message:
              "This request came from a different site. Open the app directly and try again.",
          },
        });
    }
    next();
  });
  app.post(
    "/api/billing/webhook",
    express.raw({ type: "application/json", limit: "128kb" }),
    async (req, res) => {
      if (!Buffer.isBuffer(req.body))
        throw new AppError(
          400,
          "INVALID_WEBHOOK",
          "A raw JSON body is required.",
        );
      await billing.webhook(req.body, req.get("x-razorpay-signature") ?? "");
      res.json({ received: true });
    },
  );
  app.use(express.json({ limit: "128kb", type: "application/json" }));
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 8 * 1024 * 1024,
      files: 1,
      fields: 3,
      fieldSize: 12000,
    },
    fileFilter: (_req, file, cb) => {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype))
        return cb(
          new AppError(
            415,
            "IMAGE_TYPE",
            "Use a JPEG, PNG, or WebP image. Convert HEIC photos before uploading.",
          ),
        );
      cb(null, true);
    },
  });

  function visiblePlan(user: ReturnType<Accounts["get"]>) {
    if (!user?.profile) return null;
    const fresh = buildPlan(user.profile);
    if (!fresh.eligible) return fresh;
    const access = programs.access(user.id);
    if (access.status === "expired")
      return programs.current(user.id)?.plan ?? fresh;
    if (access.hasPaidPlan) programs.refreshProfile(user.id, fresh);
    return fresh;
  }
  app.get("/api/auth/me", (req, res) => {
    const user = accounts.current(req);
    res.json({ user, plan: visiblePlan(user) });
  });
  const authLimit = rateLimit({
    windowMs: 15 * 60_000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({
        error: {
          code: "AUTH_LIMIT",
          message: "Too many sign-in attempts. Please wait 15 minutes.",
        },
      }),
  });
  app.post("/api/auth/signup", authLimit, async (req, res) => {
    const user = await accounts.signup(req.body);
    accounts.createSession(user.id, res);
    res.status(201).json({ user, plan: null });
  });
  app.post("/api/auth/login", authLimit, async (req, res) => {
    const user = await accounts.login(req.body);
    accounts.createSession(user.id, res);
    res.json({ user, plan: visiblePlan(user) });
  });
  app.post("/api/auth/logout", (req, res) => {
    accounts.logout(req, res);
    res.status(204).end();
  });
  app.use("/api", accounts.require);
  app.put("/api/profile", (req, res) => {
    const profile = profileSchema.parse(req.body);
    const age = ageAt(profile.birthDate);
    if (age < 0 || age > 110)
      throw new AppError(400, "INVALID_AGE", "Enter a valid date of birth.");
    const user = accounts.saveProfile(res.locals.user.id, profile);
    const plan = buildPlan(profile);
    if (programs.access(user.id).status !== "expired")
      programs.refreshProfile(user.id, plan);
    res.json({ user, plan: visiblePlan(user) });
  });
  const programState = (userId: string) => ({
    ...programs.state(userId, billing.configured),
    paymentMode: billing.mode,
  });
  app.get("/api/plan-program", (_req, res) =>
    res.json(programState(res.locals.user.id)),
  );
  app.post("/api/plan-program/start", (_req, res) => {
    const user = res.locals.user;
    if (!user.profile)
      throw new AppError(
        400,
        "PROFILE_REQUIRED",
        "Complete your profile first.",
      );
    programs.start(user.id, buildPlan(user.profile));
    res.json(programState(user.id));
  });
  app.put("/api/plan-program/:id/days/:day", (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const day = z.coerce.number().int().min(1).max(30).parse(req.params.day);
    const { completed } = z.object({ completed: z.boolean() }).parse(req.body);
    const user = res.locals.user;
    programs.complete(
      user.id,
      id,
      day,
      completed,
      !!user.profile && buildPlan(user.profile).eligible,
    );
    res.json(programState(user.id));
  });
  app.post("/api/plan-program/next", (_req, res) => {
    const user = res.locals.user;
    if (!user.profile)
      throw new AppError(
        400,
        "PROFILE_REQUIRED",
        "Complete your profile first.",
      );
    programs.next(user.id, buildPlan(user.profile));
    res.json(programState(user.id));
  });
  const paymentLimit = rateLimit({
    windowMs: 60_000,
    limit: 15,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({
        error: {
          code: "PAYMENT_RATE_LIMIT",
          message: "Please wait a minute before checking payment again.",
        },
      }),
  });
  app.post("/api/billing/subscriptions", paymentLimit, async (_req, res) => {
    const user = res.locals.user;
    if (!user.profile || !buildPlan(user.profile).eligible)
      throw new AppError(
        400,
        "PLAN_UNAVAILABLE",
        "Automated meal planning is unavailable for this profile. No subscription was created.",
      );
    res.json(await billing.createSubscription(user.id));
  });
  app.post(
    "/api/billing/subscriptions/:id/cancel",
    paymentLimit,
    async (req, res) => {
      const id = z
        .string()
        .regex(/^sub_[A-Za-z0-9]+$/)
        .parse(req.params.id);
      await billing.cancel(res.locals.user.id, id);
      res.json(programState(res.locals.user.id));
    },
  );
  app.post("/api/billing/verify", paymentLimit, async (req, res) => {
    await billing.verify(
      res.locals.user.id,
      verificationSchema.parse(req.body),
    );
    visiblePlan(res.locals.user);
    res.json(programState(res.locals.user.id));
  });
  app.post("/api/billing/status", paymentLimit, async (_req, res) => {
    await billing.status(res.locals.user.id);
    visiblePlan(res.locals.user);
    res.json(programState(res.locals.user.id));
  });
  app.get("/api/status", (_req, res) =>
    res.json({
      visionAvailable: !!config.visionKey,
      usdaAvailable: !!config.usdaKey,
      storage: "sqlite",
      model: config.visionModel,
    }),
  );
  app.get("/api/foods", (_req, res) => res.json({ foods: catalog }));
  app.get("/api/foods/search", async (req, res) => {
    const query = z
      .string()
      .max(100)
      .parse(req.query.q ?? "");
    res.json(await searchFoods(query.trim(), config.usdaKey));
  });
  const analyzeLimit = rateLimit({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({
        error: {
          code: "RATE_LIMIT",
          message: "Please wait a minute before analyzing another meal.",
        },
      }),
  });
  app.post(
    "/api/analyze",
    analyzeLimit,
    upload.single("photo"),
    async (req, res) => {
      const description = z
        .string()
        .max(3000)
        .parse(req.body?.description ?? "");
      let image: Buffer | undefined;
      if (req.file) {
        try {
          const decoder = sharp(req.file.buffer, {
            limitInputPixels: 24_000_000,
            failOn: "error",
            animated: false,
          });
          const info = await decoder.metadata();
          if (!["jpeg", "png", "webp"].includes(info.format ?? ""))
            throw new Error();
          image = await decoder
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
        } catch {
          throw new AppError(
            400,
            "INVALID_IMAGE",
            "This image could not be read, or exceeds 24 megapixels. Try a smaller JPEG, PNG, or WebP.",
          );
        }
      }
      // No uploaded images are written to disk or stored with saved meals.
      res.json(
        await analyzeMeal(description, image, {
          key: config.visionKey,
          model: config.visionModel,
        }),
      );
    },
  );
  async function normalize(
    items: z.infer<typeof itemsSchema>,
    fallback?: MealItem[],
  ): Promise<MealItem[]> {
    return Promise.all(
      items.map(async (input) => {
        // A saved USDA snapshot permits editing existing meals without a network call/key.
        const saved = fallback?.find((i) => i.foodId === input.foodId)?.food;
        const food = saved ?? (await resolveFood(input.foodId, config.usdaKey));
        if (!food)
          throw new AppError(
            400,
            "UNKNOWN_FOOD",
            "A food was not found. Choose it again from the food list.",
          );
        if (!food.portions.some((p) => p.unit === input.unit))
          throw new AppError(
            400,
            "INVALID_PORTION",
            `Choose a supported portion for ${food.name}.`,
          );
        if (input.unit === "g" && input.gramsPerUnit !== 1)
          throw new AppError(
            400,
            "INVALID_PORTION",
            "For grams, use a weight of 1 gram per unit.",
          );
        if (input.quantity * input.gramsPerUnit > 20000)
          throw new AppError(
            400,
            "PORTION_TOO_LARGE",
            "A food portion cannot exceed 20 kg. Check the quantity.",
          );
        return calculateItem(input, food);
      }),
    );
  }
  app.post("/api/recalculate", async (req, res) => {
    const input = z
      .object({ items: itemsSchema, mealId: z.uuid().optional() })
      .parse(req.body);
    const items = await normalize(
      input.items,
      input.mealId
        ? store.get(res.locals.user.id, input.mealId)?.items
        : undefined,
    );
    res.json({
      items,
      totals: sumNutrients(items),
      assumptions: items.map((i) => i.food.assumption),
      questions: [],
      method: "manual",
      incomplete: false,
    });
  });
  app.get("/api/meals", (req, res) => {
    const range = z.object({ start: date, end: date }).parse(req.query);
    if (
      range.start >= range.end ||
      new Date(range.end).getTime() - new Date(range.start).getTime() >
        32 * 86400000
    )
      throw new AppError(
        400,
        "INVALID_RANGE",
        "Choose a valid diary range of up to 32 days.",
      );
    const meals = store.list(res.locals.user.id, range.start, range.end);
    res.json({
      meals,
      totals: sumNutrients(meals.map((m) => ({ nutrients: m.totals }))),
    });
  });
  app.post("/api/meals", async (req, res) => {
    const input = saveSchema.parse(req.body);
    const items = await normalize(input.items);
    const meal = store.save(res.locals.user.id, {
      ...input,
      items,
      totals: sumNutrients(items),
      assumptions: items.map((i) => i.food.assumption),
      questions: [],
      incomplete: false,
    });
    res.status(201).json(meal);
  });
  app.put("/api/meals/:id", async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const input = saveSchema.parse(req.body);
    const prior = store.get(res.locals.user.id, id);
    if (!prior)
      throw new AppError(
        404,
        "NOT_FOUND",
        "This meal no longer exists. Refresh the diary.",
      );
    const items = await normalize(input.items, prior.items);
    const meal = store.save(
      res.locals.user.id,
      {
        ...input,
        items,
        totals: sumNutrients(items),
        assumptions: items.map((i) => i.food.assumption),
        questions: [],
        incomplete: false,
      },
      id,
      input.version,
    );
    res.json(meal);
  });
  app.delete("/api/meals/:id", (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const version = z.coerce.number().int().positive().parse(req.query.version);
    store.delete(res.locals.user.id, id, version);
    res.status(204).end();
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "This API route does not exist." },
    }),
  );
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof AppError)
        return res
          .status(error.status)
          .json({ error: { code: error.code, message: error.message } });
      if (error instanceof z.ZodError)
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: error.issues
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join("; "),
          },
        });
      if (error instanceof multer.MulterError)
        return res.status(400).json({
          error: {
            code: error.code,
            message:
              error.code === "LIMIT_FILE_SIZE"
                ? "Photo must be 8 MB or smaller."
                : "Upload one photo and a description of up to 3,000 characters.",
          },
        });
      if (error instanceof SyntaxError)
        return res.status(400).json({
          error: {
            code: "INVALID_JSON",
            message:
              "The request could not be read. Please reload and try again.",
          },
        });
      if ((error as { status?: number })?.status === 413)
        return res.status(413).json({
          error: {
            code: "TOO_LARGE",
            message:
              "This request is too large. Shorten the description or remove some food rows.",
          },
        });
      // Never log request bodies, images, provider headers, or credentials.
      console.error(
        "An unexpected API error occurred:",
        error instanceof Error ? error.name : "unknown",
      );
      res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: "Something went wrong on the server. Please try again.",
        },
      });
    },
  );
  return app;
}
