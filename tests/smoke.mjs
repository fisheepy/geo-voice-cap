import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const baseURL = process.env.MVP_URL ?? "http://127.0.0.1:5173";
const executablePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const failures = [];
const scenes = [
  { id: "office", label: "公司 清爽工作室", file: "office.jpg" },
  { id: "gym", label: "健身房 明亮训练空间", file: "gym.jpg" },
  { id: "beach", label: "沙滩 安静海湾", file: "beach.jpg" },
  { id: "nature", label: "自然风光 湖畔林间", file: "nature.jpg" },
  { id: "cafe", label: "咖啡馆 午后咖啡馆", file: "cafe.jpg" },
];

function check(condition, message) {
  if (!condition) failures.push(message);
}

await mkdir("test-artifacts", { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });

for (const profile of [
  { name: "desktop", viewport: { width: 1440, height: 900 } },
  { name: "mobile", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
]) {
  const context = await browser.newContext({
    viewport: profile.viewport,
    isMobile: profile.isMobile,
    hasTouch: profile.hasTouch,
  });
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });

  await page.goto(baseURL, { waitUntil: "networkidle" });
  await page.waitForSelector("canvas");
  await page.locator(".avatar-loading").waitFor({ state: "hidden", timeout: 30_000 });
  await page.waitForTimeout(2200);

  check(await page.getByRole("heading", { name: "凯", exact: true }).isVisible(), `${profile.name}: companion heading is not visible`);
  check(await page.locator(".avatar-stage").getAttribute("data-scene") === "cafe", `${profile.name}: cafe is not the default scene`);
  check(await page.getByRole("textbox").count() === 0, `${profile.name}: a text composer is still present`);
  for (const removedLabel of ["挥手", "点头", "庆祝", "发送消息"]) {
    check(await page.getByRole("button", { name: removedLabel, exact: true }).count() === 0, `${profile.name}: removed control ${removedLabel} is still present`);
  }

  const canvasBox = await page.locator("canvas").boundingBox();
  check(Boolean(canvasBox && canvasBox.width > 250 && canvasBox.height > 300), `${profile.name}: canvas has invalid dimensions`);
  const renderedFrameLength = await page.locator("canvas").evaluate((canvas) => canvas.toDataURL("image/png").length);
  const minimumFrameLength = canvasBox ? canvasBox.width * canvasBox.height * 0.02 : 10_000;
  check(renderedFrameLength > minimumFrameLength, `${profile.name}: WebGL canvas rendered a blank frame (${renderedFrameLength} bytes)`);

  for (const scene of scenes) {
    await page.getByRole("button", { name: /^选择场景/ }).click();
    await page.getByRole("heading", { name: "选择相处的地方" }).waitFor({ state: "visible" });
    const option = page.getByRole("button", { name: scene.label, exact: true });
    const imageReady = await option.locator("img").evaluate((image) => image.complete && image.naturalWidth >= 1000 && image.naturalHeight >= 600);
    check(imageReady, `${profile.name}: ${scene.id} scene image did not load at full resolution`);
    await option.click();
    await page.locator(`.avatar-stage[data-scene="${scene.id}"]`).waitFor({ state: "visible" });
    const backgroundImage = await page.locator(".scene-background").evaluate((element) => getComputedStyle(element).backgroundImage);
    check(backgroundImage.includes(scene.file), `${profile.name}: ${scene.id} scene was not applied`);
    check(await page.evaluate(() => localStorage.getItem("mira-background-scene")) === scene.id, `${profile.name}: ${scene.id} was not persisted`);
  }

  await page.getByRole("button", { name: "打开语音记录" }).click();
  await page.getByRole("heading", { name: "凯和你" }).waitFor({ state: "visible" });
  check(await page.getByRole("textbox").count() === 0, `${profile.name}: transcript drawer contains a textbox`);
  await page.getByRole("button", { name: "关闭语音记录" }).click();

  await page.getByRole("button", { name: "选择角色" }).click();
  await page.getByRole("heading", { name: "选择陪伴角色" }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: /城市通勤 海军蓝与雾蓝/ }).click();
  await page.locator(".avatar-loading").waitFor({ state: "hidden", timeout: 30_000 });
  check(await page.getByRole("button", { name: /城市通勤 海军蓝与雾蓝/ }).getAttribute("aria-pressed") === "true", `${profile.name}: outfit selection failed`);
  await page.getByRole("button", { name: "关闭角色库" }).click();
  await page.waitForTimeout(3200);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 1, `${profile.name}: page overflows horizontally by ${overflow}px`);
  await page.screenshot({ path: `test-artifacts/${profile.name}-voice-scenes.png`, fullPage: true });
  await page.getByRole("button", { name: /^选择场景/ }).click();
  await page.getByRole("heading", { name: "选择相处的地方" }).waitFor({ state: "visible" });
  await page.screenshot({ path: `test-artifacts/${profile.name}-scene-picker.png`, fullPage: true });
  check(runtimeErrors.length === 0, `${profile.name}: runtime errors: ${runtimeErrors.join(" | ")}`);
  await context.close();
}

const blockedMicContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
const blockedMicPage = await blockedMicContext.newPage();
await blockedMicPage.goto(baseURL, { waitUntil: "networkidle" });
await blockedMicPage.locator(".avatar-loading").waitFor({ state: "hidden", timeout: 30_000 });
await blockedMicPage.getByRole("button", { name: "和凯说话" }).click();
await blockedMicPage.locator(".speech-notice").waitFor({ state: "visible", timeout: 5000 });
check((await blockedMicPage.locator(".speech-notice").textContent())?.includes("麦克风"), "microphone: actionable permission error was not shown on the main stage");
await blockedMicContext.close();

await browser.close();

if (failures.length) {
  console.error(`Smoke test failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log("Smoke test passed: voice-only UI, five persistent scenes, nonblank avatar, outfit switching, responsive layout, and microphone errors.");
