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
  await page.getByText("可以直接说话").waitFor({ state: "visible", timeout: 30_000 });
  if (await page.getByRole("textbox").count()) throw new Error("Voice-only build still exposes a text composer.");
  if (await page.getByRole("button", { name: "发送消息" }).count()) throw new Error("Voice-only build still exposes a send button.");
  if ((await page.locator(".avatar-stage").getAttribute("data-avatar-action")) !== "idle") {
    throw new Error("Avatar did not settle into the connected idle state.");
  }
  if (runtimeErrors.length) throw new Error(`Browser runtime errors: ${runtimeErrors.join(" | ")}`);

  await page.screenshot({ path: "test-artifacts/realtime-conversation.png", fullPage: true });
  await page.getByRole("button", { name: "结束语音对话" }).click();
  await page.getByRole("button", { name: "和凯说话" }).waitFor({ state: "visible" });
  console.log(`Realtime connection test passed for the voice-only UI using ${health.model}.`);
} finally {
  await browser.close();
}
