import process from "node:process";
import express from "express";
import { createServer as createViteServer } from "vite";
import {
  companionReplyFormat,
  createPersonaInstructions,
  normalizeConversationContext,
  normalizePersona,
  parseCompanionReply,
} from "./server/companionPersona.mjs";

try {
  process.loadEnvFile?.(".env.local");
} catch {
  // The app can still start and report a useful configuration error in the UI.
}

const app = express();
const port = Number(process.env.PORT ?? 5173);
const host = process.env.HOST ?? "0.0.0.0";
const realtimeModel = process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime-2.1-mini";
const textModel = process.env.OPENAI_TEXT_MODEL ?? "gpt-5-mini";
const cartesiaModel = process.env.CARTESIA_TTS_MODEL ?? "sonic-3.5";
const cartesiaApiVersion = "2026-03-01";

function personaVoice(persona) {
  const customVoiceId = persona === "Kai" ? process.env.OPENAI_KAI_VOICE_ID : process.env.OPENAI_MIRA_VOICE_ID;
  if (customVoiceId?.trim()) return { id: customVoiceId.trim() };
  return persona === "Kai"
    ? process.env.OPENAI_KAI_VOICE ?? "cedar"
    : process.env.OPENAI_MIRA_VOICE ?? "marin";
}

function personaCartesiaVoiceId(persona) {
  return persona === "Kai" ? process.env.CARTESIA_KAI_VOICE_ID : process.env.CARTESIA_MIRA_VOICE_ID;
}

function personaVoiceMode(persona) {
  const openAiVoiceId = persona === "Kai" ? process.env.OPENAI_KAI_VOICE_ID : process.env.OPENAI_MIRA_VOICE_ID;
  if (openAiVoiceId?.trim()) return "openai-custom";
  if (process.env.CARTESIA_API_KEY?.trim() && personaCartesiaVoiceId(persona)?.trim()) return "cartesia";
  return "openai-built-in";
}

function cartesiaEmotion(emotion) {
  if (emotion === "excited") return "excited";
  if (emotion === "thoughtful") return "contemplative";
  if (emotion === "happy") return "content";
  return "calm";
}

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    realtimeConfigured: Boolean(process.env.OPENAI_API_KEY),
    model: realtimeModel,
    voices: {
      kai: personaVoiceMode("Kai"),
      mira: personaVoiceMode("Mira"),
    },
  });
});

app.post("/api/voice/speech", express.json({ limit: "16kb" }), async (request, response) => {
  const persona = normalizePersona(request.body?.persona);
  const apiKey = process.env.CARTESIA_API_KEY?.trim();
  const voiceId = personaCartesiaVoiceId(persona)?.trim();
  const text = typeof request.body?.text === "string" ? request.body.text.trim().slice(0, 2_000) : "";

  if (personaVoiceMode(persona) !== "cartesia" || !apiKey || !voiceId) {
    response.status(503).json({ error: "此角色尚未配置定制声线。", fallback: true });
    return;
  }
  if (!text) {
    response.status(400).json({ error: "缺少需要朗读的文字。" });
    return;
  }

  try {
    const upstream = await fetch("https://api.cartesia.ai/tts/bytes", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Cartesia-Version": cartesiaApiVersion,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model_id: cartesiaModel,
        transcript: text,
        voice: { id: voiceId },
        language: "zh",
        output_format: { container: "mp3", sample_rate: 44_100, bit_rate: 128_000 },
        generation_config: { emotion: cartesiaEmotion(request.body?.emotion) },
      }),
    });

    if (!upstream.ok) {
      const body = await upstream.json().catch(() => ({}));
      const detail = body.message ?? body.error?.message ?? "定制语音暂时无法生成。";
      console.error(`Cartesia speech failed (${upstream.status}): ${detail}`);
      response.status(upstream.status).json({ error: detail, fallback: true });
      return;
    }

    const audio = Buffer.from(await upstream.arrayBuffer());
    response
      .status(200)
      .set({
        "Content-Type": upstream.headers.get("content-type") ?? "audio/mpeg",
        "Cache-Control": "private, no-store",
        "Content-Length": String(audio.byteLength),
      })
      .send(audio);
  } catch (error) {
    console.error("Cartesia speech request failed:", error instanceof Error ? error.message : error);
    response.status(502).json({ error: "暂时无法连接定制语音服务。", fallback: true });
  }
});

