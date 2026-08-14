# Kai custom voice workflow

This MVP uses a two-tier voice path:

1. OpenAI Realtime remains the default, low-latency conversation path.
2. When `CARTESIA_API_KEY` and `CARTESIA_KAI_VOICE_ID` are configured, Realtime produces text and Cartesia Sonic 3.5 speaks it with Kai's selected public or private voice. OpenAI custom voice remains the preferred single-provider path if the organization becomes eligible later.

The current OpenAI project does not expose the custom voice endpoints, so Cartesia is the practical low-cost route for the demo. The integration uses the current `2026-03-01` API version and voice IDs rather than deprecated voice embeddings.

The current demo uses Cartesia's public `Hao - Friendly Guy` Mandarin voice as a free-tier baseline. Instant voice cloning is unavailable on Cartesia's free tier; after upgrading, the authorized reference recording can replace this public voice without further application changes.

## Voice direction

Kai should sound like a 23-27 year-old Mandarin-speaking man:

- Clear and composed, with a comfortable middle register
- Gentle without sounding weak, breathy, flirtatious, or deliberately deep
- Slight warmth at sentence endings; no announcer, sales, radio, or customer-service delivery
- Natural conversational rhythm around 0.95x normal pace
- Emotionally present but restrained; pauses should feel like listening, not acting

The clone follows the source clip's cadence, energy, pauses, and recording artifacts. Performance and capture quality matter more than post-processing.

## Source recording

Use an explicitly authorized adult male performer. The character is fictional, but the source speaker must understand and approve creation and product use of the private synthetic voice. Do not use a celebrity, public figure, scraped audio, or a recording made for another purpose.

Record one 5-8 second take of this line:

> 没关系，慢慢说，我在认真听。我们一起想办法。

Direction: speak to one close friend at normal volume, with a small natural smile. Keep the first sentence reassuring and the second grounded. Do not whisper, over-act, or force a lower pitch.

Capture requirements:

- Quiet, soft-furnished room with no music, fan, keyboard, or traffic noise
- Microphone 15-20 cm from the mouth, slightly off-axis, with a pop filter if available
- WAV mono at 48 kHz / 24-bit preferred; clean M4A, MP3, FLAC, OGG, or WebM also works
- No reverb, denoising, compression, EQ, pitch shifting, or background removal before the first test
- Listen back on headphones and reject mouth clicks, clipping, room echo, and abrupt cutoffs

Place the approved take at `voice-samples/kai-reference.wav`. This folder is gitignored because source voice recordings are private biometric data.

## Create and enable the voice

Add the Cartesia key directly to the ignored `.env.local` file. Do not paste it into chat or commit it:

```text
CARTESIA_API_KEY=sk_car_...
CARTESIA_TTS_MODEL=sonic-3.5
```

Validate the file locally without uploading:

```bash
npm run voice:create:cartesia -- --clip voice-samples/kai-reference.wav --confirm-rights --dry-run
```

On a Cartesia plan with voice cloning enabled, create the private voice and save its ID to `.env.local`:

```bash
npm run voice:create:cartesia -- --clip voice-samples/kai-reference.wav --confirm-rights --write-env
```

Restart `npm run dev`. `/api/health` will then report `voices.kai` as `cartesia`, and both typed replies and microphone conversations will automatically use the custom voice. If Cartesia fails, typed playback falls back to the browser's Mandarin voice; the long-lived Cartesia key never reaches the browser.

## Acceptance pass

Use the same three lines for every candidate:

1. `今天过得怎么样？想说什么都可以，我在听。`
2. `先别急着责怪自己，我们把最难的那一小块拆开。`
3. `这次真的做得很好，值得替自己高兴一下。`

Accept a candidate only if it has stable Mandarin pronunciation, no copied room noise, no forced bass, natural sentence endings, and a first audible response that remains tolerable in a short back-and-forth conversation. Create a new clone from a better source take instead of trying to repair a poor clone with prompt instructions.

## Primary references

- [Cartesia voice cloning](https://docs.cartesia.ai/build-with-cartesia/capability-guides/clone-voices)
- [Cartesia Sonic 3.5](https://docs.cartesia.ai/build-with-cartesia/tts-models/latest)
- [Cartesia TTS bytes API](https://docs.cartesia.ai/api-reference/tts/bytes)
- [OpenAI custom voices](https://developers.openai.com/api/docs/guides/text-to-speech#custom-voices)
