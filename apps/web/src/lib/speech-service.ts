export type SpeechStatus = "loading" | "unsupported" | "no-voice" | "ready" | "speaking" | "error";
export interface SpeechSnapshot { status: SpeechStatus; canSpeak: boolean; isSpeaking: boolean }
export interface SpeechEnvironment {
  synthesis: SpeechSynthesis;
  createUtterance: (text: string) => SpeechSynthesisUtterance;
}

// SpeechSynthesis has one browser-wide queue; notify its previous owner before replacement.
let activeStop: (() => void) | null = null;
const initial: SpeechSnapshot = { status: "loading", canSpeak: false, isSpeaking: false };

export function createSpeechService(environment?: SpeechEnvironment) {
  let env = environment;
  let voice: SpeechSynthesisVoice | undefined;
  let snapshot = initial;
  let current: SpeechSynthesisUtterance | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastText = "";
  const listeners = new Set<() => void>();
  function cancel() {
    try { env?.synthesis.cancel(); } catch { /* A broken browser engine must not interrupt play. */ }
  }
  function publish(status: SpeechStatus) {
    snapshot = { status, canSpeak: Boolean(voice), isSpeaking: status === "speaking" };
    listeners.forEach((notify) => notify());
  }
  function finish(status: SpeechStatus) {
    clearTimeout(timer);
    if (current) current.onstart = current.onend = current.onerror = null;
    current = null;
    if (activeStop === stop) activeStop = null;
    publish(status);
  }
  function stop() {
    const owned = current !== null;
    finish(voice ? "ready" : snapshot.status === "unsupported" ? "unsupported" : "no-voice");
    if (owned) cancel();
  }
  function speak(text: string) {
    if (!env || !voice || !text.trim()) return false;
    activeStop?.();
    stop();
    lastText = text.trim();
    let utterance: SpeechSynthesisUtterance;
    try { utterance = env.createUtterance(lastText); }
    catch { publish("error"); return false; }
    utterance.voice = voice;
    utterance.lang = "vi-VN";
    utterance.rate = 0.85;
    utterance.pitch = 1;
    utterance.volume = 1;
    current = utterance;
    activeStop = stop;
    const fail = () => {
      if (current !== utterance) return;
      finish("error");
      cancel();
    };
    // Missing start/end events must not leave background music ducked forever.
    timer = setTimeout(fail, 5000);
    utterance.onstart = () => {
      if (current !== utterance) return;
      clearTimeout(timer);
      timer = setTimeout(fail, 120000);
      publish("speaking");
    };
    utterance.onend = () => { if (current === utterance) finish("ready"); };
    utterance.onerror = fail;
    publish("speaking");
    try {
      cancel();
      env.synthesis.speak(utterance);
      return true;
    } catch {
      fail();
      return false;
    }
  }
  function connect() {
    if (!env && typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window) {
      env = { synthesis: window.speechSynthesis, createUtterance: (text) => new window.SpeechSynthesisUtterance(text) };
    }
    if (!env) { publish("unsupported"); return () => {}; }
    const synthesis = env.synthesis;
    const pick = () => {
      let voices: SpeechSynthesisVoice[];
      try { voices = synthesis.getVoices(); }
      catch { stop(); voice = undefined; publish("error"); return; }
      voice = voices.find((item) => item.lang.toLowerCase().replace("_", "-") === "vi-vn")
        ?? voices.find((item) => /^vi(?:[-_]|$)/i.test(item.lang));
      if (!voice && current) stop();
      publish(current ? "speaking" : voice ? "ready" : "no-voice");
    };
    pick();
    synthesis.addEventListener("voiceschanged", pick);
    return () => { synthesis.removeEventListener("voiceschanged", pick); stop(); };
  }
  return {
    connect, speak, stop,
    replay: () => speak(lastText),
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initial,
    subscribe: (notify: () => void) => { listeners.add(notify); return () => { listeners.delete(notify); }; },
  };
}
