"use client";

import { useEffect, useRef, useState } from "react";

import { MicIcon, MicOffIcon } from "@/components/icons";
import { errorMessage } from "@/lib/api-client";

/** Pause this long after the last heard words → treat the utterance as done. */
const SILENCE_MS = 2200;
/** If nothing is heard at all, give up so the mic doesn't hang forever. */
const NO_SPEECH_MS = 10_000;

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function mergeList(seed: string, spoken: string) {
  const a = seed.trim();
  const b = spoken.trim().replace(/\s+/g, " ");
  if (!a) return b.slice(0, 1000);
  if (!b) return a.slice(0, 1000);
  return `${a} ${b}`.slice(0, 1000);
}

/** Spoken end-of-dictation cues (kept out of the shopping list). */
const STOP_TAIL =
  /(?:^|\s)(?:please\s+)?(?:stop(?:\s+listening)?|that'?s\s+(?:all|it)|i(?:'?m|\s+am)\s+done|we(?:'?re|\s+are)\s+done|finished|end(?:\s+list)?)[.!]?\s*$/i;

function hasStopCommand(raw: string): boolean {
  const text = raw.trim();
  if (!text) return false;
  if (/^(?:please\s+)?stop(?:\s+listening)?[.!]?\s*$/i.test(text)) return true;
  return STOP_TAIL.test(text);
}

function stripStopCommand(raw: string): string {
  return raw
    .replace(STOP_TAIL, " ")
    .replace(/^(?:please\s+)?stop(?:\s+listening)?[.!]?\s*$/i, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Turn hesitant speech into a usable shopping list line: drop fillers,
 * mic-checks, and stutter repeats without inventing products.
 */
export function cleanSpeech(raw: string): string {
  let text = stripStopCommand(raw);

  // Hesitation sounds and common fillers.
  text = text.replace(
    /\b(um+|uh+|uhm+|erm+|er+|eh+|ah+|oh+|hmm+|huh+|mm+|mhm+|uh\-huh)\b/gi,
    " ",
  );
  text = text.replace(/\b(you know|i mean|sort of|kind of)\b/gi, " ");
  // "like" only when used as a filler hitch ("like, two shirts"), not "I like tea".
  text = text.replace(/(^|[\s,])like[,]+(?=\s|$)/gi, "$1");
  text = text.replace(
    /(^|[\s,])like(?=\s+(?:um|uh|the|a|an|one|two|\d))/gi,
    "$1",
  );

  // Mic / livestream checks people say while testing.
  text = text.replace(/\bcan you hear me\b[?.!]*/gi, " ");
  text = text.replace(/\bam i (?:live|life|online|audible)\b[?.!]*/gi, " ");
  text = text.replace(/^(?:hello|hi|hey)\b[?.!,]*/gi, " ");

  // Soften chatty shopping wrappers into the list itself.
  text = text.replace(
    /^(?:please\s+)?(?:can|could|would)\s+you\s+(?:please\s+)?(?:buy|get|find|order)\s+/i,
    "",
  );
  text = text.replace(
    /^i\s+(?:would like|want|need|wanna)\s+to\s+(?:buy|get|find|order)\s+/i,
    "",
  );
  text = text.replace(/^i\s+(?:would like|want|need)\s+/i, "");

  // Collapse stutter repeats: "buy buy buy" / "one one" → once.
  text = text.replace(/\b(\w+)(?:\s+\1\b)+/gi, "$1");

  return text.replace(/\s+/g, " ").trim();
}

async function transcribeBlob(blob: Blob): Promise<string> {
  const body = new FormData();
  const type = blob.type || "audio/webm";
  const ext = type.includes("mp4")
    ? "mp4"
    : type.includes("ogg")
      ? "ogg"
      : type.includes("wav")
        ? "wav"
        : "webm";
  body.append("audio", blob, `dictation.${ext}`);

  let response: Response;
  try {
    response = await fetch("/api/v1/agent/transcribe", {
      method: "POST",
      body,
    });
  } catch {
    throw new Error(
      "FinPal could not be reached. Check your connection and retry.",
    );
  }
  const data = (await response.json().catch(() => null)) as {
    text?: string;
    error?: { message?: string };
  } | null;
  if (!response.ok) {
    throw new Error(
      data?.error?.message ?? `Transcription failed (${response.status}).`,
    );
  }
  const text = data?.text?.trim();
  if (!text) throw new Error("No speech was recognized. Try again.");
  return text;
}

/**
 * Mic for the Agent compose box. Prefers the browser SpeechRecognition API;
 * falls back to recording + Groq Whisper when that API is missing.
 * Stops on its own after a short silence and cleans um/uh stutters.
 */
export function VoiceDictationButton({
  value,
  onChange,
  disabled,
  onError,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  onError?: (message: string) => void;
}) {
  const [listening, setListening] = useState(false);
  const [mode, setMode] = useState<"speech" | "record" | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const seedRef = useRef("");
  /**
   * Text locked in before the last engine restart. Chrome ends recognition
   * on pauses even with continuous=true; we restart and must not lose words.
   */
  const committedRef = useRef("");
  /** Finals from the current engine instance only. */
  const sessionFinalRef = useRef("");
  /** Latest interim text (kept so silence-stop doesn't drop the last words). */
  const interimRef = useRef("");
  /** True while we still want the mic open (until silence end or manual stop). */
  const wantListenRef = useRef(false);
  const heardSpeechRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishingRef = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    return () => {
      wantListenRef.current = false;
      clearSilenceTimers();
      recognitionRef.current?.abort();
      if (mediaRef.current?.state === "recording") mediaRef.current.stop();
      mediaRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function clearSilenceTimers() {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }

  function fail(message: string) {
    wantListenRef.current = false;
    clearSilenceTimers();
    setListening(false);
    setMode(null);
    onError?.(message);
  }

  function spokenSoFar(interim = interimRef.current) {
    return cleanSpeech(
      `${committedRef.current} ${sessionFinalRef.current} ${interim}`,
    );
  }

  function show(spoken: string) {
    onChange(mergeList(seedRef.current, spoken));
  }

  function commitSessionFinals() {
    const piece = cleanSpeech(
      `${sessionFinalRef.current} ${interimRef.current}`,
    );
    sessionFinalRef.current = "";
    interimRef.current = "";
    if (!piece) return;
    committedRef.current = cleanSpeech(`${committedRef.current} ${piece}`);
  }

  function finishListening() {
    if (finishingRef.current) return;
    finishingRef.current = true;
    wantListenRef.current = false;
    clearSilenceTimers();
    commitSessionFinals();
    const spoken = spokenSoFar("");
    if (spoken) show(spoken);
    if (mediaRef.current?.state === "recording") {
      mediaRef.current.stop();
      return;
    }
    const recognition = recognitionRef.current;
    if (recognition) {
      recognition.stop();
      return;
    }
    finishingRef.current = false;
    setListening(false);
    setMode(null);
  }

  function armSilenceStop() {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => {
      if (!wantListenRef.current || !heardSpeechRef.current) return;
      finishListening();
    }, SILENCE_MS);
  }

  function armIdleStop() {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      if (!wantListenRef.current || heardSpeechRef.current) return;
      wantListenRef.current = false;
      clearSilenceTimers();
      recognitionRef.current?.stop();
      if (mediaRef.current?.state === "recording") mediaRef.current.stop();
      setListening(false);
      setMode(null);
      onError?.("No speech heard. Tap Voice and try again.");
    }, NO_SPEECH_MS);
  }

  function startSpeech(Ctor: SpeechRecognitionCtor) {
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang =
      typeof navigator !== "undefined"
        ? navigator.language || "en-US"
        : "en-US";
    recognitionRef.current = recognition;
    wantListenRef.current = true;
    heardSpeechRef.current = false;
    finishingRef.current = false;
    setMode("speech");
    setListening(true);
    armIdleStop();

    recognition.onresult = (event) => {
      let finals = "";
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i]!;
        const piece = result[0]?.transcript ?? "";
        if (result.isFinal) finals += piece;
        else interim += piece;
      }
      const rawAll = `${committedRef.current} ${finals} ${interim}`.replace(
        /\s+/g,
        " ",
      );
      const heardStop =
        hasStopCommand(rawAll) ||
        hasStopCommand(finals) ||
        hasStopCommand(interim);

      if (finals.trim() || interim.trim()) {
        heardSpeechRef.current = true;
        if (idleTimerRef.current) {
          clearTimeout(idleTimerRef.current);
          idleTimerRef.current = null;
        }
        if (!heardStop) armSilenceStop();
      }

      // Drop the spoken "stop" / "that's all" so it never becomes a list item.
      sessionFinalRef.current = stripStopCommand(finals);
      interimRef.current = stripStopCommand(interim);
      show(spokenSoFar(interimRef.current));

      if (heardStop) finishListening();
    };
    recognition.onerror = (event) => {
      if (event.error === "aborted") return;
      if (event.error === "no-speech") return;
      if (event.error === "not-allowed") {
        fail("Microphone permission was denied.");
        return;
      }
      if (event.error === "network") {
        fail("Voice input lost its connection. Try again.");
        return;
      }
    };
    recognition.onend = () => {
      commitSessionFinals();
      // Restart only while still listening and silence hasn't finished us.
      if (wantListenRef.current && recognitionRef.current === recognition) {
        try {
          recognition.start();
          return;
        } catch {
          // Fall through and close.
        }
      }
      recognitionRef.current = null;
      wantListenRef.current = false;
      finishingRef.current = false;
      clearSilenceTimers();
      setListening(false);
      setMode(null);
      const spoken = spokenSoFar("");
      if (spoken) show(spoken);
    };

    try {
      recognition.start();
    } catch {
      fail("Could not start voice input.");
    }
  }

  async function startRecording() {
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      fail(
        "Voice input is not supported in this browser. Type your list instead.",
      );
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      fail("Microphone permission was denied.");
      return;
    }

    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";
    const recorder = mime
      ? new MediaRecorder(stream, { mimeType: mime })
      : new MediaRecorder(stream);
    chunksRef.current = [];
    mediaRef.current = recorder;
    wantListenRef.current = true;
    heardSpeechRef.current = true; // recording path can't see partial text; silence via max wait
    setMode("record");
    setListening(true);
    // Record mode: auto-stop after a short clip window (Whisper batch).
    silenceTimerRef.current = setTimeout(() => {
      if (wantListenRef.current && mediaRef.current?.state === "recording") {
        finishListening();
      }
    }, 8_000);

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      mediaRef.current = null;
      clearSilenceTimers();
      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || "audio/webm",
      });
      chunksRef.current = [];
      if (blob.size < 256) {
        setListening(false);
        setMode(null);
        fail("No speech was captured. Hold a bit longer and try again.");
        return;
      }
      void transcribeBlob(blob)
        .then((text) => {
          committedRef.current = cleanSpeech(text);
          sessionFinalRef.current = "";
          show(spokenSoFar());
        })
        .catch((error) => fail(errorMessage(error)))
        .finally(() => {
          wantListenRef.current = false;
          finishingRef.current = false;
          setListening(false);
          setMode(null);
        });
    };

    try {
      recorder.start();
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      fail("Could not start recording.");
    }
  }

  function stop() {
    finishListening();
  }

  function toggle() {
    if (disabled) return;
    if (listening) {
      stop();
      return;
    }
    seedRef.current = valueRef.current;
    committedRef.current = "";
    sessionFinalRef.current = "";
    interimRef.current = "";
    wantListenRef.current = true;
    heardSpeechRef.current = false;
    const Ctor = getSpeechRecognition();
    if (Ctor) startSpeech(Ctor);
    else void startRecording();
  }

  return (
    <button
      type="button"
      className="agent-mic"
      data-listening={listening || undefined}
      data-mode={mode ?? undefined}
      onClick={toggle}
      disabled={disabled && !listening}
      aria-pressed={listening}
      aria-label={listening ? "Stop listening" : "Dictate shopping list"}
      title={
        listening
          ? 'Say "stop" when you\'re done — or tap to stop'
          : 'Speak your list. Say "stop" when finished.'
      }
    >
      {listening ? <MicOffIcon size={18} /> : <MicIcon size={18} />}
      <span className="agent-mic__label">
        {listening ? "Listening…" : "Voice"}
      </span>
    </button>
  );
}
