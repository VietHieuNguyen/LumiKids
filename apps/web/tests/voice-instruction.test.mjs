import assert from "node:assert/strict";
import { test } from "node:test";
import { createSpeechService } from "../src/lib/speech-service.ts";
import { duckMusic } from "../src/features/game-runtime/model/music-volume.ts";
import { buildPatternContent, currentVoiceInstruction, createInitialState } from "@lumikids/shared";
import { createGameController } from "../src/features/game-runtime/model/controller.ts";

test("replaying a pattern instruction neither dispatches answers nor changes evaluation state", () => {
  const content = buildPatternContent({
    items: [
      { id: "a", assetId: "00000000-0000-4000-8000-000000000001" },
      { id: "b", assetId: "00000000-0000-4000-8000-000000000002" },
    ], rules: ["AB"], sequenceCount: 3, seed: "voice",
  });
  content.sequences[1].instruction = "Bé hãy chọn hình để điền vào ô trống của dãy này nhé!";
  const controller = createGameController(content);
  const browser = device();
  const service = createSpeechService(browser);
  const cleanup = service.connect();
  const interactions = [];
  controller.setCallbacks({ onInteraction: (event) => interactions.push(event) });
  service.speak(currentVoiceInstruction(content, content.sequences[1].id));
  for (let repeat = 0; repeat < 5; repeat++) service.replay();
  assert.equal(browser.played.at(-1).text, content.sequences[1].instruction);
  assert.deepEqual(controller.getState(), createInitialState(content));
  assert.deepEqual(interactions, []);
  cleanup();
});

function device(voices = [{ lang: "vi-VN", name: "Vietnamese" }]) {
  const events = new EventTarget();
  const played = [];
  let cancellations = 0;
  const synthesis = {
    getVoices: () => voices,
    cancel: () => { cancellations++; },
    speak: (utterance) => { played.push(utterance); },
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  };
  return {
    synthesis, played,
    createUtterance: (text) => ({ text }),
    setVoices: (next) => { voices = next; events.dispatchEvent(new Event("voiceschanged")); },
    cancellations: () => cancellations,
  };
}

test("SSR/unsupported environments stay usable without accessing browser globals", () => {
  const service = createSpeechService();
  const cleanup = service.connect();
  assert.equal(service.getSnapshot().status, "unsupported");
  assert.equal(service.speak("Bé hãy chọn hình nhé!"), false);
  cleanup();
});

test("async voices: never use English, prefer vi-VN, remove listeners on disposal", () => {
  const browser = device([{ lang: "en-US" }]);
  const service = createSpeechService(browser);
  const cleanup = service.connect();
  assert.equal(service.getSnapshot().status, "no-voice");
  assert.equal(service.speak("Bé hãy đếm nhé!"), false);
  browser.setVoices([{ lang: "vi", name: "generic" }, { lang: "vi-VN", name: "preferred" }]);
  assert.equal(service.speak("Bé hãy đếm nhé!"), true);
  const utterance = browser.played[0];
  assert.equal(utterance.voice.name, "preferred");
  assert.equal(utterance.lang, "vi-VN");
  assert.equal(utterance.rate, 0.85);
  assert.equal(utterance.pitch, 1);
  assert.equal(utterance.volume, 1);
  cleanup();
  assert.equal(service.getSnapshot().isSpeaking, false);
  const before = service.getSnapshot();
  browser.setVoices([]);
  assert.equal(service.getSnapshot(), before);
});

test("replay replaces speech; late canceled callbacks cannot finish the new utterance", () => {
  const browser = device();
  const service = createSpeechService(browser);
  const cleanup = service.connect();
  service.speak("Bé hãy chọn hình nhé!");
  const oldEnd = browser.played[0].onend;
  const oldError = browser.played[0].onerror;
  service.replay();
  assert.equal(browser.played.length, 2);
  assert.equal(browser.played[1].text, browser.played[0].text);
  oldEnd(); oldError();
  assert.equal(service.getSnapshot().isSpeaking, true);
  browser.played[1].onstart();
  browser.played[1].onend();
  assert.equal(service.getSnapshot().status, "ready");
  assert.equal(service.getSnapshot().isSpeaking, false);
  cleanup();
});

test("a new owner stops the previous speaker without an old cleanup canceling the new one", () => {
  const browser = device();
  const first = createSpeechService(browser);
  const second = createSpeechService(browser);
  const leaveFirst = first.connect();
  const leaveSecond = second.connect();
  first.speak("Câu trước.");
  second.speak("Câu tiếp theo.");
  assert.equal(first.getSnapshot().isSpeaking, false);
  const before = browser.cancellations();
  leaveFirst();
  assert.equal(browser.cancellations(), before);
  assert.equal(second.getSnapshot().isSpeaking, true);
  leaveSecond();
});

test("ducking restores the actual volume on end, error and explicit cancellation", () => {
  const browser = device();
  const service = createSpeechService(browser);
  const cleanup = service.connect();
  const player = { volume: 0.37 };
  let restore;
  const unsubscribe = service.subscribe(() => {
    if (service.getSnapshot().isSpeaking && !restore) restore = duckMusic(player);
    else if (!service.getSnapshot().isSpeaking && restore) { restore(); restore = undefined; }
  });
  for (const ending of ["onend", "onerror", "stop"]) {
    service.speak("Bé hãy chọn hình nhé!");
    assert.ok(Math.abs(player.volume - 0.074) < 0.000001);
    if (ending === "stop") service.stop();
    else browser.played.at(-1)[ending]();
    assert.equal(player.volume, 0.37);
    assert.equal(service.getSnapshot().isSpeaking, false);
  }
  unsubscribe(); cleanup();
});

test("autoplay rejection is recoverable through a subsequent explicit speak", () => {
  const browser = device();
  const play = browser.synthesis.speak;
  browser.synthesis.speak = () => { throw new Error("blocked"); };
  const service = createSpeechService(browser);
  const cleanup = service.connect();
  assert.equal(service.speak("Bé hãy chọn hình nhé!"), false);
  assert.equal(service.getSnapshot().status, "error");
  assert.equal(service.getSnapshot().isSpeaking, false);
  browser.synthesis.speak = play;
  assert.equal(service.replay(), true);
  cleanup();
});

test("a missing start event releases audio ducking after the bounded pending timeout", (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const browser = device();
  const service = createSpeechService(browser);
  const cleanup = service.connect();
  service.speak("Bé hãy chọn hình nhé!");
  context.mock.timers.tick(5001);
  assert.equal(service.getSnapshot().status, "error");
  assert.equal(service.getSnapshot().isSpeaking, false);
  cleanup();
});
