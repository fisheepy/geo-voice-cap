import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const baseURL = process.env.MVP_URL ?? "http://127.0.0.1:5173";
const executablePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

const health = await fetch(`${baseURL}/api/health`).then((response) => response.json());
if (!health.realtimeConfigured) {
  throw new Error("Realtime is not configured. Add OPENAI_API_KEY to .env.local before running this test.");
}

await mkdir("test-artifacts", { recursive: true });
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  permissions: ["microphone"],
});
const page = await context.newPage();
const runtimeErrors = [];
page.on("pageerror", (error) => runtimeErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") runtimeErrors.push(message.text());
});

try {
  await page.goto(baseURL, { waitUntil: "networkidle" });
  await page.locator(".avatar-loading").waitFor({ state: "hidden", timeout: 30_000 });
  await page.getByRole("button", { name: "和凯说话" }).click();
  await page.getByRole("button", { name: "结束语音对话" }).waitFor({ state: "visible", timeout: 30_000 });

  const assistantCount = await page.locator(".message.mira:not(.pending)").count();
  const speechResponsePromise = health.voices?.kai === "cartesia"
    ? page.waitForResponse((response) => response.url().includes("/api/voice/speech"), { timeout: 45_000 })
    : null;
  await page.getByRole("textbox", { name: "给凯发消息" }).fill("请用一句简短的中文确认实时语音连接正常。");
  await page.getByRole("button", { name: "发送消息" }).click();
  await page.waitForFunction(
    (count) => document.querySelectorAll(".message.mira:not(.pending)").length > count,
    assistantCount,
    { timeout: 45_000 },
  );

  const transcript = (await page.locator(".message.mira:not(.pending) p").last().textContent())?.trim() ?? "";
  const userMessages = await page.locator(".message.user").count();
  if (transcript.length < 4) {
    throw new Error(`Realtime transcript was missing or incomplete: ${JSON.stringify(transcript)}`);
  }
  if (!/[\u4e00-\u9fff]/.test(transcript)) throw new Error(`Realtime response was not Chinese: ${transcript}`);
  if (userMessages !== 1) throw new Error(`Expected one user message, found ${userMessages}.`);
  if (speechResponsePromise) {
    const speechResponse = await speechResponsePromise;
    if (speechResponse.status() !== 200) throw new Error(`Custom speech failed with HTTP ${speechResponse.status()}.`);
    await page.getByText("正在回应...").waitFor({ state: "visible", timeout: 15_000 });
  }
  if (runtimeErrors.length) throw new Error(`Browser runtime errors: ${runtimeErrors.join(" | ")}`);

  await page.screenshot({ path: "test-artifacts/realtime-conversation.png", fullPage: true });
  await page.getByRole("button", { name: "结束语音对话" }).click();
  await page.getByRole("button", { name: "和凯说话" }).waitFor({ state: "visible" });
  console.log(`Realtime test passed with ${transcript.length} transcript characters using ${health.model}.`);
} finally {
  await browser.close();
}
