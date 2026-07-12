import { expect, test, type Page } from "@playwright/test";
import { PNG } from "pngjs";

function countGreenCimbarPixels(buffer: Buffer): number {
  const png = PNG.sync.read(buffer);
  let greenPixels = 0;
  for (let index = 0; index < png.data.length; index += 4) {
    const red = png.data[index] ?? 0;
    const green = png.data[index + 1] ?? 0;
    const blue = png.data[index + 2] ?? 0;
    const alpha = png.data[index + 3] ?? 0;
    if (alpha > 0 && green > 120 && green > red * 1.4 && green > blue * 1.4) {
      greenPixels += 1;
    }
  }
  return greenPixels;
}

function countChangedPixels(before: Buffer, after: Buffer): number {
  const first = PNG.sync.read(before);
  const second = PNG.sync.read(after);
  if (first.width !== second.width || first.height !== second.height) {
    return Number.MAX_SAFE_INTEGER;
  }
  let changedPixels = 0;
  for (let index = 0; index < first.data.length; index += 4) {
    const delta =
      Math.abs((first.data[index] ?? 0) - (second.data[index] ?? 0)) +
      Math.abs((first.data[index + 1] ?? 0) - (second.data[index + 1] ?? 0)) +
      Math.abs((first.data[index + 2] ?? 0) - (second.data[index + 2] ?? 0)) +
      Math.abs((first.data[index + 3] ?? 0) - (second.data[index + 3] ?? 0));
    if (delta > 30) {
      changedPixels += 1;
    }
  }
  return changedPixels;
}

function deterministicBuffer(byteLength: number): Buffer {
  const bytes = Buffer.allocUnsafe(byteLength);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = (index * 31 + (index >>> 8) * 17 + 11) & 0xff;
  }
  return bytes;
}

async function expectTooltipInsideViewport(page: Page) {
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveAttribute("data-placement", /^(top|bottom)$/);
  const bounds = await tooltip.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.top).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(bounds.viewportWidth);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewportHeight);
}

