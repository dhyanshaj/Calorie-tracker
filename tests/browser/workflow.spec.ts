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
  const profileResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/profile") &&
      response.request().method() === "PUT",
  );
  await page.getByRole("button", { name: "Build my starting plan" }).click();
  const responseBody = await (await profileResponse).json();
  await expect(
    page.getByRole("heading", { name: "Your daily meal plan", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(7);
  await page
    .getByRole("button", { name: "Show all 30 days", exact: true })
    .click();
  await expect(page.getByRole("tab")).toHaveCount(30);
  await page
    .getByRole("button", { name: "Show one week", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Completed Day 1", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Start my free plan", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Completed Day 1", exact: true })
    .check();
  await expect(
    page.locator(".program-stats > div").nth(1).locator("strong"),
  ).toHaveText("29");
  await page.reload();
  await page
    .getByRole("button", { name: "My nutrition plan", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Completed Day 1", exact: true }),
  ).toBeChecked();
  await expect(
    page.locator(".program-stats > div").nth(1).locator("strong"),
  ).toHaveText("29");
  await page
    .getByRole("checkbox", { name: "Completed Day 1", exact: true })
    .uncheck();
  await expect(
    page.locator(".program-stats > div").nth(1).locator("strong"),
  ).toHaveText("30");
  await expect(
    page.getByRole("button", { name: "Subscribe for ₹199/month" }),
  ).toBeDisabled();
  await expect(page.locator(".subscription-card")).toContainText(
    "₹199 per month",
  );
  await expect(page.locator(".subscription-card")).toContainText(
    "No automatic charge at trial end",
  );
  await expect(page.locator(".subscription-card")).not.toContainText("999");
  await page.getByRole("tab", { name: /^Day 1 / }).click();
  await expect(page.locator(".plan-meal")).toHaveCount(4);
  await expect(page.locator(".plan-meal-header h3")).toHaveText(
    responseBody.plan.days[0].menu.map((meal: any) => meal.title),
  );
  await expect(
    page.locator(".day-nutrition-summary .comparison-kcal > strong"),
  ).toHaveText(
    `${Math.round(responseBody.plan.days[0].totals.kcal).toLocaleString()}kcal`,
  );
  await page.getByRole("tab", { name: /^Day 2 / }).click();
  await expect(page.locator(".day-plan-heading h4")).toHaveText("Day 2’s menu");
  await expect(page.locator(".plan-meal-header h3")).toHaveText(
    responseBody.plan.days[1].menu.map((meal: any) => meal.title),
  );
  await page.locator(".meal-preparation summary").first().click();
  await expect(page.locator(".meal-preparation ol").first()).toBeVisible();
  await page.getByText("Ingredients for day 2").click();
  await expect(page.locator(".shopping-list ul")).toBeVisible();
  const colors = await page
    .locator(".plan-meal")
    .first()
    .evaluate((element) => ({
      card: getComputedStyle(element).backgroundColor,
      page: getComputedStyle(document.body).backgroundColor,
    }));
  expect(colors.card).toBe("rgb(27, 29, 35)");
  expect(colors.page).toBe("rgb(16, 17, 21)");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `/tmp/platewise-plan-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Review & log this meal" })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Your meal, estimated" }),
  ).toBeVisible();
  await expect(page.locator(".food-row")).toHaveCount(
    responseBody.plan.days[1].menu[0].items.length,
  );
  await expect(page.locator(".daily-calories strong")).toHaveText("0");
  await page.getByRole("button", { name: "Discard estimate" }).click();
  const photo = await sharp({
    create: { width: 160, height: 160, channels: 3, background: "#8eaa72" },
  })
    .png()
    .toBuffer();
  await page.getByLabel("Upload meal photo", { exact: true }).setInputFiles({
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

test("profiles without automated targets see a clear explanation rather than an empty plan", async ({
  page,
}) => {
  const signup = await page.request.post("/api/auth/signup", {
    data: {
      name: "Plan review",
      email: `guard-${Date.now()}@example.com`,
      password: "test-account-password",
    },
  });
  expect(signup.status()).toBe(201);
  const profile = {
    name: "Plan review",
    birthDate: "1996-05-10",
    country: "India",
    gender: "unspecified",
    energyBasis: "neutral",
    heightCm: 170,
    weightKg: 70,
    goal: "maintain",
    targetWeightKg: null,
    timelineWeeks: 12,
    barriers: [],
    activity: "light",
    diet: "vegetarian",
    allergies: [],
    needsClinicalGuidance: true,
  };
  const saved = await page.request.put("/api/profile", { data: profile });
  expect(saved.status()).toBe(200);
  await page.goto("/");
  await page
    .getByRole("button", { name: "My nutrition plan", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Why your meal plan isn’t shown" }),
  ).toBeVisible();
  await expect(page.locator(".plan-unavailable")).toContainText(
    "automated targets and menus are paused",
  );
  await expect(
    page.getByRole("button", { name: "Review profile details" }),
  ).toBeVisible();
  await expect(page.locator(".plan-meal")).toHaveCount(0);
});
