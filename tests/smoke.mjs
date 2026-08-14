import { chromium } from "playwright";
import { access, mkdir } from "node:fs/promises";

const baseURL = process.env.MVP_URL ?? "http://127.0.0.1:5173";
const executablePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

await mkdir("test-artifacts", { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });

for (const profile of [
  { name: "desktop", viewport: { width: 1440, height: 900 } },
  { name: "mobile", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
]) {
  const context = await browser.newContext({ viewport: profile.viewport, isMobile: profile.isMobile, hasTouch: profile.hasTouch });
  await context.route("**/api/chat", async (route) => {
    const body = route.request().postDataJSON();
    const prompt = body.messages?.at(-1)?.text ?? "";
    const text = prompt.includes("专注")
      ? "先做一个二十五分钟的专注冲刺。只把眼前这一件事放在面前，暂时关掉其他干扰，结束后我会在这里等你。"
      : "你好，很高兴见到你。我已经准备好倾听，也可以陪你一起想清楚接下来要做的事。";
    check(body.context?.locale, `${profile.name}: conversation locale was not sent`);
    check(body.context?.timeZone, `${profile.name}: conversation time zone was not sent`);
    await new Promise((resolve) => setTimeout(resolve, 350));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ text, emotion: prompt.includes("专注") ? "thoughtful" : "happy", action: "nod", model: "smoke-test" }),
    });
  });
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") runtimeErrors.push(message.text()); });

  await page.goto(baseURL, { waitUntil: "networkidle" });
  await page.waitForSelector("canvas");
  await page.locator(".avatar-loading").waitFor({ state: "hidden", timeout: 30_000 });
  await page.waitForTimeout(4200);

  check(await page.getByRole("heading", { name: "凯", exact: true }).isVisible(), `${profile.name}: brand heading is not visible`);
  check(await page.locator("canvas").isVisible(), `${profile.name}: WebGL canvas is not visible`);
  const canvasBox = await page.locator("canvas").boundingBox();
  check(Boolean(canvasBox && canvasBox.width > 250 && canvasBox.height > 300), `${profile.name}: canvas has invalid dimensions`);
  const renderedFrameLength = await page.locator("canvas").evaluate((canvas) => canvas.toDataURL("image/png").length);
  const minimumFrameLength = canvasBox ? canvasBox.width * canvasBox.height * 0.02 : 10_000;
  check(renderedFrameLength > minimumFrameLength, `${profile.name}: WebGL canvas rendered a blank or incomplete frame (${renderedFrameLength} bytes)`);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 1, `${profile.name}: page overflows horizontally by ${overflow}px`);
  await page.screenshot({ path: `test-artifacts/${profile.name}-kai-stage.png`, fullPage: true });

  await page.getByRole("button", { name: "选择角色" }).click();
  await page.getByRole("heading", { name: "选择陪伴角色" }).waitFor({ state: "visible" });
  check(await page.locator(".avatar-current h3").getByText("凯", { exact: true }).isVisible(), `${profile.name}: current avatar state is not visible`);
  await page.getByRole("button", { name: /米拉 温暖、敏锐、有表现力/ }).click();
  await page.locator(".brand-lockup h1").getByText("米拉", { exact: true }).waitFor({ state: "visible" });
  await page.locator(".avatar-loading").waitFor({ state: "hidden", timeout: 30_000 });
  await page.waitForTimeout(3200);
  check((await page.locator(".brand-lockup h1").textContent())?.trim() === "米拉", `${profile.name}: Mira did not become the active companion`);
  const miraCanvasBox = await page.locator("canvas").boundingBox();
  const miraFrameLength = await page.locator("canvas").evaluate((canvas) => canvas.toDataURL("image/png").length);
  const miraMinimumLength = miraCanvasBox ? miraCanvasBox.width * miraCanvasBox.height * 0.02 : 10_000;
  check(miraFrameLength > miraMinimumLength, `${profile.name}: Mira rendered a blank or incomplete frame (${miraFrameLength} bytes)`);
  await page.getByRole("button", { name: "关闭角色库" }).click();
  await page.waitForTimeout(350);
  await page.screenshot({ path: `test-artifacts/${profile.name}-mira-stage.png`, fullPage: true });

  await page.getByRole("button", { name: "选择角色" }).click();
  await page.getByRole("button", { name: /凯 温柔、清爽、沉稳/ }).click();
  await page.locator(".brand-lockup h1").getByText("凯", { exact: true }).waitFor({ state: "visible" });
  await page.locator(".avatar-loading").waitFor({ state: "hidden", timeout: 30_000 });
  check((await page.locator(".brand-lockup h1").textContent())?.trim() === "凯", `${profile.name}: Kai did not restore after comparison`);
  const outfitGridOverflow = await page.locator(".outfit-grid").evaluate((element) => element.scrollWidth - element.clientWidth);
  check(outfitGridOverflow <= 1, `${profile.name}: outfit selector overflows by ${outfitGridOverflow}px`);
  await page.getByRole("button", { name: /城市通勤 海军蓝与雾蓝/ }).click();
  await page.locator(".avatar-loading").waitFor({ state: "hidden", timeout: 30_000 });
  check(await page.getByRole("button", { name: /城市通勤 海军蓝与雾蓝/ }).getAttribute("aria-pressed") === "true", `${profile.name}: smart outfit was not selected`);
  await page.getByRole("button", { name: /周末休闲 鼠尾草绿与斜挎包/ }).click();
  await page.locator(".avatar-loading").waitFor({ state: "hidden", timeout: 30_000 });
  await page.waitForTimeout(900);
  check(await page.getByRole("button", { name: /周末休闲 鼠尾草绿与斜挎包/ }).getAttribute("aria-pressed") === "true", `${profile.name}: weekend outfit was not selected`);
  check(await page.evaluate(() => localStorage.getItem("kai-outfit")) === "weekend", `${profile.name}: outfit selection was not persisted`);
  const outfitFrameLength = await page.locator("canvas").evaluate((canvas) => canvas.toDataURL("image/png").length);
  check(outfitFrameLength > minimumFrameLength, `${profile.name}: selected outfit rendered a blank frame (${outfitFrameLength} bytes)`);
  await page.locator('.avatar-import-button input[type="file"]').setInputFiles({
    name: "invalid.vrm",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("not a vrm"),
  });
  await page.getByText("这个 VRM 文件不完整。", { exact: true }).waitFor({ state: "visible" });
  await page.waitForTimeout(350);
  await page.screenshot({ path: `test-artifacts/${profile.name}-avatar-library.png`, fullPage: true });
  await page.getByRole("button", { name: "关闭角色库" }).click();

  await page.getByRole("button", { name: "挥手" }).click();
  await page.getByRole("button", { name: "庆祝" }).click();
  await page.getByRole("button", { name: "打开对话" }).click();
  await page.getByRole("heading", { name: "和凯聊天" }).waitFor({ state: "visible" });

  await page.getByRole("button", { name: "帮我专注下来" }).click();
  await page.getByText("凯正在思考", { exact: true }).waitFor({ state: "visible" });
  await page.getByText(/二十五分钟的专注冲刺/).first().waitFor({ state: "visible", timeout: 5000 });

  const composer = page.getByRole("textbox", { name: "给凯发消息" });
  await composer.fill("你好，凯");
  await page.getByRole("button", { name: "发送消息" }).click();
  await page.getByText(/很高兴见到你/).first().waitFor({ state: "visible", timeout: 5000 });

  await page.screenshot({ path: `test-artifacts/${profile.name}.png`, fullPage: true });
  check(runtimeErrors.length === 0, `${profile.name}: runtime errors: ${runtimeErrors.join(" | ")}`);
  await context.close();
}

const blockedMicContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
const blockedMicPage = await blockedMicContext.newPage();
await blockedMicPage.goto(baseURL, { waitUntil: "networkidle" });
await blockedMicPage.getByRole("button", { name: "和凯说话" }).click();
await blockedMicPage.locator(".speech-notice").waitFor({ state: "visible", timeout: 5000 });
check((await blockedMicPage.locator(".speech-notice").textContent())?.includes("麦克风"), "microphone: actionable error notice was not shown");
await blockedMicContext.close();

const vrmFixture = "C:\\local\\geo-voice-cap\\avatar-lab\\mira-semi-realistic-v01.vrm";
try {
  await access(vrmFixture);
  const vrmContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const vrmPage = await vrmContext.newPage();
  const vrmErrors = [];
  vrmPage.on("pageerror", (error) => vrmErrors.push(error.message));
  vrmPage.on("console", (message) => { if (message.type() === "error") vrmErrors.push(message.text()); });
  await vrmPage.goto(baseURL, { waitUntil: "networkidle" });
  await vrmPage.getByRole("button", { name: "选择角色" }).click();
  await vrmPage.locator('.avatar-import-button input[type="file"]').setInputFiles(vrmFixture);
  await vrmPage.locator(".avatar-notice.success").waitFor({ state: "visible", timeout: 15000 });
  await vrmPage.locator(".avatar-loading").waitFor({ state: "hidden", timeout: 30_000 });
  const importedName = (await vrmPage.locator(".avatar-current h3").textContent())?.trim();
  check(Boolean(importedName && importedName !== "凯"), "avatar: valid VRM did not become active");
  await vrmPage.waitForTimeout(2500);
  await vrmPage.getByRole("button", { name: "关闭角色库" }).click();
  await vrmPage.getByRole("button", { name: "挥手" }).click();
  const importedCanvasBox = await vrmPage.locator("canvas").boundingBox();
  const importedFrameLength = await vrmPage.locator("canvas").evaluate((canvas) => canvas.toDataURL("image/png").length);
  const importedMinimumLength = importedCanvasBox ? importedCanvasBox.width * importedCanvasBox.height * 0.02 : 10_000;
  check(importedFrameLength > importedMinimumLength, `avatar: imported VRM rendered a blank frame (${importedFrameLength} bytes)`);
  await vrmPage.screenshot({ path: "test-artifacts/vrm-avatar.png", fullPage: true });

  await vrmPage.reload({ waitUntil: "networkidle" });
  await vrmPage.waitForTimeout(2500);
  await vrmPage.getByRole("button", { name: "选择角色" }).click();
  await vrmPage.locator(".avatar-current h3").filter({ hasText: importedName }).waitFor({ state: "visible" });
  await vrmPage.getByRole("button", { name: "恢复所选角色" }).click();
  await vrmPage.getByText("凯已准备好。", { exact: true }).waitFor({ state: "visible" });
  await vrmPage.locator(".avatar-loading").waitFor({ state: "hidden", timeout: 30_000 });
  await vrmPage.waitForTimeout(450);
  check(await vrmPage.locator(".avatar-current h3").getByText("凯", { exact: true }).isVisible(), "avatar: bundled VRM did not restore after a custom import");
  await vrmPage.getByRole("button", { name: "关闭角色库" }).click();
  await vrmPage.setViewportSize({ width: 390, height: 844 });
  await vrmPage.reload({ waitUntil: "networkidle" });
  await vrmPage.waitForTimeout(2500);
  await vrmPage.screenshot({ path: "test-artifacts/vrm-avatar-mobile.png", fullPage: true });
  const vrmOverflow = await vrmPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(vrmOverflow <= 1, `avatar mobile: page overflows horizontally by ${vrmOverflow}px`);
  check(vrmErrors.length === 0, `avatar: runtime errors: ${vrmErrors.join(" | ")}`);
  await vrmContext.close();
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
  console.warn("VRM fixture missing; real-model import test skipped.");
}

await browser.close();

if (failures.length) {
  console.error(`Smoke test failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log("Smoke test passed: desktop/mobile rendering, Kai outfit switching, avatar import validation, layout, actions, conversation, local replies, and microphone error handling.");
