import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  AlertCircle,
  CheckCircle2,
  History,
  MapPin,
  Mic,
  MicOff,
  RotateCcw,
  Sparkles,
  Upload,
  UserRoundCog,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { AvatarScene } from "./avatar/AvatarScene";
import { formatAvatarSize, loadAvatar, removeAvatar, saveAvatar, validateVrmFile } from "./avatar/avatarStorage";
import type { StoredAvatar } from "./avatar/avatarStorage";
import { deriveAvatarReaction } from "./avatar/reactions";
import type { AvatarAction, AvatarCommand, AvatarEmotion } from "./avatar/types";
import { RealtimeConversation } from "./realtime/RealtimeConversation";
import type { RealtimePhase } from "./realtime/RealtimeConversation";
import "./App.css";

type Speaker = "mira" | "user";
type Message = { id: number; speaker: Speaker; text: string };
type BundledAvatarId = "mira" | "kai";
type KaiOutfitId = "everyday" | "smart" | "weekend";
type VoiceMode = "openai-built-in" | "openai-custom" | "cartesia";
type VoiceModes = Record<BundledAvatarId, VoiceMode>;
type SceneId = "office" | "gym" | "beach" | "nature" | "cafe";
type BundledAvatar = {
  id: BundledAvatarId;
  name: string;
  url: string;
  preview: string;
  size: number;
  specification: "VRM 0.x" | "VRM 1.0";
  description: string;
};
type KaiOutfit = {
  id: KaiOutfitId;
  name: string;
  description: string;
  url: string;
  preview: string;
  size: number;
  colors: string[];
};
type SceneOption = {
  id: SceneId;
  name: string;
  description: string;
  image: string;
  position: string;
};

const BUNDLED_AVATAR_STORAGE_KEY = "mira-bundled-avatar";
const KAI_OUTFIT_STORAGE_KEY = "kai-outfit";
const SCENE_STORAGE_KEY = "mira-background-scene";
const DEFAULT_VOICE_MODES: VoiceModes = { kai: "openai-built-in", mira: "openai-built-in" };
const BUNDLED_AVATARS: Record<BundledAvatarId, BundledAvatar> = {
  mira: {
    id: "mira",
    name: "米拉",
    url: "/avatar/mira.vrm",
    preview: "/avatar/mira-preview.png",
    size: 13_445_912,
    specification: "VRM 1.0",
    description: "温暖、敏锐、有表现力",
  },
  kai: {
    id: "kai",
    name: "凯",
    url: "/avatar/kai.vrm",
    preview: "/avatar/kai-preview.png",
    size: 12_426_972,
    specification: "VRM 0.x",
    description: "温柔、清爽、沉稳",
  },
};
const KAI_OUTFITS: Record<KaiOutfitId, KaiOutfit> = {
  everyday: {
    id: "everyday",
    name: "日常清爽",
    description: "深青夹克",
    url: "/avatar/kai.vrm",
    preview: "/avatar/kai-preview.png",
    size: 12_426_972,
    colors: ["#0b4248", "#e3dac8", "#17191b"],
  },
  smart: {
    id: "smart",
    name: "城市通勤",
    description: "海军蓝与雾蓝",
    url: "/avatar/kai-smart.vrm",
    preview: "/avatar/kai-smart-preview.png",
    size: 12_043_368,
    colors: ["#17253a", "#b5d4dc", "#30363b"],
  },
  weekend: {
    id: "weekend",
    name: "周末休闲",
    description: "鼠尾草绿与斜挎包",
    url: "/avatar/kai-weekend.vrm",
    preview: "/avatar/kai-weekend-preview.png",
    size: 12_226_032,
    colors: ["#48675a", "#d7c4a3", "#4a2d1d"],
  },
};
const SCENES: Record<SceneId, SceneOption> = {
  office: { id: "office", name: "公司", description: "清爽工作室", image: "/scenes/office.jpg", position: "center center" },
  gym: { id: "gym", name: "健身房", description: "明亮训练空间", image: "/scenes/gym.jpg", position: "center center" },
  beach: { id: "beach", name: "沙滩", description: "安静海湾", image: "/scenes/beach.jpg", position: "center center" },
  nature: { id: "nature", name: "自然风光", description: "湖畔林间", image: "/scenes/nature.jpg", position: "center center" },
  cafe: { id: "cafe", name: "咖啡馆", description: "午后咖啡馆", image: "/scenes/cafe.jpg", position: "center center" },
};

