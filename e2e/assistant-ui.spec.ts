import { expect, test } from "@playwright/test";

test.setTimeout(60000);

test("assistant UI real user flow", async ({ page }) => {
  await page.goto("http://localhost:5173/login", { waitUntil: "networkidle" });
  await page.fill("#codigo", "admin");
  await page.fill("#nip", "admin123");
  await page.getByRole("button", { name: /iniciar/i }).click();
  await page.waitForURL(/\/home|\/$/, { timeout: 15000 });

  await page.evaluate(() => {
    window.__assistantRoutes = [];
    window.addEventListener("cuceiverse.assistant.route", (event) => {
      window.__assistantRoutes.push((event as CustomEvent).detail);
    });
  });

  await page.getByLabel(/abrir asistente/i).click();
  await expect(
    page.getByText("Asistente CUCEIverse", { exact: true }),
  ).toBeVisible();

  async function send(text: string) {
    const input = page.getByPlaceholder(
      /Pregunta por rutas|Escribe donde|Elige/i,
    );
    await input.fill(text);
    await input.press("Enter");
    await expect(page.getByText(text, { exact: true })).toBeVisible({
      timeout: 8000,
    });
    await page.waitForTimeout(1000);
  }

  await send("Llevame a CTA Cafeteria");
  await expect(page.locator("body")).toContainText(
    "primero necesito saber donde estas",
  );
  await expect(page.getByPlaceholder(/Escribe donde estas/i)).toBeVisible();

  await send("estoy en el X");
  await expect(page.locator("body")).toContainText(
    "Te guio de Modulo X a CTA Cafeteria",
  );
  const route1 = await page.evaluate(() => window.__assistantRoutes.at(-1));
  expect(route1).toMatchObject({
    originLabel: "Modulo X",
    destinationLabel: "CTA Cafeteria",
  });
  const bodyAfterRoute = await page.locator("body").innerText();
  expect(bodyAfterRoute).toMatch(/X\s+\S+\s+Cafeteria/);

  await send("Como llego a escolar?");
  await expect(
    page.getByRole("button", { name: "Control Escolar" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Registro Escolar" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Control Escolar" }).click();
  await page.waitForTimeout(1000);
  await expect(page.locator("body")).toContainText(
    "Te guio de Modulo X a Control Escolar",
  );
  const route2 = await page.evaluate(() => window.__assistantRoutes.at(-1));
  expect(route2).toMatchObject({
    originLabel: "Modulo X",
    destinationLabel: "Control Escolar",
  });

  await send("Cual es mi promedio?");
  await expect(page.locator("body")).toContainText(
    /Tu promedio actual|snapshot academico listo/i,
  );

  await send("bases");
  await expect(page.locator("body")).toContainText(
    /varias opciones|Elige una materia/i,
  );
  await page
    .getByRole("button", { name: /^Materia:/ })
    .first()
    .click();
  await page.waitForTimeout(1000);
  await expect(page.locator("body")).toContainText(
    /Encontre la materia|materia/i,
  );

  await send("Necesito una constancia");
  await expect(page.locator("body")).toContainText(
    "Cual necesitas exactamente",
  );
  await send("Necesito una constancia para beca");
  await expect(page.locator("body")).toContainText("Constancia");
});

declare global {
  interface Window {
    __assistantRoutes: Array<Record<string, unknown>>;
  }
}
