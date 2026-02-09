import { test, expect } from "@playwright/test";

test.describe("Login page", () => {
  test("login page loads", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
  });

  test("has Login by Card and Login by Email options", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText(/login by card/i)).toBeVisible();
    await expect(page.getByText(/login by email/i)).toBeVisible();
  });
});