function readBundledAvatarId(): BundledAvatarId {
  return localStorage.getItem(BUNDLED_AVATAR_STORAGE_KEY) === "mira" ? "mira" : "kai";
}

function readKaiOutfitId(): KaiOutfitId {
  const stored = localStorage.getItem(KAI_OUTFIT_STORAGE_KEY);
  return stored === "smart" || stored === "weekend" ? stored : "everyday";
}

function readSceneId(): SceneId {
  const stored = localStorage.getItem(SCENE_STORAGE_KEY);
  return stored === "office" || stored === "gym" || stored === "beach" || stored === "nature" ? stored : "cafe";
}

function createInitialMessages(name: string): Message[] {
  return [{ id: 1, speaker: "mira", text: `你好，我是${name}。今天想和我聊些什么？` }];
}

async function loadVoiceModes(): Promise<VoiceModes> {
  const response = await fetch("/api/health");
  if (!response.ok) return DEFAULT_VOICE_MODES;
  const body = await response.json();
  const mode = (value: unknown): VoiceMode => value === "openai-custom" || value === "cartesia" ? value : "openai-built-in";
  return { kai: mode(body.voices?.kai), mira: mode(body.voices?.mira) };
}

export default function App() {
  const [bundledAvatarId, setBundledAvatarId] = useState<BundledAvatarId>(readBundledAvatarId);
  const [kaiOutfitId, setKaiOutfitId] = useState<KaiOutfitId>(readKaiOutfitId);
  const selectedKaiOutfit = KAI_OUTFITS[kaiOutfitId];
  const baseBundledAvatar = BUNDLED_AVATARS[bundledAvatarId];
  const bundledAvatar = bundledAvatarId === "kai"
    ? {
        ...baseBundledAvatar,
        url: selectedKaiOutfit.url,
        preview: selectedKaiOutfit.preview,
        size: selectedKaiOutfit.size,
      }
    : baseBundledAvatar;
  const [sceneId, setSceneId] = useState<SceneId>(readSceneId);
  const selectedScene = SCENES[sceneId];
  const [command, setCommand] = useState<AvatarCommand>({ action: "wave", emotion: "happy", speaking: false, nonce: 1 });
  const [messages, setMessages] = useState<Message[]>(() => createInitialMessages(BUNDLED_AVATARS[readBundledAvatarId()].name));
  const [isThinking, setIsThinking] = useState(false);
  const [realtimePhase, setRealtimePhase] = useState<RealtimePhase>("disconnected");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [conversationOpen, setConversationOpen] = useState(false);
  const [avatarPanelOpen, setAvatarPanelOpen] = useState(false);
  const [scenePanelOpen, setScenePanelOpen] = useState(false);
  const [avatarRecord, setAvatarRecord] = useState<StoredAvatar | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>();
  const [avatarNotice, setAvatarNotice] = useState("");
  const [avatarNoticeKind, setAvatarNoticeKind] = useState<"success" | "error">("success");
  const [isImportingAvatar, setIsImportingAvatar] = useState(false);
  const [avatarReady, setAvatarReady] = useState(false);
  const [speechNotice, setSpeechNotice] = useState("");
  const [voiceModes, setVoiceModes] = useState<VoiceModes>(DEFAULT_VOICE_MODES);
  const realtimeRef = useRef<RealtimeConversation | null>(null);
  const customAudioRef = useRef<HTMLAudioElement | null>(null);
  const customAudioUrlRef = useRef<string | null>(null);
  const speechRequestRef = useRef(0);
  const timersRef = useRef<number[]>([]);
  const messageIdRef = useRef(2);
  const avatarUrlRef = useRef<string | undefined>(undefined);

  const personaName = avatarRecord?.name ?? bundledAvatar.name;
  const isVoiceActive = realtimePhase !== "disconnected";
  const externalVoiceEnabled = voiceModes[bundledAvatarId] === "cartesia";
  const voiceStatusLabel: Record<RealtimePhase, string> = {
    disconnected: "点击开始对话",
    connecting: "正在连接...",
    connected: "可以直接说话",
    listening: "正在听...",
    thinking: "正在思考...",
    speaking: "正在回应...",
  };
  const latestAssistantMessage = [...messages].reverse().find((message) => message.speaker === "mira")?.text ?? "";
  const handleAvatarReady = useCallback(() => setAvatarReady(true), []);

  const stageStyle = {
    "--scene-image": `url(${selectedScene.image})`,
    "--scene-position": selectedScene.position,
  } as CSSProperties;

  useEffect(() => {
    let active = true;
    loadAvatar()
      .then((stored) => {
        if (!active || !stored) return;
        const url = URL.createObjectURL(stored.blob);
        avatarUrlRef.current = url;
        setAvatarUrl(url);
        setAvatarRecord(stored);
        setMessages(createInitialMessages(stored.name));
        messageIdRef.current = 2;
      })
      .catch(() => {
        if (!active) return;
        setAvatarNoticeKind("error");
        setAvatarNotice("无法恢复已保存的角色，当前已使用内置角色。");
      });
    loadVoiceModes()
      .then((modes) => {
        if (active) setVoiceModes(modes);
      })
      .catch(() => undefined);
    for (const scene of Object.values(SCENES)) {
      const image = new Image();
      image.src = scene.image;
    }
    const timers = timersRef.current;
    return () => {
      active = false;
      timers.forEach(window.clearTimeout);
      realtimeRef.current?.disconnect();
      window.speechSynthesis?.cancel();
      customAudioRef.current?.pause();
      if (customAudioUrlRef.current) URL.revokeObjectURL(customAudioUrlRef.current);
      if (avatarUrlRef.current) URL.revokeObjectURL(avatarUrlRef.current);
    };
  }, []);

  const activateAvatar = (stored: StoredAvatar) => {
    realtimeRef.current?.disconnect();
    realtimeRef.current = null;
    if (avatarUrlRef.current) URL.revokeObjectURL(avatarUrlRef.current);
    const url = URL.createObjectURL(stored.blob);
    avatarUrlRef.current = url;
    setAvatarReady(false);
    setAvatarUrl(url);
    setAvatarRecord(stored);
    setMessages(createInitialMessages(stored.name));
    messageIdRef.current = 2;
  };

  const handleAvatarFile = async (file?: File) => {
    if (!file) return;
    setIsImportingAvatar(true);
    setAvatarNotice("");
    try {
      const details = await validateVrmFile(file);
      const stored = await saveAvatar(file, details.specification, details.modelName);
      activateAvatar(stored);
      setAvatarNoticeKind("success");
      setAvatarNotice(`${stored.name}已准备好。`);
      animate("wave", "happy");
    } catch (error) {
      setAvatarNoticeKind("error");
      setAvatarNotice(error instanceof Error ? error.message : "无法导入这个角色。");
    } finally {
      setIsImportingAvatar(false);
    }
  };

  const selectBundledAvatar = async (id: BundledAvatarId) => {
    const selected = BUNDLED_AVATARS[id];
    realtimeRef.current?.disconnect();
    realtimeRef.current = null;
    try {
      await removeAvatar();
    } catch {
      setAvatarNoticeKind("error");
      setAvatarNotice("无法从此浏览器移除已保存的角色。");
      return;
    }
    if (avatarUrlRef.current) URL.revokeObjectURL(avatarUrlRef.current);
    avatarUrlRef.current = undefined;
    setAvatarReady(false);
    setAvatarUrl(undefined);
    setAvatarRecord(null);
    setBundledAvatarId(id);
    localStorage.setItem(BUNDLED_AVATAR_STORAGE_KEY, id);
    setMessages(createInitialMessages(selected.name));
    messageIdRef.current = 2;
    setAvatarNoticeKind("success");
    setAvatarNotice(`${selected.name}已准备好。`);
    animate("wave", "happy");
  };

  const selectKaiOutfit = (id: KaiOutfitId) => {
    const outfit = KAI_OUTFITS[id];
    setAvatarReady(false);
    setKaiOutfitId(id);
    localStorage.setItem(KAI_OUTFIT_STORAGE_KEY, id);
    setAvatarNoticeKind("success");
    setAvatarNotice(`已换上${outfit.name}穿搭。`);
    animate("wave", "happy");
  };

  const selectScene = (id: SceneId) => {
    setSceneId(id);
    localStorage.setItem(SCENE_STORAGE_KEY, id);
    setScenePanelOpen(false);
  };

  const animate = (action: AvatarAction, emotion: AvatarEmotion = command.emotion, speaking = false) => {
    setCommand((current) => ({ action, emotion, speaking, nonce: current.nonce + 1 }));
  };

  const setSpeaking = (speaking: boolean, emotion?: AvatarEmotion) => {
    setCommand((current) => ({ ...current, speaking, emotion: emotion ?? current.emotion }));
  };

  const speak = (
    text: string,
    emotion: AvatarEmotion,
    leadAction: AvatarAction,
    useExternalVoice = externalVoiceEnabled,
  ) => {
    const requestId = ++speechRequestRef.current;
    animate(leadAction, emotion, false);
    window.speechSynthesis?.cancel();
    customAudioRef.current?.pause();
    customAudioRef.current = null;
    if (customAudioUrlRef.current) {
      URL.revokeObjectURL(customAudioUrlRef.current);
      customAudioUrlRef.current = null;
    }

    let browserSpeechStarted = false;
    const finish = () => {
      if (requestId !== speechRequestRef.current) return;
      customAudioRef.current = null;
      if (customAudioUrlRef.current) {
        URL.revokeObjectURL(customAudioUrlRef.current);
        customAudioUrlRef.current = null;
      }
      animate("idle", emotion, false);
      if (realtimeRef.current) setRealtimePhase("connected");
    };
    const speakWithBrowser = () => {
      if (browserSpeechStarted) return;
      browserSpeechStarted = true;
      const browserSpeech = window.speechSynthesis;
      if (!browserSpeech) {
        timersRef.current.push(window.setTimeout(finish, 900));
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "zh-CN";
      utterance.rate = bundledAvatarId === "kai" ? 0.92 : 0.98;
      utterance.pitch = bundledAvatarId === "kai" ? 0.98 : 1.04;
      const voices = browserSpeech.getVoices();
      const preferredVoice = bundledAvatarId === "kai"
        ? /Yunxi|Yunyang|Kangkang|Xiaobei|Male|Chinese|Mandarin/i
        : /Xiaoxiao|Xiaoyi|Huihui|Female|Chinese|Mandarin/i;
      const chineseVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith("zh"));
      utterance.voice = chineseVoices.find((voice) => preferredVoice.test(voice.name)) ?? chineseVoices[0] ?? voices[0] ?? null;
      utterance.onstart = () => {
        setSpeaking(true, emotion);
        if (realtimeRef.current) setRealtimePhase("speaking");
      };
      utterance.onend = finish;
      utterance.onerror = finish;
      const gestureDelay = leadAction === "talk" || leadAction === "idle" ? 0 : 380;
      timersRef.current.push(window.setTimeout(() => {
        if (requestId === speechRequestRef.current) browserSpeech.speak(utterance);
      }, gestureDelay));
    };

    if (!soundEnabled) {
      timersRef.current.push(window.setTimeout(finish, 900));
      return;
    }
    if (!useExternalVoice) {
      speakWithBrowser();
      return;
    }

    void (async () => {
      try {
        const response = await fetch("/api/voice/speech", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ persona: bundledAvatarId, text, emotion }),
        });
        if (!response.ok) throw new Error("定制声线暂时不可用。");
        const audioUrl = URL.createObjectURL(await response.blob());
        if (requestId !== speechRequestRef.current) {
          URL.revokeObjectURL(audioUrl);
          return;
        }
        const audio = new Audio(audioUrl);
        customAudioRef.current = audio;
        customAudioUrlRef.current = audioUrl;
        audio.onplay = () => {
          setSpeaking(true, emotion);
          if (realtimeRef.current) setRealtimePhase("speaking");
        };
        audio.onended = finish;
        audio.onerror = () => {
          if (requestId === speechRequestRef.current) speakWithBrowser();
        };
        await audio.play();
      } catch {
        if (requestId === speechRequestRef.current) speakWithBrowser();
      }
    })();
  };

  const stopListening = () => {
    speechRequestRef.current += 1;
    window.speechSynthesis?.cancel();
    customAudioRef.current?.pause();
    customAudioRef.current = null;
    if (customAudioUrlRef.current) {
      URL.revokeObjectURL(customAudioUrlRef.current);
      customAudioUrlRef.current = null;
    }
    realtimeRef.current?.disconnect();
    realtimeRef.current = null;
    setRealtimePhase("disconnected");
    setIsThinking(false);
    animate("idle", "neutral");
  };

  const startListening = async () => {
    if (isVoiceActive) {
      stopListening();
      return;
    }
    setSpeechNotice("");
    setConversationOpen(false);
    setAvatarPanelOpen(false);
    setScenePanelOpen(false);
    window.speechSynthesis?.cancel();
    customAudioRef.current?.pause();
    customAudioRef.current = null;
    if (customAudioUrlRef.current) {
      URL.revokeObjectURL(customAudioUrlRef.current);
      customAudioUrlRef.current = null;
    }
    speechRequestRef.current += 1;
    let useExternalVoice = externalVoiceEnabled;
    try {
      const currentModes = await loadVoiceModes();
      setVoiceModes(currentModes);
      useExternalVoice = currentModes[bundledAvatarId] === "cartesia";
    } catch {
      // Keep the last known voice mode if the health check is temporarily unavailable.
    }
    const realtime = new RealtimeConversation({
      onPhase: (phase) => {
        setRealtimePhase(phase);
        if (phase === "listening") {
          setIsThinking(false);
          animate("listening", "neutral");
        } else if (phase === "thinking") {
          setIsThinking(true);
          animate("thinking", "thoughtful");
        } else if (phase === "speaking") {
          setIsThinking(false);
          setCommand((current) => ({
            action: current.action === "thinking" || current.action === "listening" || current.action === "idle" ? "talk" : current.action,
            emotion: current.emotion === "neutral" ? "happy" : current.emotion,
            speaking: true,
            nonce: current.nonce + 1,
          }));
        } else if (phase === "connected" || phase === "disconnected") {
          setIsThinking(false);
          animate("idle", "neutral", false);
        }
      },
      onUserTranscript: (text) => {
        setMessages((current) => [...current, { id: messageIdRef.current++, speaker: "user", text }]);
      },
      onAssistantTranscript: (text) => {
        const reaction = deriveAvatarReaction(text);
        setMessages((current) => [...current, { id: messageIdRef.current++, speaker: "mira", text }]);
        setIsThinking(false);
        if (useExternalVoice) speak(text, reaction.emotion, reaction.action, true);
        else animate(reaction.action, reaction.emotion, true);
      },
      onError: (message) => {
        setSpeechNotice(message);
        setIsThinking(false);
        animate("idle", "neutral", false);
      },
    });
    realtimeRef.current = realtime;
    try {
      await realtime.connect(bundledAvatarId, !soundEnabled, useExternalVoice);
    } catch (error) {
      if (realtimeRef.current === realtime) realtimeRef.current = null;
      setRealtimePhase("disconnected");
      setIsThinking(false);
      animate("idle", "neutral", false);
      const errorName = error instanceof DOMException ? error.name : "";
      const notice = errorName === "NotAllowedError" || errorName === "SecurityError"
        ? "麦克风权限已被阻止。请在浏览器的网站设置中允许麦克风访问，然后重试。"
        : errorName === "NotFoundError"
          ? "未找到麦克风。请连接输入设备后重试。"
          : error instanceof Error
            ? error.message
            : "无法启动实时语音会话。";
      setSpeechNotice(notice);
    }
  };

  const toggleSound = () => {
    setSoundEnabled((enabled) => {
      const next = !enabled;
      if (!next) {
        speechRequestRef.current += 1;
        window.speechSynthesis?.cancel();
        customAudioRef.current?.pause();
        customAudioRef.current = null;
        if (customAudioUrlRef.current) {
          URL.revokeObjectURL(customAudioUrlRef.current);
          customAudioUrlRef.current = null;
        }
        animate("idle", "neutral", false);
      }
      realtimeRef.current?.setMuted(!next || externalVoiceEnabled);
      return next;
    });
  };

  return (
    <main className="app-shell">
      <section
        className="avatar-stage"
        style={stageStyle}
        aria-label={`${personaName}角色`}
        data-scene={sceneId}
        data-avatar-action={command.action}
        data-avatar-emotion={command.emotion}
      >
        <header className="topbar">
          <div className="brand-lockup">
            <span className="brand-mark"><Sparkles size={16} strokeWidth={2.2} /></span>
            <div>
              <h1>{personaName}</h1>
              <span className={`presence ${isVoiceActive ? "live" : ""}`}><i /> {isVoiceActive ? "语音已连接" : "在线"}</span>
            </div>
          </div>
          <div className="topbar-actions">
            <button
              className="icon-button"
              onClick={() => {
                setConversationOpen(false);
                setAvatarPanelOpen(false);
                setScenePanelOpen((open) => !open);
              }}
              aria-label={`选择场景，当前${selectedScene.name}`}
              title="选择场景"
            >
              {scenePanelOpen ? <X size={20} /> : <MapPin size={19} />}
            </button>
            <button
              className="icon-button"
              onClick={() => {
                setConversationOpen(false);
                setScenePanelOpen(false);
                setAvatarPanelOpen((open) => !open);
              }}
              aria-label="选择角色"
              title="选择角色"
            >
              {avatarPanelOpen ? <X size={20} /> : <UserRoundCog size={19} />}
            </button>
            <button className="icon-button" onClick={toggleSound} aria-label={soundEnabled ? "静音" : "开启声音"} title={soundEnabled ? "静音" : "开启声音"}>
              {soundEnabled ? <Volume2 size={19} /> : <VolumeX size={19} />}
            </button>
            <button className="icon-button conversation-toggle" onClick={() => {
              setAvatarPanelOpen(false);
              setScenePanelOpen(false);
              setConversationOpen((open) => !open);
            }} aria-label="打开语音记录" title="语音记录">
              {conversationOpen ? <X size={20} /> : <History size={19} />}
            </button>
          </div>
        </header>

        <div className="scene-wrap">
          <div className="scene-background" aria-hidden="true" />
          <div className="scene-wash" aria-hidden="true" />
          <AvatarScene command={command} modelUrl={avatarUrl ?? bundledAvatar.url} onReady={handleAvatarReady} />
          {!avatarReady && <div className="avatar-loading" role="status"><span />正在准备{personaName}</div>}
          <div className="scene-glow" />
          <div className={`live-caption ${isThinking ? "thinking" : ""}`} aria-live="polite">
            <span className="caption-label">{isThinking ? `${personaName}正在思考` : personaName}</span>
            <p>{isThinking ? <><i /><i /><i /></> : latestAssistantMessage}</p>
          </div>
        </div>

        <div className="bottom-controls">
          <button className={`mic-button ${isVoiceActive ? "listening" : ""}`} onClick={startListening} aria-label={isVoiceActive ? "结束语音对话" : `和${personaName}说话`}>
            <span className="mic-ripple" />
            {isVoiceActive ? <MicOff size={25} /> : <Mic size={25} />}
          </button>
          <span className="mic-label">{voiceStatusLabel[realtimePhase]}</span>
          {speechNotice && <p className="speech-notice" role="alert"><AlertCircle size={14} />{speechNotice}</p>}
        </div>
      </section>

      <aside className={`conversation-panel ${conversationOpen ? "open" : ""}`} aria-label="语音记录">
        <div className="panel-header">
          <div>
            <span className="panel-kicker">语音记录</span>
            <h2>{personaName}和你</h2>
          </div>
          <button className="icon-button panel-close" onClick={() => setConversationOpen(false)} aria-label="关闭语音记录"><X size={19} /></button>
        </div>

        <div className="messages" aria-live="polite">
          {messages.map((message) => (
            <div key={message.id} className={`message ${message.speaker}`}>
              <span>{message.speaker === "mira" ? personaName : "你"}</span>
              <p>{message.text}</p>
            </div>
          ))}
          {isThinking && <div className="message mira pending"><span>{personaName}</span><p><i /><i /><i /></p></div>}
        </div>
      </aside>

      <aside className={`scene-panel ${scenePanelOpen ? "open" : ""}`} aria-label="场景选择">
        <div className="panel-header">
          <div>
            <span className="panel-kicker">场景</span>
            <h2>选择相处的地方</h2>
          </div>
          <button className="icon-button panel-close" onClick={() => setScenePanelOpen(false)} aria-label="关闭场景选择"><X size={19} /></button>
        </div>
        <div className="scene-panel-body">
          <div className="scene-grid">
            {(Object.values(SCENES) as SceneOption[]).map((scene) => {
              const active = scene.id === sceneId;
              return (
                <button
                  key={scene.id}
                  type="button"
                  className={`scene-option ${active ? "active" : ""}`}
                  aria-label={`${scene.name} ${scene.description}`}
                  aria-pressed={active}
                  onClick={() => selectScene(scene.id)}
                >
                  <img src={scene.image} alt="" />
                  <span><strong>{scene.name}</strong><small>{scene.description}</small></span>
                  {active && <CheckCircle2 size={18} aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      <aside className={`avatar-panel ${avatarPanelOpen ? "open" : ""}`} aria-label="角色库">
        <div className="panel-header">
          <div>
            <span className="panel-kicker">角色</span>
            <h2>选择陪伴角色</h2>
          </div>
          <button className="icon-button panel-close" onClick={() => setAvatarPanelOpen(false)} aria-label="关闭角色库"><X size={19} /></button>
        </div>

        <div className="avatar-panel-body">
          <section className="avatar-current" aria-label="当前角色">
            <div className={`avatar-preview-mark ${avatarRecord ? "custom" : "image"}`}>
              {avatarRecord ? <UserRoundCog size={26} /> : <img src={bundledAvatar.preview} alt="" />}
            </div>
            <div>
              <span>当前角色</span>
              <h3>{personaName}</h3>
              <p>{avatarRecord ? `${avatarRecord.specification} / ${formatAvatarSize(avatarRecord.size)}` : `${bundledAvatar.specification} / ${formatAvatarSize(bundledAvatar.size)}`}</p>
            </div>
          </section>

          <section className="avatar-choices" aria-label="内置角色">
            <span className="avatar-section-label">内置角色</span>
            <div className="avatar-choice-grid">
              {(Object.values(BUNDLED_AVATARS) as BundledAvatar[]).map((avatar) => {
                const active = !avatarRecord && bundledAvatarId === avatar.id;
                return (
                  <button
                    key={avatar.id}
                    type="button"
                    className={`avatar-choice ${active ? "active" : ""}`}
                    aria-pressed={active}
                    onClick={() => void selectBundledAvatar(avatar.id)}
                  >
                    <img src={avatar.preview} alt="" />
                    <span>
                      <strong>{avatar.name}</strong>
                      <small>{avatar.description}</small>
                    </span>
                    {active && <CheckCircle2 size={18} aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </section>

          {!avatarRecord && bundledAvatarId === "kai" && (
            <section className="outfit-selector" aria-label="凯的穿搭">
              <span className="avatar-section-label">凯的穿搭</span>
              <div className="outfit-grid">
                {(Object.values(KAI_OUTFITS) as KaiOutfit[]).map((outfit) => {
                  const active = kaiOutfitId === outfit.id;
                  return (
                    <button
                      key={outfit.id}
                      type="button"
                      className={`outfit-option ${active ? "active" : ""}`}
                      aria-pressed={active}
                      onClick={() => selectKaiOutfit(outfit.id)}
                    >
                      <img src={outfit.preview} alt="" />
                      <strong>{outfit.name}</strong>
                      <small>{outfit.description}</small>
                      <span className="outfit-swatches" aria-hidden="true">
                        {outfit.colors.map((color) => <i key={color} style={{ backgroundColor: color }} />)}
                      </span>
                      {active && <CheckCircle2 size={17} aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <div className="avatar-import-actions">
            <label className={`avatar-import-button ${isImportingAvatar ? "disabled" : ""}`}>
              <Upload size={18} />
              <span>{isImportingAvatar ? "正在导入..." : "导入 VRM"}</span>
              <input
                type="file"
                accept=".vrm,model/gltf-binary,application/octet-stream"
                disabled={isImportingAvatar}
                onChange={(event) => {
                  void handleAvatarFile(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <button className="avatar-reset-button" onClick={() => void selectBundledAvatar(bundledAvatarId)} disabled={!avatarRecord || isImportingAvatar}>
              <RotateCcw size={17} />
              <span>恢复所选角色</span>
            </button>
          </div>

          {avatarNotice && (
            <p className={`avatar-notice ${avatarNoticeKind}`} role="status">
              {avatarNoticeKind === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{avatarNotice}</span>
            </p>
          )}
        </div>
      </aside>
    </main>
  );
}
