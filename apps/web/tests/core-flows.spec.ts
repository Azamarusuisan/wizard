import { expect, test } from "@playwright/test";

test("solver runs and displays strategy metrics", async ({ page }) => {
  await page.goto("/solver");
  await expect(page.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await page.getByLabel("Board").fill("Ah Ah");
  await expect(page.getByRole("alert")).toContainText("duplicate");
  await expect(page.getByRole("button", { name: "Start solve" })).toBeDisabled();
  await page.getByLabel("Board").fill("Ah Kd 7c");
  await page.getByLabel("Game").selectOption("PLO5");
  await expect(page.getByRole("table", { name: "strategy table" })).toContainText("PLO5 B1");
  await expect(page.getByText("PLO Fast BR")).toBeVisible();
  await page.getByLabel("Game").selectOption("PLO4");
  await expect(page.getByRole("table", { name: "strategy table" })).toContainText("PLO4 B1");
  await expect(page.getByText("PLO Fast BR")).toBeVisible();
  await page.getByLabel("Game").selectOption("NLH");
  await page.getByLabel("Rake %").fill("5");
  await page.getByLabel("Rake cap").fill("10");
  await page.getByRole("button", { name: "Start solve" }).click();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeEnabled();
  await expect(page.getByRole("table", { name: "strategy table" })).toContainText("AcAd");
  await expect(page.getByRole("table", { name: "strategy table" })).toContainText("R EV");
  await expect(page.getByText("MDF")).toBeVisible();
  await expect(page.getByText("SPR")).toBeVisible();
  await expect(page.getByText("BR gap")).toBeVisible();
  await expect(page.getByText("abstracted")).toBeVisible();
  await expect(page.getByText(/default-combo abstraction/)).toBeVisible();
  await expect(page).toHaveURL(/spot=/);
  await expect(page.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await page.getByRole("button", { name: "Start solve" }).click();
  await expect(page.getByText("cached")).toBeVisible();
});

test("equity lab shows AA vs KK", async ({ page }) => {
  await page.goto("/equity");
  await expect(page.locator(".card").filter({ hasText: "Player 1" })).toBeVisible();
  await expect(page.locator('[aria-label^="Player 1:"]')).toContainText(/Eq 8[0-3]\./);
  await expect(page.locator('[aria-label^="Player 1:"]')).toContainText("W");
  await expect(page.locator('[aria-label^="Player 1:"]')).toContainText("T");
  await page.getByLabel("Mode").selectOption("mc");
  await page.getByLabel("Iterations").fill("1000");
  await expect(page.locator('[aria-label^="Player 1:"]')).toContainText("±");
  await page.getByLabel("Dead cards example Ac Td").fill("As");
  await expect(page.getByRole("alert")).toContainText("duplicate");
  await page.getByLabel("Dead cards example Ac Td").fill("");
  await page.getByLabel("Board cards example Ah Kd 7c").fill("2c 3d 4h 5s 9c");
  await page.getByRole("button", { name: "Add player" }).click();
  await expect(page.locator('[aria-label^="Player 3:"]')).toBeVisible();
  await page.getByRole("button", { name: "Remove player" }).click();
  await page.getByLabel("Game").selectOption("PLO5");
  await expect(page.getByRole("alert")).toContainText("PLO5");
  await page.getByLabel("Player 1").fill("As Ah Kc Qd Js");
  await page.getByLabel("Player 2").fill("Ts 9h 8d 7c 6s");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator('[aria-label^="Player 2:"]')).toBeVisible();
});

test("trainer displays decision controls", async ({ page }) => {
  await page.goto("/trainer");
  await expect(page.getByText("BTN vs BB")).toBeVisible();
  await page.keyboard.press("B");
  await expect(page.getByText("EV loss")).toBeVisible();
  await expect(page.getByText("Perfect")).toBeVisible();
  await expect(page.locator('[aria-label="Attempts: 1"]')).toBeVisible();
  await page.goto("/");
  await expect(page.locator('[aria-label^="Average EV loss:"]')).not.toContainText("No sessions");
});

test("range editor round trips text", async ({ page }) => {
  await page.goto("/editor");
  await page.getByLabel("Range text").fill("QQ, JTs:0.25");
  await expect(page.getByLabel("Range JSON")).toContainText('"text": "QQ, JTs:0.25"');
  await page.getByLabel("Range JSON").fill('{"version":1,"kind":"range","payload":{"text":"AA, KQs:0.5"}}');
  await page.getByRole("button", { name: "Import JSON" }).click();
  await expect(page.getByLabel("Range text")).toHaveValue("AA, KQs:0.5");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("saved")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Range text")).toHaveValue("AA, KQs:0.5");
});

test("COOP COEP headers are set", async ({ request }) => {
  const res = await request.get("/");
  expect(res.headers()["cross-origin-opener-policy"]).toBe("same-origin");
  expect(res.headers()["cross-origin-embedder-policy"]).toBe("require-corp");
});

test("settings clears cached data", async ({ page }) => {
  await page.goto("/solver");
  await page.getByRole("button", { name: "Start solve" }).click();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await page.goto("/settings");
  await page.getByLabel("Theme").selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByLabel("Deck colors").selectOption("two");
  await expect(page.locator("html")).toHaveAttribute("data-deck", "two");
  await page.getByLabel("Precision").selectOption("precise");
  await expect(page.getByLabel("Precision")).toHaveValue("precise");
  await expect(page.locator(".card").filter({ hasText: /^Solves/ })).toBeVisible();
  await expect(page.getByLabel("Solve cache entries")).toBeVisible();
  await page.getByRole("button", { name: "Delete solve" }).click();
  await expect(page.locator('[aria-label="Solves: 0"]')).toBeVisible();
  await page.goto("/solver");
  await page.getByRole("button", { name: "Start solve" }).click();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await page.goto("/settings");
  await page.getByRole("button", { name: "Clear all data" }).click();
  await expect(page.locator('[aria-label="Solves: 0"]')).toBeVisible();
});
