import { test, expect } from "@playwright/test";
import sharp from "sharp";
test("account, onboarding, plan, photo fallback, corrections and diary lifecycle", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByLabel("Your name", { exact: true }).fill("Avery");
  const email = `browser-${testInfo.project.name}-${Date.now()}@example.com`;
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("browser-password-123");
  await page.getByRole("button", { name: "Create my space" }).click();
  await expect(page.getByText("What brings you here,")).toBeVisible();
  await page.getByText("Lose weight", { exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByText("A busy schedule", { exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Date of birth").fill("1996-05-10");
  await page.getByLabel("Country", { exact: true }).fill("India");
  await page.getByLabel("Height").fill("175");
  await page.getByLabel("Current weight").fill("80");
  await page.getByLabel("Energy calculation basis").selectOption("male");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByText("Moderately active", { exact: true }).click();
  await expect(page.getByText("4–5 workouts per week")).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Target weight").fill("75");
  await page.getByRole("button", { name: "Build my starting plan" }).click();
  await expect(page.getByText("A sample day, made for you")).toBeVisible();
  await expect(page.getByText("Actual sample menu totals")).toBeVisible();
  if (testInfo.project.name === "desktop")
    await page.screenshot({
      path: "/tmp/platewise-plan-desktop.png",
      fullPage: true,
    });
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  const photo = await sharp({
    create: { width: 160, height: 160, channels: 3, background: "#8eaa72" },
  })
    .png()
    .toBuffer();
  await page
    .getByLabel("Upload meal photo", { exact: true })
    .setInputFiles({
      name: "test-only-fixture.png",
      mimeType: "image/png",
      buffer: photo,
    });
  await expect(
    page.getByAltText("Your meal, ready for analysis"),
  ).toBeVisible();
  await page
    .getByLabel("Describe your meal")
    .fill(
      "Two medium rotis without ghee and four bone-in pieces of chicken curry with some gravy",
    );
  await page.getByRole("button", { name: "Estimate my meal" }).click();
  await expect(
    page.getByText("Photo analysis needs a server-side", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Use my description without the photo" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your meal, estimated" }),
  ).toBeVisible();
  await expect(page.locator(".results-card .calorie strong")).toHaveText(
    "557kcal",
  );
  await expect(page.locator(".daily-calories strong")).toHaveText("0");
  await page
    .getByLabel("Quantity for Plain whole-wheat roti", { exact: true })
    .fill("3");
  await page.getByRole("button", { name: "Recalculate", exact: true }).click();
  await expect(page.locator(".results-card .calorie strong")).toHaveText(
    "659kcal",
  );
  await page
    .getByLabel("Meal name", { exact: true })
    .fill("Roti & chicken curry");
  await page.getByRole("button", { name: "Confirm & save meal" }).click();
  await expect(page.locator(".diary-meal")).toHaveCount(1);
  await expect(page.locator(".daily-calories strong")).toHaveText("659");
  await page.reload();
  await expect(page.locator(".diary-meal")).toHaveCount(1);
  await expect(page.locator(".daily-calories strong")).toHaveText("659");
  if (testInfo.project.name === "desktop")
    await page.screenshot({
      path: "/tmp/platewise-dashboard-desktop.png",
      fullPage: true,
    });
  if (testInfo.project.name === "mobile")
    await page.screenshot({
      path: "/tmp/platewise-dashboard-mobile.png",
      fullPage: true,
    });
  await page.getByRole("button", { name: "Edit Roti & chicken curry" }).click();
  await page
    .getByLabel("Quantity for Plain whole-wheat roti", { exact: true })
    .fill("2");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".diary-meal")).toHaveCount(1);
  await expect(page.locator(".daily-calories strong")).toHaveText("557");
  await page.getByRole("button", { name: "Next day" }).click();
  await expect(page.locator(".diary-meal")).toHaveCount(0);
  await expect(page.locator(".daily-calories strong")).toHaveText("0");
  await page.getByRole("button", { name: "Previous day" }).click();
  await expect(page.locator(".diary-meal")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Delete Roti & chicken curry" })
    .click();
  await page.getByRole("button", { name: "Delete meal", exact: true }).click();
  await expect(page.locator(".diary-meal")).toHaveCount(0);
  await expect(page.locator(".daily-calories strong")).toHaveText("0");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
});
