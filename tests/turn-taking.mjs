import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { RealtimeConversation } from "../src/realtime/RealtimeConversation.ts";

let scheduledResume;
globalThis.window = {
  setTimeout(callback) {
    scheduledResume = callback;
    return 1;
  },
  clearTimeout() {
    scheduledResume = undefined;
  },
};

function createConversation(externalSpeech = false) {
  const phases = [];
  const track = { enabled: true, stop() {} };
  const microphone = {
    getAudioTracks: () => [track],
    getTracks: () => [track],
  };
  const conversation = new RealtimeConversation({
    onPhase: (phase) => phases.push(phase),
    onAssistantTranscript: () => undefined,
    onError: () => undefined,
  });
  conversation.microphone = microphone;
  conversation.externalSpeech = externalSpeech;
  return { conversation, phases, track };
}

function emit(conversation, type) {
  conversation.handleEvent({ data: JSON.stringify({ type }) });
}

const builtIn = createConversation();
emit(builtIn.conversation, "input_audio_buffer.speech_started");
assert.equal(builtIn.track.enabled, true, "microphone should remain enabled while the user is speaking");
emit(builtIn.conversation, "input_audio_buffer.speech_stopped");
assert.equal(builtIn.track.enabled, false, "microphone should pause as soon as the user's turn ends");
emit(builtIn.conversation, "response.created");
assert.equal(builtIn.track.enabled, false, "microphone should remain paused while the reply is generated");
emit(builtIn.conversation, "response.done");
assert.equal(typeof scheduledResume, "function", "built-in speech should schedule input restoration after playback drains");
scheduledResume();
assert.equal(builtIn.track.enabled, true, "microphone should resume after built-in speech finishes");
assert.equal(builtIn.phases.at(-1), "connected");

scheduledResume = undefined;
const buffered = createConversation();
emit(buffered.conversation, "input_audio_buffer.speech_stopped");
emit(buffered.conversation, "response.done");
emit(buffered.conversation, "output_audio_buffer.stopped");
assert.equal(buffered.track.enabled, true, "playback stopped should resume the microphone immediately");
assert.equal(scheduledResume, undefined, "playback stopped should cancel the compatibility timeout");

scheduledResume = undefined;
const external = createConversation(true);
emit(external.conversation, "input_audio_buffer.speech_stopped");
emit(external.conversation, "response.done");
assert.equal(scheduledResume, undefined, "external speech must control its own playback completion");
assert.equal(external.track.enabled, false, "microphone should stay paused while custom speech is playing");
external.conversation.resumeInput();
assert.equal(external.track.enabled, true, "custom speech completion should explicitly resume the microphone");

const serverSource = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
assert.match(serverSource, /interrupt_response:\s*false/, "server VAD should reject interruption while the companion replies");

console.log("Turn-taking test passed: input pauses after the user turn and resumes only after reply playback.");
