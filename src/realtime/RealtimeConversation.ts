export type RealtimePhase = "disconnected" | "connecting" | "connected" | "listening" | "thinking" | "speaking";

type RealtimeEvent = {
  type?: string;
  transcript?: string;
  text?: string;
  delta?: string;
  response_id?: string;
  response?: {
    id?: string;
    status?: string;
    output?: Array<{
      role?: string;
      content?: Array<{ type?: string; transcript?: string; text?: string }>;
    }>;
  };
  item?: {
    role?: string;
    content?: Array<{ type?: string; transcript?: string; text?: string }>;
  };
  error?: { message?: string };
};

type Callbacks = {
  onPhase: (phase: RealtimePhase) => void;
  onUserTranscript: (text: string) => void;
  onAssistantTranscript: (text: string) => void;
  onError: (message: string) => void;
};

function itemText(item?: RealtimeEvent["item"]): string {
  return item?.content?.map((part) => part.transcript ?? part.text ?? "").join("").trim() ?? "";
}

function responseText(event: RealtimeEvent): string {
  return event.response?.output
    ?.flatMap((item) => item.content ?? [])
    .map((part) => part.transcript ?? part.text ?? "")
    .join("")
    .trim() ?? "";
}

export class RealtimeConversation {
  private readonly callbacks: Callbacks;
  private peer?: RTCPeerConnection;
  private channel?: RTCDataChannel;
  private microphone?: MediaStream;
  private audio?: HTMLAudioElement;
  private closed = false;
  private transcriptBuffer = "";
  private lastAssistantTranscript = "";
  private lastUserTranscript = "";
  private externalSpeech = false;

  constructor(callbacks: Callbacks) {
    this.callbacks = callbacks;
  }

  async connect(persona: string, muted: boolean, externalSpeech = false): Promise<void> {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("麦克风需要 HTTPS 或 localhost。请通过 localhost 打开演示，或使用安全的移动端构建。");
    }

    this.closed = false;
    this.externalSpeech = externalSpeech;
    this.callbacks.onPhase("connecting");
    try {
      const peer = new RTCPeerConnection();
      this.peer = peer;

      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.setAttribute("playsinline", "");
      audio.muted = muted || externalSpeech;
      audio.hidden = true;
      document.body.appendChild(audio);
      this.audio = audio;

      peer.ontrack = (event) => {
        audio.srcObject = event.streams[0];
        void audio.play().catch(() => undefined);
      };
      peer.onconnectionstatechange = () => {
        if (this.closed) return;
        if (peer.connectionState === "connected") this.callbacks.onPhase("connected");
        if (peer.connectionState === "failed" || peer.connectionState === "disconnected") {
          this.callbacks.onError("实时语音连接已中断。");
          this.disconnect();
        }
      };

      const microphone = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      this.microphone = microphone;
      microphone.getTracks().forEach((track) => peer.addTrack(track, microphone));

      const channel = peer.createDataChannel("oai-events");
      this.channel = channel;
      channel.addEventListener("message", (message) => this.handleEvent(message));
      channel.addEventListener("close", () => {
        if (!this.closed) this.callbacks.onPhase("disconnected");
      });

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const sessionResponse = await fetch(`/api/realtime/session?persona=${encodeURIComponent(persona)}`, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: offer.sdp,
      });
      if (!sessionResponse.ok) {
        let message = "无法启动实时 AI 会话。";
        try {
          const detail = await sessionResponse.json();
          message = detail.error ?? message;
        } catch {
          // Keep the stable message when the server does not return JSON.
        }
        throw new Error(message);
      }

      await peer.setRemoteDescription({ type: "answer", sdp: await sessionResponse.text() });
      await new Promise<void>((resolve, reject) => {
        if (channel.readyState === "open") {
          resolve();
          return;
        }
        const timeout = window.setTimeout(() => reject(new Error("实时语音连接超时。")), 15_000);
        channel.addEventListener("open", () => {
          window.clearTimeout(timeout);
          resolve();
        }, { once: true });
      });
      this.callbacks.onPhase("connected");
    } catch (error) {
      this.disconnect();
      throw error;
    }
  }

  sendText(text: string): boolean {
    if (this.channel?.readyState !== "open") return false;
    this.channel.send(JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text }],
      },
    }));
    this.channel.send(JSON.stringify({ type: "response.create" }));
    this.callbacks.onPhase("thinking");
    return true;
  }

  setMuted(muted: boolean): void {
    if (this.audio) this.audio.muted = muted;
  }

  disconnect(): void {
    this.closed = true;
    this.microphone?.getTracks().forEach((track) => track.stop());
    this.channel?.close();
    this.peer?.close();
    if (this.audio) {
      this.audio.pause();
      this.audio.srcObject = null;
      this.audio.remove();
    }
    this.microphone = undefined;
    this.channel = undefined;
    this.peer = undefined;
    this.audio = undefined;
    this.transcriptBuffer = "";
    this.externalSpeech = false;
    this.callbacks.onPhase("disconnected");
  }

  private handleEvent(message: MessageEvent<string>): void {
    let event: RealtimeEvent;
    try {
      event = JSON.parse(message.data) as RealtimeEvent;
    } catch {
      return;
    }
    const type = event.type ?? "";

    if (type === "input_audio_buffer.speech_started") {
      this.callbacks.onPhase("listening");
      return;
    }
    if (type === "input_audio_buffer.speech_stopped" || type === "response.created") {
      this.callbacks.onPhase("thinking");
      return;
    }

    if (type.includes("input_audio_transcription") && (type.endsWith(".completed") || type.endsWith(".done"))) {
      this.emitUserTranscript(event.transcript ?? itemText(event.item));
      return;
    }
    if (
      type === "conversation.item.done" &&
      event.item?.role === "user" &&
      event.item.content?.some((part) => part.type?.includes("audio"))
    ) {
      this.emitUserTranscript(itemText(event.item));
      return;
    }

    if (type === "response.output_audio_transcript.delta") {
      this.transcriptBuffer += event.delta ?? "";
      if (this.transcriptBuffer) this.callbacks.onPhase("speaking");
      return;
    }
    if (type === "response.output_audio_transcript.done") {
      this.emitAssistantTranscript(event.transcript ?? this.transcriptBuffer);
      this.transcriptBuffer = "";
      return;
    }
    if (type === "response.output_text.delta") {
      this.transcriptBuffer += event.delta ?? "";
      return;
    }
    if (type === "response.output_text.done") {
      this.emitAssistantTranscript(event.text ?? event.transcript ?? this.transcriptBuffer);
      this.transcriptBuffer = "";
      return;
    }
    if (type === "response.done") {
      const text = responseText(event) || this.transcriptBuffer;
      this.emitAssistantTranscript(text);
      this.transcriptBuffer = "";
      if (!this.externalSpeech) {
        window.setTimeout(() => {
          if (!this.closed) this.callbacks.onPhase("connected");
        }, 700);
      }
      return;
    }
    if (type === "error") {
      this.callbacks.onError(event.error?.message ?? "实时 AI 会话发生错误。");
    }
  }

  private emitUserTranscript(text: string): void {
    const clean = text.trim();
    if (!clean || clean === this.lastUserTranscript) return;
    this.lastUserTranscript = clean;
    this.callbacks.onUserTranscript(clean);
  }

  private emitAssistantTranscript(text: string): void {
    const clean = text.trim();
    if (!clean || clean === this.lastAssistantTranscript) return;
    this.lastAssistantTranscript = clean;
    this.callbacks.onAssistantTranscript(clean);
  }
}
