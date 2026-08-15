# Avatar Companion MVP

A mobile-first, expressive 3D avatar MVP built with React, Capacitor, Three.js, React Three Fiber, and VRM.

## MVP features

- Polished responsive avatar stage for desktop and mobile
- Two selectable bundled VRM characters, Mira and Kai, with idle motion, blinking, mouth movement, expressive gestures, and a procedural error fallback
- Three persistent Kai outfit variants: clean everyday, city commute, and weekend crossbody styling
- Five persistent AI-generated environments: office, gym, beach, nature, and cafe
- Voice-only first-version interface with a readable transcript drawer and no text composer
- Semantic behavior states including listening, thinking, explaining, comforting, greeting, agreement, and celebration
- Content-aware reactions that coordinate facial emotion, body action, and mouth movement without an extra model call
- Low-latency speech-to-speech conversation through the Realtime API and WebRTC
- Custom-voice playback and browser speech synthesis fallback, with mute control
- Local VRM 0.x/1.0 import, validation, persistence, and restore-to-bundled workflow
- Normalized VRM framing, expressions, mouth shapes, and gesture control via `@pixiv/three-vrm`
- Capacitor iOS project synchronized with the web build

The standard OpenAI API key stays in the local Node server. The browser receives the WebRTC session only and never reads the long-lived credential.

## Requirements

- Node.js 20.19 or newer (Node.js 24 LTS is installed in the current development environment)
- npm 10 or newer

## Run the demo

Create an ignored `.env.local` file:

```text
OPENAI_API_KEY=your-project-key
OPENAI_REALTIME_MODEL=gpt-realtime-2.1-mini
OPENAI_TEXT_MODEL=gpt-5-mini
OPENAI_KAI_VOICE=cedar
OPENAI_MIRA_VOICE=marin
# Optional private custom voice route
CARTESIA_API_KEY=sk_car_...
CARTESIA_KAI_VOICE_ID=your-private-voice-id
CARTESIA_TTS_MODEL=sonic-3.5
```

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. Microphone access requires localhost or HTTPS; browsers will normally block voice input on a plain HTTP LAN URL.

The app defaults to Simplified Chinese. Kai uses the `cedar` voice at a slightly slower pace with server-side style instructions for a gentle, clear young-adult male delivery. To use an approved custom voice later, set `OPENAI_KAI_VOICE_ID` to its voice ID; the built-in low-cost route remains the default.

For an immediately available lower-cost custom voice, configure Cartesia. The server then asks OpenAI Realtime for text output and renders it through the selected Cartesia voice without exposing either API key. The demo can use a public Mandarin voice on the free tier; creating a private clone requires a Cartesia plan with voice cloning enabled. OpenAI custom voice takes priority if both routes are configured. Recording direction, authorization rules, setup commands, and acceptance lines are in [`docs/kai-voice-recording.md`](docs/kai-voice-recording.md).

Kai's detailed friend persona, relationship boundaries, conversation policy, and structured input/output contract are documented in [`docs/llm-companion-contract.md`](docs/llm-companion-contract.md). Text replies return coordinated `text`, `emotion`, and `action` fields; Realtime sessions use the same persona but speak naturally without structured labels.

## Verify

```bash
npm run build
npm run lint
npm run test:persona
npm run test:reactions
npm run test:smoke
npm run test:realtime
```

The smoke and reaction tests do not spend API credits. `test:realtime` creates one real WebRTC session, so it requires a configured key and may incur a small API charge. Screenshots are written to `test-artifacts/`.

## iOS

```bash
npm run build
npx cap sync ios
```

Open `ios/App/App.xcworkspace` on macOS with Xcode to run on an iPhone. CocoaPods and the final native build require macOS.

## Avatar workflow

Open **Customize avatar** in the demo to switch between the bundled Mira and Kai characters or import a `.vrm` file. Imported files are validated, stored in IndexedDB on that device, and restored after reload. The selected bundled character is retained locally; the procedural character is reserved for a model-loading failure.

When Kai is selected, the same panel offers three outfit previews. Outfit changes preserve the conversation and voice session, reload only the compatible VRM model, and remember the selection locally.

The repeatable VRoid-to-Blender workflow, selected fictional identity, and visual/runtime acceptance gates are documented in [`docs/avatar-pipeline.md`](docs/avatar-pipeline.md). The bundled prototype's provenance is recorded in [`public/avatar/LICENSE.md`](public/avatar/LICENSE.md).

## Next production integrations

1. Add phoneme or viseme timing for accurate lip sync.
2. Replace the permissive sample-derived prototype with a fully owned, higher-detail production source mesh.
3. Add persisted personality, conversation memory, and user preferences.
4. Deploy the session endpoint behind HTTPS with authentication, rate limits, and per-user safety identifiers.
