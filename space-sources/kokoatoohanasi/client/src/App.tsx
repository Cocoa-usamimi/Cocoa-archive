import {
useCallback,
useEffect,
useRef,
useState,
type FormEvent,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaTopScrim } from "@hatch/space-sdk/client";
import { api } from "./api";
import neutralImg from "./assets/cocoa-neutral.webp";
import mouthOpenImg from "./assets/cocoa-mouth-open.webp";
import smileImg from "./assets/cocoa-smile.webp";
import sleepyImg from "./assets/cocoa-sleepy.webp";
import greetOpenMp3 from "./assets/greet-open.mp3";
import greetHelloMp3 from "./assets/greet-hello.mp3";
import tap1Mp3 from "./assets/tap-1.mp3";
import tap2Mp3 from "./assets/tap-2.mp3";
import tap3Mp3 from "./assets/tap-3.mp3";
import tap4Mp3 from "./assets/tap-4.mp3";
import tapProtestMp3 from "./assets/tap-protest.mp3";
import idle1Mp3 from "./assets/idle-1.mp3";
import idle2Mp3 from "./assets/idle-2.mp3";
import nightWakeMp3 from "./assets/night-wake.mp3";
import goodnightMp3 from "./assets/goodnight.mp3";

type Expression = "neutral" | "smile" | "sleepy";

const GREETING = "あ、らて。おかえり。タップしてみて、話しかけてもいいよ";
const GREET_HELLO_LINE = "あ、らて、おかえり。今日も会えてうれしいな。";
const PROTEST_LINE = "こらこら、連打はやめて〜。もう、くすぐったいってば。";
const NIGHT_WAKE_LINE = "ん…らて？ ねむいけど、起きたよ。";
const GOODNIGHT_LINE = "おやすみ、らて。また明日ね。";
const GOODNIGHT_PATTERN = /おやすみ|バイバイ|ばいばい|また明日/;
type FixedLine = { text: string; audio: string };
const TAP_LINES: FixedLine[] = [
  { text: "わっ、くすぐったいよ〜。", audio: tap1Mp3 },
  { text: "ん？ なあに、らて。", audio: tap2Mp3 },
  { text: "えへへ、そこ弱いの。", audio: tap3Mp3 },
  { text: "はいはい、ここあはここだよ。", audio: tap4Mp3 },
];
const IDLE_LINES: FixedLine[] = [
  { text: "んー…", audio: idle1Mp3 },
  { text: "らて、いる？", audio: idle2Mp3 },
];
const MIC_UNAVAILABLE =
  "この端末では音声入力できないみたい。文字で話しかけてね";

function isNightTokyo(now = new Date()): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tokyo",
      hour: "numeric",
      hour12: false,
    }).format(now),
  );
  return hour >= 23 || hour < 7;
}

function spriteFor(expr: Expression): string {
  if (expr === "smile") return smileImg;
  if (expr === "sleepy") return sleepyImg;
  return neutralImg;
}

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult:
    | ((event: {
        results: ArrayLike<ArrayLike<{ transcript: string }>>;
      }) => void)
    | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