test("workbench encodes, scans and documents limits", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const screenshot = async (name: string, fullPage = true) =>
    page.screenshot({
      path: `test-results/screenshots/${testInfo.project.name}-${name}.png`,
      fullPage: testInfo.project.name === "mobile" ? false : fullPage,
    });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "project-e" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Encode", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("button", { name: "Start camera" })).toHaveCount(0);
  await page.getByRole("button", { name: "Info", exact: true }).click();
  await expect(page.getByText("Local-only by design")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fullscreen display target" })).toBeVisible();
  await expect(page.getByText("WebAssembly codec")).toBeVisible();
  await expect(page.getByText("Camera API", { exact: true })).toBeVisible();
  await expect(page.getByText("File picker save")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Transfer protocol" })).toBeVisible();
  await expect(page.getByText("1.0 · major 1 only")).toBeVisible();
  await expect(page.getByText("direct · bigfile manifest · bigfile chunk")).toBeVisible();
  if (testInfo.project.name === "mobile") {
    const monitorHeight = await page.locator(".monitor-preview").evaluate((node) => {
      return node.getBoundingClientRect().height;
    });
    expect(monitorHeight).toBeLessThanOrEqual(320);
  }
  await screenshot("info-diagnostics");
  await page.getByRole("button", { name: "Encode", exact: true }).click();
  await expect(page.getByRole("main")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Light" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "System" })).toHaveCount(0);
  await screenshot("encode-empty");

  await page.getByLabel("Text to encode").fill("Project-e text payload from Playwright.");
  await page.getByLabel("Text file name").fill("playwright-note");
  await expect(page.getByRole("button", { name: "Use text" })).toBeEnabled();
  await page.getByRole("button", { name: "Use text" }).click();
  await expect(page.getByText("playwright-note.txt")).toBeVisible();
  await expect(page.getByText("Good size for a direct Cimbar browser transfer.")).toBeVisible();
  await screenshot("encode-text-input");

  await page.getByLabel("Choose file to encode").setInputFiles({
    name: "direct-9mib.bin",
    mimeType: "application/octet-stream",
    buffer: deterministicBuffer(9 * 1024 * 1024),
  });
  await expect(page.getByText("Good size for a direct Cimbar browser transfer.")).toBeVisible();
  await page.getByRole("button", { name: "Render frames" }).click();
  const preview = page.getByLabel("Runtime preview");
  await expect(preview.getByText("direct-9mib.bin")).toBeVisible();
  await expect(preview.locator(".matrix")).toHaveCount(0);
  const renderedCanvas = preview.getByLabel("Rendered Cimbar frame");
  await expect(renderedCanvas).toBeVisible();
  await expect
    .poll(async () => countGreenCimbarPixels(await renderedCanvas.screenshot()), {
      timeout: 10_000,
    })
    .toBeGreaterThan(100);
  const firstCanvasFrame = await renderedCanvas.screenshot();
  await expect
    .poll(async () => countChangedPixels(firstCanvasFrame, await renderedCanvas.screenshot()), {
      timeout: 10_000,
      intervals: [250, 500, 750, 1_000],
    })
    .toBeGreaterThan(1_000);
  await screenshot("encode-rendering");
  const firstFrame = preview.getByText(/Symbol \d+ · rendering · no fixed total/);
  await expect(firstFrame).toBeVisible();
  const firstFrameText = await firstFrame.textContent();
  await expect(page.getByRole("button", { name: "Render frames" })).toHaveCount(0);
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("button", { name: "Resume frames" })).toBeVisible();
  await page.getByRole("button", { name: "Resume frames" }).click();
  await expect(preview.getByText(/Symbol \d+ · rendering · no fixed total/)).not.toHaveText(
    firstFrameText ?? "",
  );
  await expect(page.locator(".sender-frame-target").first()).toHaveAttribute(
    "data-fullscreen-margin",
    "false",
  );
  await page.getByRole("checkbox", { name: "Fullscreen margin" }).check();
  await page.getByRole("button", { name: "Show code fullscreen" }).click();
  await expect(page.locator(".sender-frame-target:fullscreen")).toBeVisible();
  await expect(page.locator(".sender-frame-target:fullscreen")).toHaveAttribute(
    "data-fullscreen-margin",
    "true",
  );
  await expect(page.locator(".sender-frame-target:fullscreen canvas")).toBeVisible();
  await expect(page.locator(".sender-frame-target:fullscreen h2")).toHaveCount(0);
  const fullscreenSizing = await page
    .locator(".sender-frame-target:fullscreen canvas")
    .evaluate((canvas: HTMLCanvasElement) => {
      const bounds = canvas.getBoundingClientRect();
      return {
        heightScale: bounds.height / canvas.height,
        widthScale: bounds.width / canvas.width,
      };
    });
  expect(fullscreenSizing.widthScale).toBeGreaterThan(0);
  expect(fullscreenSizing.widthScale).toBe(fullscreenSizing.heightScale);
  if (fullscreenSizing.widthScale >= 1) {
    expect(Number.isInteger(fullscreenSizing.widthScale)).toBe(true);
  }
  await screenshot("fullscreen-sender", false);
  await page.evaluate(() => document.exitFullscreen());
  await expect(page.locator(".sender-frame-target:fullscreen")).toHaveCount(0);
  const canvasSizing = await renderedCanvas.evaluate((canvas) => {
    const rect = canvas.getBoundingClientRect();
    return {
      cssRatio: rect.width / rect.height,
      intrinsicRatio: canvas.width / canvas.height,
      width: rect.width,
    };
  });
  expect(Math.abs(canvasSizing.cssRatio - canvasSizing.intrinsicRatio)).toBeLessThan(0.08);
  expect(canvasSizing.width).toBeGreaterThan(320);
  const frameBeforeMode = await preview
    .getByText(/Symbol \d+ · rendering · no fixed total/)
    .textContent();
  await page.locator('button[data-mode="bu"]').click();
  await expect(page.getByText("BU · 66")).toBeVisible();
  await expect
    .poll(
      async () => {
        const status = await preview
          .getByText(/Symbol \d+ · rendering · no fixed total/)
          .textContent()
          .catch(() => null);
        return status !== null && status !== frameBeforeMode;
      },
      { timeout: 15_000, intervals: [250, 500, 1_000] },
    )
    .toBe(true);
  await expect(page.getByText("Direct envelope").first()).toBeVisible();
  await expect(page.getByText("Bigfile chunks")).toHaveCount(0);

  await page.getByLabel("Choose file to encode").setInputFiles({
    name: "large.bin",
    mimeType: "application/octet-stream",
    buffer: Buffer.alloc(11 * 1024 * 1024, 7),
  });
  await expect(page.getByText("planned").first()).toBeVisible();
  await expect(page.getByText(/Auto bigfile active/)).toBeVisible();
  await expect(page.getByText("Bigfile chunks")).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: "FPS" })).toHaveValue("10");
  await expect(page.getByRole("spinbutton", { name: "Redundancy" })).toHaveValue("3.5");
  await expect(page.getByText("Transfer manifest")).toBeVisible();
  await expect(page.getByText(/Stream 1\/3 · zero-payload metadata envelope/)).toBeVisible();
  const renderManifest = page.getByRole("button", { name: "Render manifest" });
  const pauseEncoder = page.getByRole("button", { name: "Pause" });
  await expect
    .poll(async () => (await renderManifest.count()) + (await pauseEncoder.count()), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0);
  if (!(await pauseEncoder.isVisible().catch(() => false))) {
    await expect(renderManifest).toBeEnabled({ timeout: 10_000 });
    await renderManifest.click({ timeout: 5_000 });
  }
  await expect(preview.getByText(/large.bin · manifest/)).toBeVisible();
  await expect
    .poll(async () => countGreenCimbarPixels(await renderedCanvas.screenshot()), {
      timeout: 15_000,
    })
    .toBeGreaterThan(100);
  await pauseEncoder.click();
  await page.getByRole("button", { name: "Next stream" }).click();
  await expect(page.getByText("large.bin.part-0001-of-0002")).toBeVisible();
  await expect(page.getByText(/Stream 2\/3 · chunk 1\/2/)).toBeVisible();

  await page.getByRole("button", { name: /Advanced encoder configuration/ }).click();
  await page.getByRole("spinbutton", { name: "FPS" }).fill("24");
  await page.getByTitle(/Sender FPS controls animation speed/).click();
  await expect(page.getByText(/Sender FPS/)).toBeVisible();
  await expect(page.getByText(/High FPS can outrun/)).toBeVisible();
  await expectTooltipInsideViewport(page);
  await screenshot("tooltip-fps");
  await page.getByRole("button", { name: "Close parameter detail" }).click();
  await expect(page.getByRole("button", { name: "Close parameter detail" })).toHaveCount(0);

  await page.getByRole("button", { name: "Decode", exact: true }).click();
  await page.getByTitle(/Decode mode selects which optical geometry/).click();
  await expectTooltipInsideViewport(page);
  await screenshot("tooltip-decode-mode");
  await page.getByRole("button", { name: "Close parameter detail" }).click();

  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(page.getByText("scanning", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start camera" })).toHaveCount(0);
  await expect(page.getByLabel("Camera preview")).toBeVisible();
  await expect(page.getByText("No decoded file")).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await screenshot("decode-camera");
});

test("initial layout remains usable", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page).toHaveTitle("project-e");
  await expect(page.getByRole("heading", { name: "project-e" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Balanced/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Render frames" })).toBeDisabled();
  if (testInfo.project.name === "mobile") {
    const tabBounds = await page.locator(".workspace-tabs").evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top };
    });
    const viewport = page.viewportSize();
    expect(tabBounds.left).toBeCloseTo(0, 0);
    expect(tabBounds.right).toBeCloseTo(viewport?.width ?? tabBounds.right, 0);
    expect(tabBounds.bottom).toBeCloseTo(viewport?.height ?? tabBounds.bottom, 0);
  }
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}-initial-layout.png`,
    fullPage: testInfo.project.name !== "mobile",
  });
});
