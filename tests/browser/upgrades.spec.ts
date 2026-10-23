import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const profile = {
  name: "Quick start",
  birthDate: "1996-05-10",
  country: "India",
  gender: "unspecified",
  energyBasis: "neutral",
  heightCm: 170,
  weightKg: 75,
  goal: "maintain",
  targetWeightKg: null,
  timelineWeeks: 12,
  barriers: [],
  activity: "moderate",
  diet: "balanced",
  allergies: [],
  needsClinicalGuidance: false,
  cuisine: "indian",
  budget: "everyday",
  cookingMinutes: 30,
};
test("quick start, favourites, repeat confirmation, swaps, weekly shopping, annual pricing and privacy tools work together", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.getByLabel("Your name", { exact: true }).fill("Quick start");
  const email = `upgrades-${testInfo.project.name}-${Date.now()}@example.com`;
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("upgrade-browser-password");
  await page.getByRole("button", { name: "Create my space" }).click();
  await page
    .getByRole("button", { name: "Start tracking first", exact: true })
    .click();
  await expect(page.getByLabel("Describe your meal")).toBeVisible();
  if (testInfo.project.name === "mobile") {
    const position = await page
      .getByRole("navigation", { name: "Main navigation" })
      .evaluate((el) => ({
        top: el.getBoundingClientRect().top,
        height: innerHeight,
      }));
    expect(position.top).toBeGreaterThan(position.height * 0.7);
  }
  await page.screenshot({
    path: `/tmp/platewise-quick-start-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByLabel("Describe your meal").fill("200 g rajma and two rotis");
  const contrast = await page
    .getByRole("button", { name: "Estimate my meal", exact: true })
    .evaluate((el) => {
      const style = getComputedStyle(el);
      const lum = (rgb: string) => {
        const [r, g, b] = rgb
          .match(/\d+/g)!
          .slice(0, 3)
          .map(Number)
          .map((v) => {
            const s = v / 255;
            return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const a = lum(style.color),
        b = lum(style.backgroundColor);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  await page
    .getByRole("button", { name: "Estimate my meal", exact: true })
    .click();
  await expect(page.locator(".food-row")).toHaveCount(2);
  await page.getByLabel("Meal name", { exact: true }).fill("Weekday rajma");
  await page
    .getByRole("button", { name: "Confirm & save meal", exact: true })
    .click();
  await expect(page.locator(".diary-meal")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Star diary meal Weekday rajma", exact: true })
    .click();
  await page.getByRole("button", { name: "Favourites", exact: true }).click();
  await page
    .getByRole("button", { name: "Repeat Weekday rajma", exact: true })
    .click();
  await expect(page.locator(".diary-meal")).toHaveCount(1);
  await expect(page.locator(".food-row")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Confirm & save meal", exact: true })
    .click();
  await expect(page.locator(".diary-meal")).toHaveCount(2);
  await page.getByRole("button", { name: "Recent foods", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Star food Rajma · kidney bean curry",
      exact: true,
    })
    .click();
  await page.reload();
  await page.getByRole("button", { name: "Favourites", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Add Rajma · kidney bean curry from shortcuts",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (await page.request.put("/api/profile", { data: profile })).status(),
  ).toBe(200);
  await page.reload();
  await page
    .getByRole("button", { name: "My nutrition plan", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start my free plan", exact: true })
    .click();
  await expect(page.getByRole("tab")).toHaveCount(7);
  await page.getByRole("button", { name: "Week 2", exact: true }).click();
  await expect(page.getByRole("tab", { name: /^Day 8 / })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("tab", { name: /^Day 8 / }).press("End");
  await expect(page.getByRole("tab", { name: /^Day 30 / })).toBeFocused();
  await page.getByRole("tab", { name: /^Day 30 / }).press("Home");
  await expect(page.getByRole("tab", { name: /^Day 1 / })).toBeFocused();
  const before = (await (await page.request.get("/api/library")).json())
    .recentMeals.length;
  await page
    .getByRole("button", { name: "Swap this meal", exact: true })
    .nth(1)
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Swap this meal", exact: true })
    .nth(1)
    .click();
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/days/1/swap") && r.request().method() === "PUT",
  );
  await page
    .getByRole("button", { name: /^Swap to / })
    .first()
    .click();
  const updated = await (await response).json();
  await expect(page.locator(".plan-meal-header h3").nth(1)).toHaveText(
    updated.program.plan.days[0].menu[1].title,
  );
  expect(
    (await (await page.request.get("/api/library")).json()).recentMeals.length,
  ).toBe(before);
  await page
    .getByRole("checkbox", { name: "Completed Day 1", exact: true })
    .check();
  await expect(
    page.getByRole("button", { name: "Swap this meal", exact: true }).first(),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: "Completed Day 1", exact: true })
    .uncheck();
  await page
    .getByText("Week 1 shopping list · days 1–7", { exact: true })
    .click();
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download shopping list", exact: true })
    .click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("platewise-week-1-shopping.csv");
  expect(await readFile((await download.path())!, "utf8")).toContain(
    "Ingredient,Quantity (g)",
  );
  await page
    .getByRole("button", { name: "Plus membership", exact: true })
    .click();
  await expect(page.locator(".membership-page")).toContainText(
    "Basic tracking is free, always",
  );
  await page
    .getByRole("button", { name: "Yearly · save 37%", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Subscribe for ₹1,499/year",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(page.locator(".subscription-purchase")).toContainText(
    "₹1,499 upfront per year",
  );
  await page
    .getByRole("button", { name: "Account & privacy", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Send verification email", exact: true }),
  ).toBeDisabled();
  const exportEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download my data", exact: true })
    .click();
  const exportFile = await exportEvent;
  const records = JSON.parse(
    await readFile((await exportFile.path())!, "utf8"),
  );
  expect(records.account.email).toBe(email);
  expect(records.meals).toHaveLength(2);
  expect(JSON.stringify(records)).not.toContain("password_hash");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page
    .getByLabel("Current password", { exact: true })
    .fill("upgrade-browser-password");
  await page
    .getByLabel("Type DELETE to confirm", { exact: true })
    .fill("DELETE");
  await page
    .getByRole("button", { name: "Permanently delete my account", exact: true })
    .click();
  await expect(page.getByLabel("Your name", { exact: true })).toBeVisible();
});

test("recovery links keep tokens out of the URL and show provider errors and completion", async ({
  page,
}) => {
  // Explicit UI fixtures; real token expiry and password hashing run in upgrades.test.ts.
  await page.goto("/account/request");
  await page.getByLabel("Email address").fill("recovery-fixture@example.com");
  await page
    .getByRole("button", { name: "Send reset link", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Email delivery is not enabled",
  );
  await page.route("**/api/auth/password-reset", (route) =>
    route.fulfill({
      json: { message: "Password updated. Sign in with your new password." },
    }),
  );
  await page.goto(`/account/reset#token=${"a".repeat(64)}`);
  await expect(page).toHaveURL(/\/account\/reset$/);
  await page
    .getByLabel("New password", { exact: true })
    .fill("new-fixture-password");
  await page
    .getByRole("button", { name: "Save new password", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Password updated");
});
