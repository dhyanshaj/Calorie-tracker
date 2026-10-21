import "dotenv/config";
import express from "express";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { createApp } from "./app";
import { MealStore } from "./store";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const store = new MealStore(
  process.env.DATABASE_PATH ?? resolve(root, ".data/platewise.sqlite"),
);
const app = createApp(store, {
  visionKey: process.env.MEAL_VISION_API_KEY,
  visionModel: process.env.MEAL_VISION_MODEL ?? "gpt-4.1-mini",
  usdaKey: process.env.USDA_API_KEY,
});
const port = Number(process.env.PORT ?? 3000);
if (process.env.NODE_ENV === "production") {
  app.use(express.static(resolve(root, "dist")));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(resolve(root, "dist/index.html")),
  );
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    root,
    server: { middlewareMode: true, hmr: { port: port + 1 } },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
const server = app.listen(port, "0.0.0.0", (error?: Error) => {
  if (error) {
    console.error(`Could not start Platewise on port ${port}: ${error.message}`);
    store.close();
    process.exit(1);
  }
  console.log(
    `Platewise listening on port ${port}. Photo recognition: ${process.env.MEAL_VISION_API_KEY ? "configured" : "not configured"}.`,
  );
});
for (const event of ["SIGINT", "SIGTERM"] as const)
  process.on(event, () =>
    server.close(() => {
      store.close();
      process.exit(0);
    }),
  );