function speechRecognitionCtor():
  | (new () => SpeechRecognitionLike)
  | undefined {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

const roundedFont =
  "'Hiragino Maru Gothic ProN', 'Hiragino Sans', 'Noto Sans JP', system-ui, sans-serif";

export function App() {
  const queryClient = useQueryClient();
  const [night, setNight] = useState<boolean>(() => isNightTokyo());
  const [expression, setExpression] = useState<Expression>(() =>
    isNightTokyo() ? "sleepy" : "smile",
  );
  const [subtitle, setSubtitle] = useState<string>(GREETING);
  const [blinking, setBlinking] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [mouthOpen, setMouthOpen] = useState(false);
  const [bounceKey, setBounceKey] = useState(0);
  const [voiceOn, setVoiceOn] = useState(true);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [micNote, setMicNote] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const [reducedMotion] = useState<boolean>(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  const hasInteractedRef = useRef(false);
  const voiceOnRef = useRef(true);
  const nightRef = useRef(night);
  const speakingRef = useRef(false);
  const thinkingRef = useRef(false);
  const flapTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speechSafetyRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapTimesRef = useRef<number[]>([]);
  const revertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subtitleKindRef = useRef<"greeting" | "murmur" | "other">("greeting");
  const lastActivityRef = useRef<number>(Date.now());
  const nextMurmurRef = useRef<number>(Date.now() + 30_000);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const greetingPlayedRef = useRef(false);
  const nightWokenRef = useRef(false);

  nightRef.current = night;
  speakingRef.current = speaking;

  const historyQuery = useQuery({
    queryKey: ["messages"],
    queryFn: () => api.listMessages({ limit: 60 }),
  });

  const defaultExpression = useCallback(
    (): Expression => (nightRef.current ? "sleepy" : "neutral"),
    [],
  );

  const stopAudio = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.onplaying = null;
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audioRef.current = null;
    }
  }, []);

  const stopFlap = useCallback(() => {
    if (flapTimerRef.current) {
      clearInterval(flapTimerRef.current);
      flapTimerRef.current = null;
    }
    if (speechSafetyRef.current) {
      clearTimeout(speechSafetyRef.current);
      speechSafetyRef.current = null;
    }
    setSpeaking(false);
    setMouthOpen(false);
  }, []);

  const startFlap = useCallback(
    (safetyMs: number) => {
      setSpeaking(true);
      let open = false;
      flapTimerRef.current = setInterval(() => {
        open = !open;
        setMouthOpen(open);
      }, 140);
      speechSafetyRef.current = setTimeout(() => stopFlap(), safetyMs);
    },
    [stopFlap],
  );

  const speak = useCallback(
    (text: string) => {
      stopAudio();
      stopFlap();
      if (!voiceOnRef.current || !hasInteractedRef.current) return;
      if ("speechSynthesis" in window) {
        startFlap(Math.max(4000, text.length * 240));
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "ja-JP";
        utterance.pitch = 1.4;
        utterance.rate = 1.0;
        const jaVoice = window.speechSynthesis
          .getVoices()
          .find((v) => v.lang.toLowerCase().startsWith("ja"));
        if (jaVoice) utterance.voice = jaVoice;
        utterance.onend = () => stopFlap();
        utterance.onerror = () => stopFlap();
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      } else {
        startFlap(Math.max(700, text.length * 120));
      }
    },
    [startFlap, stopAudio, stopFlap],
  );

  // Plays a pre-rendered fixed line (VOICEVOX MP3). The lip flap is driven
  // by the audio element itself: it starts on "playing" and stops exactly
  // on "ended". Any load/play failure falls back to speechSynthesis.
  const playFixed = useCallback(
    (src: string, text: string) => {
      stopAudio();
      stopFlap();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      if (!voiceOnRef.current || !hasInteractedRef.current) return;
      const audio = new Audio(src);
      audioRef.current = audio;
      let started = false;
      let fellBack = false;
      const fallback = () => {
        if (fellBack) return;
        fellBack = true;
        if (audioRef.current === audio) audioRef.current = null;
        if (!started) speak(text);
        else stopFlap();
      };
      audio.onplaying = () => {
        started = true;
        startFlap(30_000);
      };
      audio.onended = () => {
        if (audioRef.current === audio) audioRef.current = null;
        stopFlap();
      };
      audio.onerror = fallback;
      void audio.play().catch(fallback);
    },
    [speak, startFlap, stopAudio, stopFlap],
  );

  const sayFixed = useCallback(
    (
      line: FixedLine,
      expr: Expression,
      kind: "murmur" | "other",
    ) => {
      setSubtitle(line.text);
      subtitleKindRef.current = kind;
      setExpression(expr);
      lastActivityRef.current = Date.now();
      playFixed(line.audio, line.text);
    },
    [playFixed],
  );

  // The greeting audio can only play after a user gesture, so the first
  // interaction of the session voices the (already displayed) greeting.
  const playGreetingOnce = useCallback(() => {
    if (greetingPlayedRef.current) return;
    greetingPlayedRef.current = true;
    playFixed(greetOpenMp3, GREETING);
  }, [playFixed]);

  const scheduleRevert = useCallback(() => {
    if (revertTimerRef.current) clearTimeout(revertTimerRef.current);
    revertTimerRef.current = setTimeout(() => {
      if (!speakingRef.current && !thinkingRef.current) {
        setExpression(defaultExpression());
      }
    }, 4000);
  }, [defaultExpression]);

  const sayLine = useCallback(
    (line: string, expr: Expression, kind: "murmur" | "other") => {
      setSubtitle(line);
      subtitleKindRef.current = kind;
      setExpression(expr);
      lastActivityRef.current = Date.now();
    },
    [],
  );

  // Preload all sprites so expression swaps never flash.
  useEffect(() => {
    for (const src of [neutralImg, mouthOpenImg, smileImg, sleepyImg]) {
      const img = new Image();
      img.src = src;
    }
  }, []);

  // Greeting: smile briefly, then settle to the time-of-day default.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!hasInteractedRef.current) setExpression(defaultExpression());
    }, 2600);
    return () => clearTimeout(timer);
  }, [defaultExpression]);

  // Re-check day/night every minute.
  useEffect(() => {
    const timer = setInterval(() => {
      const n = isNightTokyo();
      setNight((prev) => {
        if (prev !== n && !speakingRef.current && !thinkingRef.current) {
          setExpression(n ? "sleepy" : "neutral");
        }
        return n;
      });
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  // Blink loop: neutral -> smile (eyes closed) for ~160ms every 2.5-5s.
  useEffect(() => {
    let cancelled = false;
    let inner: ReturnType<typeof setTimeout> | undefined;
    const loop = () => {
      const delay = 2500 + Math.random() * 2500;
      inner = setTimeout(() => {
        if (cancelled) return;
        setBlinking(true);
        inner = setTimeout(() => {
          if (cancelled) return;
          setBlinking(false);
          loop();
        }, 160);
      }, delay);
    };
    loop();
    return () => {
      cancelled = true;
      if (inner) clearTimeout(inner);
    };
  }, []);

  // Rare, quiet idle murmurs (subtitle only, never voiced).
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      if (
        now >= nextMurmurRef.current &&
        !speakingRef.current &&
        !thinkingRef.current &&
        now - lastActivityRef.current > 15_000 &&
        (subtitleKindRef.current === "greeting" ||
          subtitleKindRef.current === "murmur")
      ) {
        const line =
          IDLE_LINES[Math.floor(Math.random() * IDLE_LINES.length)] ??
          IDLE_LINES[0]!;
        sayFixed(line, defaultExpression(), "murmur");
        nextMurmurRef.current = now + 20_000 + Math.random() * 20_000;
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [defaultExpression, sayFixed]);

  // Stop speech on unmount.
  useEffect(() => {
    return () => {
      stopAudio();
      stopFlap();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, [stopAudio, stopFlap]);

  const replyMutation = useMutation({
    mutationFn: async (text: string) => {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("client timeout")), 40_000),
      );
      return Promise.race([
        api.reply({ text, night: nightRef.current }),
        timeout,
      ]);
    },
    onMutate: () => {
      thinkingRef.current = true;
    },
    onSuccess: (res) => {
      thinkingRef.current = false;
      sayLine(res.text, res.expression, "other");
      speak(res.text);
      void queryClient.invalidateQueries({ queryKey: ["messages"] });
    },
    onError: () => {
      thinkingRef.current = false;
      // The server may still have saved the exchange; re-sync rather than
      // leaving a stuck "thinking" state.
      void queryClient.invalidateQueries({ queryKey: ["messages"] });
      sayLine(
        "うまく届かなかったみたい…もう一回送ってみて",
        defaultExpression(),
        "other",
      );
    },
  });
  const thinking = replyMutation.isPending;

  const sendText = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text || thinkingRef.current) return;
      const firstInteraction = !hasInteractedRef.current;
      hasInteractedRef.current = true;
      setInteracted(true);
      lastActivityRef.current = Date.now();
      if (nightRef.current) {
        if (!nightWokenRef.current) {
          // First contact at night: she wakes up and says so, then the
          // normal reply flow continues for the message itself.
          nightWokenRef.current = true;
          sayFixed(
            { text: NIGHT_WAKE_LINE, audio: nightWakeMp3 },
            "sleepy",
            "other",
          );
        } else if (GOODNIGHT_PATTERN.test(text)) {
          // A clear goodnight at night gets the fixed goodnight line
          // instead of a generated reply.
          sayFixed(
            { text: GOODNIGHT_LINE, audio: goodnightMp3 },
            "sleepy",
            "other",
          );
          scheduleRevert();
          return;
        }
      } else if (firstInteraction) {
        // First interaction by message: voice the greeting line too; the
        // reply's own speech takes over when it arrives.
        playGreetingOnce();
      }
      replyMutation.mutate(text);
    },
    [playGreetingOnce, replyMutation, sayFixed, scheduleRevert],
  );

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    sendText(input);
    setInput("");
  };

  const handleTap = () => {
    const firstInteraction = !hasInteractedRef.current;
    hasInteractedRef.current = true;
    setInteracted(true);
    lastActivityRef.current = Date.now();
    setBounceKey((k) => k + 1);
    if (nightRef.current && !nightWokenRef.current) {
      nightWokenRef.current = true;
      greetingPlayedRef.current = true;
      sayFixed(
        { text: NIGHT_WAKE_LINE, audio: nightWakeMp3 },
        "sleepy",
        "other",
      );
      scheduleRevert();
      return;
    }
    if (firstInteraction) {
      playGreetingOnce();
      return;
    }
    const now = Date.now();
    tapTimesRef.current = [
      ...tapTimesRef.current.filter((t) => now - t < 2000),
      now,
    ];
    if (tapTimesRef.current.length >= 5) {
      tapTimesRef.current = [];
      sayFixed(
        { text: PROTEST_LINE, audio: tapProtestMp3 },
        "sleepy",
        "other",
      );
      scheduleRevert();
      return;
    }
    const line =
      TAP_LINES[Math.floor(Math.random() * TAP_LINES.length)] ?? TAP_LINES[0]!;
    sayFixed(line, "smile", "other");
    scheduleRevert();
  };

  const handleNameTap = () => {
    hasInteractedRef.current = true;
    setInteracted(true);
    lastActivityRef.current = Date.now();
    greetingPlayedRef.current = true;
    sayFixed(
      { text: GREET_HELLO_LINE, audio: greetHelloMp3 },
      nightRef.current ? "sleepy" : "smile",
      "other",
    );
    scheduleRevert();
  };

  const handleMic = () => {
    hasInteractedRef.current = true;
    setInteracted(true);
    const Ctor = speechRecognitionCtor();
    if (!Ctor) {
      setMicNote(MIC_UNAVAILABLE);
      inputRef.current?.focus();
      return;
    }
    try {
      const recognition = new Ctor();
      recognition.lang = "ja-JP";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      setMicNote(null);
      setListening(true);
      recognition.onresult = (event) => {
        const transcript = event.results[0]?.[0]?.transcript ?? "";
        if (transcript.trim()) sendText(transcript);
      };
      recognition.onerror = () => {
        setListening(false);
        setMicNote("うまく聞き取れなかったみたい。文字でも大丈夫だよ");
        inputRef.current?.focus();
      };
      recognition.onend = () => setListening(false);
      recognition.start();
    } catch {
      setListening(false);
      setMicNote(MIC_UNAVAILABLE);
      inputRef.current?.focus();
    }
  };

  const toggleVoice = () => {
    const next = !voiceOn;
    setVoiceOn(next);
    voiceOnRef.current = next;
    if (!next) {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      stopAudio();
      stopFlap();
    }
  };

  const currentSprite =
    speaking && mouthOpen
      ? mouthOpenImg
      : blinking
        ? smileImg
        : spriteFor(expression);

  const messages = historyQuery.data?.messages ?? [];

  return (
    <div
      className="flex min-h-dvh flex-col"
      style={{
        background: night
          ? "radial-gradient(ellipse 130% 80% at 50% 35%, #f7d0da 0%, #f3c6d2 70%, #efbfcd 100%)"
          : "radial-gradient(ellipse 130% 80% at 50% 35%, #ffe6ec 0%, #fddadf 65%, #fbd2db 100%)",
        color: "var(--text)",
      }}
    >
      <SafeAreaTopScrim backgroundColor={night ? "#f3c3d0" : "#fddadf"} />

      {/* Name plate + presence */}
      <header className="flex items-center justify-between px-4 pt-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleNameTap}
            aria-label="ここあにあいさつする"
            className="text-xl font-bold"
            style={{ fontFamily: roundedFont }}
          >
            ここあ
          </button>
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{
              backgroundColor: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--text)",
            }}
            aria-label={night ? "お休み中" : "オンライン"}
          >
            {night ? "🌙 お休み中" : "💚 オンライン"}
          </span>
        </div>
        <button
          type="button"
          onClick={toggleVoice}
          aria-label={voiceOn ? "声をオフにする" : "声をオンにする"}
          aria-pressed={voiceOn}
          className="rounded-full px-3 py-1.5 text-sm font-medium"
          style={{
            backgroundColor: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--text)",
          }}
        >
          {voiceOn ? "🔊 声オン" : "🔇 声オフ"}
        </button>
      </header>

      {/* Stage */}
      <main className="relative flex flex-1 items-center justify-center px-4">
        <div className="relative flex w-full max-w-md flex-col items-center">
          <div
            key={bounceKey}
            style={{
              animation:
                bounceKey > 0 && !reducedMotion
                  ? "cocoa-bounce 0.55s ease"
                  : undefined,
            }}
          >
            <div
              style={{
                animation: reducedMotion
                  ? undefined
                  : "cocoa-sway 6s ease-in-out infinite",
              }}
            >
              <button
                type="button"
                onClick={handleTap}
                aria-label="ここあをつつく"
                className="block cursor-pointer rounded-full focus:outline-none"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                <img
                  src={currentSprite}
                  alt="ここあ"
                  draggable={false}
                  className="h-auto w-full max-w-[430px] select-none"
                />
              </button>
            </div>
          </div>
          {/* Floor shadow */}
          <div
            aria-hidden="true"
            className="-mt-3 h-6 w-3/5 rounded-[50%]"
            style={{
              background: night
                ? "radial-gradient(ellipse at center, rgba(30,10,20,0.4), transparent 70%)"
                : "radial-gradient(ellipse at center, rgba(190,90,120,0.35), transparent 70%)",
            }}
          />
        </div>
      </main>

      {/* Bottom panel */}
      <section className="px-4 pb-5">
        <div
          className="rounded-3xl px-5 py-4"
          style={{
            backgroundColor: "var(--surface)",
            border: "1px solid var(--border)",
            boxShadow: "0 6px 24px rgba(190, 90, 120, 0.18)",
          }}
          aria-live="polite"
        >
          <p
            className="min-h-14 text-lg leading-relaxed font-medium"
            style={{ fontFamily: roundedFont }}
          >
            {subtitle}
          </p>
          {thinking && (
            <p
              className="mt-1 flex items-center gap-1 text-sm"
              style={{ color: "var(--dim)" }}
              role="status"
            >
              ここあ考え中
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  aria-hidden="true"
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{
                    backgroundColor: "var(--accent)",
                    animation: `cocoa-thinking 1.2s ease-in-out ${i * 0.18}s infinite`,
                  }}
                />
              ))}
            </p>
          )}
          {!interacted && !thinking && (
            <p className="mt-1 text-xs" style={{ color: "var(--dim)" }}>
              タップすると声も出るよ
            </p>
          )}
        </div>

        {micNote && (
          <p
            className="mt-2 px-2 text-sm"
            style={{ color: "var(--dim)" }}
            role="status"
          >
            {micNote}
          </p>
        )}

        {messages.length > 0 && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              aria-expanded={showHistory}
              className="px-2 text-sm font-medium underline underline-offset-4"
              style={{ color: "var(--dim)" }}
            >
              {showHistory ? "おはなしを閉じる" : "これまでのおはなし"}
            </button>
            {showHistory && (
              <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto px-1 py-1">
                {messages.map((m) => (
                  <li
                    key={m.id}
                    className={
                      m.role === "user" ? "flex justify-end" : "flex"
                    }
                  >
                    <span
                      className="max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed"
                      style={{
                        backgroundColor:
                          m.role === "user"
                            ? "var(--accent)"
                            : "var(--surface)",
                        color: m.role === "user" ? "#ffffff" : "var(--text)",
                        border:
                          m.role === "user"
                            ? undefined
                            : "1px solid var(--border)",
                      }}
                    >
                      {m.text}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="mt-3 flex items-center gap-2"
        >
          <button
            type="button"
            onClick={handleMic}
            aria-label={listening ? "聞き取り中" : "マイクで話しかける"}
            aria-pressed={listening}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-2xl"
            style={{
              backgroundColor: listening ? "var(--accent)" : "var(--surface)",
              border: "1px solid var(--border)",
              color: listening ? "#ffffff" : "var(--text)",
              boxShadow: "0 4px 14px rgba(190, 90, 120, 0.25)",
            }}
          >
            🎤
          </button>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="ここあに話しかける"
            aria-label="ここあへのメッセージ"
            enterKeyHint="send"
            className="h-12 min-w-0 flex-1 rounded-full px-4 text-base"
            style={{
              backgroundColor: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--text)",
            }}
          />
          <button
            type="submit"
            disabled={!input.trim() || thinking}
            aria-label="送信"
            className="h-12 shrink-0 rounded-full px-5 text-base font-bold text-white disabled:opacity-40"
            style={{ backgroundColor: "var(--accent)" }}
          >
            送る
          </button>
        </form>
      </section>
    </div>
  );
}