app.post("/api/chat", express.json({ limit: "64kb" }), async (request, response) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    response.status(503).json({ error: "此服务器尚未配置 AI 对话。" });
    return;
  }

  const persona = normalizePersona(request.body?.persona);
  const context = normalizeConversationContext(request.body?.context);
  const rawMessages = Array.isArray(request.body?.messages) ? request.body.messages : [];
  const messages = rawMessages
    .filter((message) => message && (message.role === "user" || message.role === "assistant") && typeof message.text === "string")
    .slice(-12)
    .map((message) => ({ role: message.role, content: message.text.slice(0, 4_000) }));

  if (!messages.length || messages.at(-1)?.role !== "user") {
    response.status(400).json({ error: "请先输入一条消息。" });
    return;
  }

  try {
    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: textModel,
        instructions: createPersonaInstructions(persona, { channel: "text", context }),
        input: messages,
        text: { format: companionReplyFormat },
        max_output_tokens: 420,
        reasoning: { effort: "minimal" },
        store: false,
      }),
    });
    const body = await upstream.json();
    if (!upstream.ok) {
      const detail = body.error?.message ?? "AI 暂时无法生成回复。";
      console.error(`Text response failed (${upstream.status}): ${detail}`);
      response.status(upstream.status).json({ error: detail });
      return;
    }

    const outputText = typeof body.output_text === "string"
      ? body.output_text.trim()
      : body.output
          ?.flatMap((item) => item.content ?? [])
          .map((content) => content.text ?? "")
          .join("")
          .trim();
    if (!outputText) {
      response.status(502).json({ error: "AI 回复中没有可显示的文字。" });
      return;
    }
    const reply = parseCompanionReply(outputText);
    response.json({ ...reply, model: textModel });
  } catch (error) {
    console.error("Text response request failed:", error instanceof Error ? error.message : error);
    response.status(502).json({ error: "暂时无法连接 AI 服务。" });
  }
});

app.post(
  "/api/realtime/session",
  express.text({ type: ["application/sdp", "text/plain"], limit: "1mb" }),
  async (request, response) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      response.status(503).json({ error: "此服务器尚未配置实时语音对话。" });
      return;
    }
    if (!request.body || typeof request.body !== "string") {
      response.status(400).json({ error: "缺少 WebRTC 会话请求。" });
      return;
    }

    const persona = normalizePersona(request.query.persona);
    const voiceMode = personaVoiceMode(persona);
    const voice = personaVoice(persona);
    const session = {
      type: "realtime",
      model: realtimeModel,
      output_modalities: voiceMode === "cartesia" ? ["text"] : ["audio"],
      instructions: createPersonaInstructions(persona, { channel: "realtime" }),
      audio: {
        input: {
          transcription: { model: "gpt-4o-mini-transcribe" },
          turn_detection: {
            type: "semantic_vad",
            create_response: true,
            interrupt_response: true,
          },
        },
        ...(voiceMode === "cartesia" ? {} : { output: { voice } }),
      },
    };

    const form = new FormData();
    form.set("sdp", request.body);
    form.set("session", JSON.stringify(session));

    try {
      const upstream = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
      const body = await upstream.text();

      if (!upstream.ok) {
        let detail = "AI 暂时无法创建实时语音会话。";
        try {
          const parsed = JSON.parse(body);
          detail = parsed.error?.message ?? detail;
        } catch {
          // Keep the stable message when the upstream body is not JSON.
        }
        console.error(`Realtime session failed (${upstream.status}): ${detail}`);
        response.status(upstream.status).json({ error: detail });
        return;
      }

      response.status(201).type("application/sdp").send(body);
    } catch (error) {
      console.error("Realtime session request failed:", error instanceof Error ? error.message : error);
      response.status(502).json({ error: "暂时无法连接实时语音服务。" });
    }
  },
);

const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: "spa",
});
app.use(vite.middlewares);

app.listen(port, host, () => {
  console.log(`AI 角色伙伴正在运行：http://localhost:${port}`);
});
