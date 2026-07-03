import { expect, test } from "@playwright/test";

test("solver runs and displays strategy metrics", async ({ page }) => {
  await page.goto("/solver");
  await expect(page.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await page.getByLabel("Board").fill("Ah Ah");
  await expect(page.getByRole("alert")).toContainText("duplicate");
  await expect(page.getByRole("button", { name: "Start solve" })).toBeDisabled();
  await page.getByLabel("Board").fill("Ah Kd 7c");
  await page.getByRole("button", { name: "Start solve" }).click();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeEnabled();
  await expect(page.getByRole("table", { name: "strategy table" })).toContainText("AA");
  await expect(page.getByRole("table", { name: "strategy table" })).toContainText("R EV");
  await expect(page.getByText("MDF")).toBeVisible();
  await expect(page.getByText("SPR")).toBeVisible();
  await expect(page.getByText("abstracted")).toBeVisible();
  await expect(page.getByText(/representative-row abstraction/)).toBeVisible();
  await expect(page).toHaveURL(/spot=/);
  await expect(page.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await page.getByRole("button", { name: "Start solve" }).click();
  await expect(page.getByText("cached")).toBeVisible();
});

test("equity lab shows AA vs KK", async ({ page }) => {
  await page.goto("/equity");
  await expect(page.locator(".card").filter({ hasText: "Player 1" })).toBeVisible();
  await expect(page.getByText(/8[0-3]\./)).toBeVisible();
  await page.getByLabel("Game").selectOption("PLO5");
  await page.getByLabel("Player 1").fill("As Ah Kc Qd Js");
  await page.getByLabel("Player 2").fill("Ts 9h 8d 7c 6s");
  await page.getByLabel("Board cards example Ah Kd 7c").fill("2c 3d 4h 5s 9c");
  await expect(page.locator('[aria-label^="Player 2:"]')).toBeVisible();
});

test("trainer displays decision controls", async ({ page }) => {
  await page.goto("/trainer");
  await expect(page.getByText("BTN vs BB")).toBeVisible();
  await page.keyboard.press("B");
  await expect(page.getByText("EV loss")).toBeVisible();
  await expect(page.getByText("Perfect")).toBeVisible();
});

test("range editor round trips text", async ({ page }) => {
  await page.goto("/editor");
  await page.getByRole("textbox").fill("QQ, JTs:0.25");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("saved")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox")).toHaveValue("QQ, JTs:0.25");
});

test("COOP COEP headers are set", async ({ request }) => {
  const res = await request.get("/");
  expect(res.headers()["cross-origin-opener-policy"]).toBe("same-origin");
  expect(res.headers()["cross-origin-embedder-policy"]).toBe("require-corp");
});

test("settings clears cached data", async ({ page }) => {
  await page.goto("/solver");
  await page.getByRole("button", { name: "Start solve" }).click();
  await page.goto("/settings");
  await page.getByLabel("Theme").selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByLabel("Deck colors").selectOption("two");
  await expect(page.locator("html")).toHaveAttribute("data-deck", "two");
  await page.getByLabel("Precision").selectOption("precise");
  await expect(page.getByLabel("Precision")).toHaveValue("precise");
  await expect(page.locator(".card").filter({ hasText: /^Solves/ })).toBeVisible();
  await page.getByRole("button", { name: "Clear all data" }).click();
  await expect(page.locator('[aria-label="Solves: 0"]')).toBeVisible();
});
