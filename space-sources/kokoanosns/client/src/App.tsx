import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ApiResponse } from "./api";
import cocoaAvatar from "./assets/cocoa-avatar.webp";
import cocoaSelfieTea from "./assets/cocoa-selfie-tea.webp";
import cocoaWinterWindow from "./assets/cocoa-winter-window.webp";
import latteIcon from "./assets/latte-icon.webp";
import purikuraHeader from "./assets/purikura-header.webp";
import roomVoice1 from "./assets/room-voice-1.mp3";
import roomVoice2 from "./assets/room-voice-2.mp3";
import { recordedVoiceFor, sanitizeForSpeech } from "./voiceLines";

/* ---------- らて（ここあ が名前とアイコンを考えてくれた、本人の分身） ---------- */

const USER_NAME = "らて";
const USER_HANDLE = "@latte_home";
const USER_BIO = "ここあとおうちでまったり。ラテ担当。ときどきつぶやく。";

type AppState = ApiResponse<typeof api, "getState">;
type UserMessage = AppState["userMessages"][number];
type CocoaReply = AppState["cocoaReplies"][number];
type UserPost = AppState["userPosts"][number];
type AutoPost = AppState["posts"][number];

type View = "list" | "room" | "timeline";

/** タイムラインの投稿タップ → トークで会話を始めるための情報 */
type PostTapInfo = {
  postId?: number;
  text: string;
  topic?: string | null;
  kind?: string | null;
};

/* ---------- ここあ からの届きもの（固定コンテンツ） ---------- */

type CocoaMessage =
  | { kind: "text"; time: string; text: string }
  | { kind: "voice"; time: string; duration: string; transcript: string; audio: string }
  | { kind: "selfie"; time: string; caption: string };

const COCOA_MESSAGES: CocoaMessage[] = [
  { kind: "text", time: "08:02", text: "おはよう。ねむいけど、起きたよ" },
  {
    kind: "text",
    time: "08:03",
    text: "今日は寒いね…窓の外、雪みたいな雲が浮いてた",
  },
  {
    kind: "voice",
    time: "08:05",
    duration: "0:07",
    transcript: "おはよう。今日は寒いね。温かいお茶、一緒に飲もう？",
    audio: roomVoice1,
  },
  {
    kind: "selfie",
    time: "08:07",
    caption: "お茶、入れたよ。ふーふーして飲んでね",
  },
  {
    kind: "text",
    time: "08:09",
    text: "窓の外の木、葉っぱが全部落ちてた。冬だね",
  },
  {
    kind: "voice",
    time: "08:11",
    duration: "0:07",
    transcript: "雪、降るかなぁ。降ったら、窓から一緒に見ようね",
    audio: roomVoice2,
  },
  {
    kind: "text",
    time: "08:12",
    text: "今はちょっと休憩。お布団で丸くなってるよ",
  },
];

const PREVIEW_LINE =
  "おはよう。今日は寒いね…温かいお茶、一緒に飲もう？";

type Post = {
  id: number;
  timeLabel: string;
  text: string;
  image?: string;
  imageAlt?: string;
};

const POSTS: Post[] = [
  {
    id: 1,
    timeLabel: "30分前",
    text: "窓の外、雪がちらちら。冬が来たね",
  },
  {
    id: 2,
    timeLabel: "1時間前",
    text: "寒い日は、窓際がいちばん。お茶もあるよ",
    image: cocoaWinterWindow,
    imageAlt: "窓のそばで雪を眺めるここあ",
  },
  {
    id: 3,
    timeLabel: "3時間前",
    text: "おはよう。朝のお茶、ふーふーしたよ。温かいね",
    image: cocoaSelfieTea,
    imageAlt: "お茶のマグを持つここあ",
  },
];

/* ---------- 小さなアイコン ---------- */

function ChatIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 4C6.5 4 2.5 7.6 2.5 12c0 2.5 1.3 4.7 3.5 6.1-.2 1.2-.8 2.5-1.7 3.4 2-.1 3.9-.8 5.2-1.7.8.2 1.6.3 2.5.3 5.5 0 9.5-3.6 9.5-8S17.5 4 12 4Z"
        fill="currentColor"
      />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3.5 3 11h2.6v8.5h4.9v-6h3v6h4.9V11H21L12 3.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 4.8v14.4L19 12 7 4.8Z" fill="currentColor" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M15 4.5 7.5 12 15 19.5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SparkleIcon({
  size = 14,
  color = "var(--deco-lemon)",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ color }}
    >
      <path
        d="M12 2.5 14.3 9.7 21.5 12 14.3 14.3 12 21.5 9.7 14.3 2.5 12 9.7 9.7 12 2.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function HeartIcon({
  size = 12,
  color = "var(--deco-pink)",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ color }}
    >
      <path
        d="M12 20.7C6.4 16.9 3 13.6 3 9.9 3 7.2 5 5 7.7 5c1.7 0 3.3.9 4.3 2.4C13 5.9 14.6 5 16.3 5 19 5 21 7.2 21 9.9c0 3.7-3.4 7-9 10.8Z"
        fill="currentColor"
      />
    </svg>
  );
}

const KIND_BADGE: Record<
  AutoPost["kind"],
  { label: string; bg: string; fg: string }
> = {
  weather: { label: "☀ お天気", bg: "#fdf3d8", fg: "#8a6d1f" },
  trend: { label: "♡ トレンド", bg: "#fde3ee", fg: "#b03a6b" },
  spot: { label: "✦ おでかけ", bg: "#e2f0fb", fg: "#2f6391" },
  anniv: { label: "🎂 記念日", bg: "#ffe0ec", fg: "#c2255c" },
};

/* ---------- プリクラ風ヘッダー（ここあ ♡ らて） ---------- */

function PurikuraHeaderBanner({
  variant = "full",
}: {
  variant?: "full" | "compact" | "timeline";
}) {
  if (variant === "compact") {
    return (
      <div className="relative h-16 w-full shrink-0 overflow-hidden border-b border-[var(--border)] bg-[#ffe4ef]">
        <img
          src={purikuraHeader}
          alt="ここあとらてが並んだプリクラ風ヘッダー"
          className="h-full w-full object-cover object-[center_38%]"
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/88 px-2.5 py-1 text-[11px] font-bold text-[#b03a6b] shadow-sm">
          ここあ ♡ らて
        </span>
        <span className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-full bg-black/45 px-2 py-1 text-[10px] font-bold text-white">
          プリクラ風
        </span>
      </div>
    );
  }
  if (variant === "timeline") {
    return (
      <div className="relative w-full overflow-hidden bg-[#ffe4ef]">
        <img
          src={purikuraHeader}
          alt="ここあとらてが並んだプリクラ風ヘッダー"
          className="aspect-[2304/1008] w-full object-cover"
        />
        <span className="absolute left-3 top-3 rounded-full bg-white/88 px-2.5 py-1 text-[11px] font-bold text-[#b03a6b] shadow-sm">
          ここあ ♡ らて ・ プリクラ
        </span>
      </div>
    );
  }
  return (
    <div className="relative w-full overflow-hidden bg-[#ffe4ef]">
      <img
        src={purikuraHeader}
        alt="ここあとらてが並んだプリクラ風ヘッダー"
        className="aspect-[2304/1008] w-full object-cover"
      />
      <span className="absolute bottom-3 left-3 flex items-center gap-1 rounded-full bg-white/88 px-2.5 py-1 text-[11px] font-bold text-[#b03a6b] shadow-sm">
        <HeartIcon size={11} /> ここあ ♡ らて <SparkleIcon size={11} />
      </span>
      <span className="absolute bottom-3 right-3 rounded-full bg-black/45 px-2 py-1 text-[10px] font-bold text-white">
        プリクラ風
      </span>
    </div>
  );
}

function formatPostTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (sameDay) return `今日 ${time}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

/* ---------- プレゼンス（そこにいる印） ----------
   Discord のオンライン表示の ここあ版。
   日中（07:00〜22:59 JST）は 💚、夜（23:00〜06:59 JST）は 🌙 お休み中。
   保存はせず、開くたび・1分ごとに現在時刻（Asia/Tokyo）から計算する。
   URL の ?simHour=0-23 は時刻シミュレーション用（検証用）。 */

function simulatedHour(): number | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("simHour");
  if (raw == null) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) || n < 0 || n > 23 ? null : n;
}

function tokyoHourNow(): number {
  const sim = simulatedHour();
  if (sim != null) return sim;
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    hour: "numeric",
    hour12: false,
  }).format(new Date());
  const parsed = Number.parseInt(hour, 10);
  return Number.isNaN(parsed) ? new Date().getHours() : parsed % 24;
}

function usePresence(): { night: boolean } {
  const [hour, setHour] = useState<number>(() => tokyoHourNow());
  useEffect(() => {
    const update = () => setHour(tokyoHourNow());
    update();
    const id = window.setInterval(update, 60_000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return { night: hour >= 23 || hour < 7 };
}

/** アイコンの端に重ねる小さなプレゼンスバッジ（💚 オンライン / 🌙 お休み中） */
function PresenceBadge({
  night,
  borderColor = "var(--bg)",
}: {
  night: boolean;
  borderColor?: string;
}) {
  return (
    <span
      role="img"
      aria-label={night ? "お休み中" : "オンライン"}
      title={night ? "お休み中" : "オンライン"}
      className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--surface)] text-[11px] leading-none shadow"
      style={{ border: `2px solid ${borderColor}` }}
    >
      {night ? "🌙" : "💚"}
    </span>
  );
}

/* ---------- 読み上げ・音声再生（アプリ共有の再生オーナー） ----------
   音声ファイルの再生も 端末の読み上げ（speechSynthesis）も、
   再生はアプリ全体で同時に1つだけ。どれか鳴り始めたら他は止まり、
   「再生中」の表示は このオーナーの状態だけを見て決まる。
   画面切り替え・アンマウント時は stopAllPlayback() で止める。 */

let currentPlayingId: string | null = null;
let currentAudio: HTMLAudioElement | null = null;
const playbackListeners = new Set<() => void>();

function notifyPlayback() {
  playbackListeners.forEach((fn) => fn());
}

function setPlayingId(id: string | null) {
  if (currentPlayingId === id) return;
  currentPlayingId = id;
  notifyPlayback();
}

function stopAllPlayback() {
  if (currentAudio) {
    const audio = currentAudio;
    currentAudio = null;
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  setPlayingId(null);
}

function usePlayingId(): string | null {
  const [id, setId] = useState<string | null>(currentPlayingId);
  useEffect(() => {
    const fn = () => setId(currentPlayingId);
    playbackListeners.add(fn);
    fn();
    return () => {
      playbackListeners.delete(fn);
    };
  }, []);
  return id;
}

/** 端末の日本語ボイスから、女性・高めに聞こえる声を優先して選ぶ */
function pickJaVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return null;
  }
  const voices = window.speechSynthesis.getVoices();
  const ja = voices.filter((v) =>
    v.lang.toLowerCase().replace(/_/g, "-").startsWith("ja"),
  );
  if (ja.length === 0) return null;
  const hints = [
    "kyoko",
    "o-ren",
    "oren",
    "haruka",
    "nanami",
    "aoi",
    "female",
    "woman",
    "女",
  ];
  const preferred = ja.find((v) => {
    const name = v.name.toLowerCase();
    return hints.some((h) => name.includes(h));
  });
  return preferred ?? ja[0] ?? null;
}

/** 端末読み上げで1行読む（他で再生中なら先に止める） */
function speakLine(id: string, text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  stopAllPlayback();
  const utterance = new SpeechSynthesisUtterance(sanitizeForSpeech(text));
  utterance.lang = "ja-JP";
  utterance.pitch = 1.25;
  utterance.rate = 1.0;
  const voice = pickJaVoice();
  if (voice) utterance.voice = voice;
  const finish = () => {
    if (currentPlayingId === id) setPlayingId(null);
  };
  utterance.onend = finish;
  utterance.onerror = finish;
  setPlayingId(id);
  window.speechSynthesis.speak(utterance);
}

/**
 * 音声ファイル（ここあ の録音ボイス）を再生する。
 * 読み込み・再生に失敗したら、その行の端末読み上げにフォールバックする。
 */
function playAudioLine(id: string, src: string, fallbackText: string) {
  stopAllPlayback();
  const audio = new Audio(src);
  currentAudio = audio;
  setPlayingId(id);
  audio.onended = () => {
    if (currentAudio === audio) currentAudio = null;
    if (currentPlayingId === id) setPlayingId(null);
  };
  const fail = () => {
    if (currentAudio !== audio) return; // 別のに切り替わった後の失敗は無視
    currentAudio = null;
    if (currentPlayingId === id) speakLine(id, fallbackText);
  };
  audio.onerror = fail;
  audio.play().catch(fail);
}

function formatDurationLabel(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** ここあ のセリフに付く小さな読み上げボタン（再生/停止トグル） */
function SpeakButton({
  id,
  text,
  className = "",
}: {
  id: string;
  text: string;
  className?: string;
}) {
  const playingId = usePlayingId();
  const playing = playingId === id;
  const toggle = (event?: { stopPropagation: () => void }) => {
    // 投稿カードの中で使われても、カードのタップ（会話開始）に伝播させない
    event?.stopPropagation();
    if (playing) {
      stopAllPlayback();
      return;
    }
    // 録音のあるセリフ（対応表は voiceLines.ts）は ビィ の録音を優先。
    // 読み込み失敗時は playAudioLine が端末読み上げにフォールバックする。
    const recorded = recordedVoiceFor(text);
    if (recorded) playAudioLine(id, recorded, text);
    else speakLine(id, text);
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={playing ? "読み上げを止める" : "このセリフを読み上げる"}
      title={playing ? "読み上げを止める" : "読み上げ"}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)] active:opacity-70 ${className}`}
    >
      {playing ? <StopIcon /> : <PlayIcon />}
    </button>
  );
}

/* ---------- 音声メッセージ ---------- */

function VoiceBubble({
  id,
  duration,
  transcript,
  audio,
}: {
  id: string;
  duration: string;
  transcript: string;
  audio: string;
}) {
  const playingId = usePlayingId();
  const playing = playingId === id;
  const [durationLabel, setDurationLabel] = useState(duration);

  // 長さ表示は実際の音声ファイルの長さに合わせる
  useEffect(() => {
    const probe = new Audio();
    probe.preload = "metadata";
    const onMeta = () => {
      if (Number.isFinite(probe.duration) && probe.duration > 0) {
        setDurationLabel(formatDurationLabel(probe.duration));
      }
    };
    probe.addEventListener("loadedmetadata", onMeta);
    probe.src = audio;
    return () => {
      probe.removeEventListener("loadedmetadata", onMeta);
    };
  }, [audio]);

  const toggle = () => {
    if (playing) stopAllPlayback();
    else playAudioLine(id, audio, transcript);
  };

  return (
    <div>
      <div className="flex items-center gap-3 rounded-3xl rounded-tl-md bg-[var(--bubble-in)] px-3.5 py-2.5 shadow-sm">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "音声メッセージを止める" : `音声メッセージを再生（${durationLabel}）`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white"
        >
          {playing ? <StopIcon /> : <PlayIcon />}
        </button>
        <div className="flex items-end gap-[3px]" aria-hidden="true">
          {[10, 18, 13, 22, 15, 20, 11, 17, 12].map((height, i) => (
            <span
              key={i}
              className={`w-[3px] rounded-full bg-[var(--accent)] ${playing ? "cocoa-wave-bar" : "opacity-50"}`}
              style={{
                height: `${height}px`,
                animationDelay: playing ? `${i * 90}ms` : undefined,
              }}
            />
          ))}
        </div>
        <span className="text-sm text-[var(--dim)]">{durationLabel}</span>
      </div>
      <p className="mt-1.5 max-w-[240px] pl-1 text-xs leading-relaxed text-[var(--dim)]">
        {transcript}
      </p>
    </div>
  );
}

/* ---------- ここあ プロフィール（アイコンタップで開く） ---------- */

function CocoaProfileSheet({
  open,
  onClose,
  onGoTalk,
}: {
  open: boolean;
  onClose: () => void;
  onGoTalk: () => void;
}) {
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const { night } = usePresence();

  const frames = [
    { src: cocoaAvatar, alt: "うさ耳のここあ", caption: "やっほー♡ここあだよ" },
    { src: cocoaSelfieTea, alt: "お茶のマグを持つここあ", caption: "お茶、入れたよ。ふーふーしてね" },
    { src: cocoaWinterWindow, alt: "窓のそばで雪を眺めるここあ", caption: "窓際がいちばん好きな場所" },
  ] as const;

  useEffect(() => {
    if (!open) return;
    setFrame(0);
    setPlaying(true);
  }, [open ]);

  useEffect(() => {
    if (!open || !playing) return;
    const id = window.setInterval(() => {
      setFrame((v) => (v + 1) % frames.length);
    }, 2800);
    return () => window.clearInterval(id);
    // frames.length は固定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, playing]);

  if (!open) return null;
  const current = frames[frame] ?? frames[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 backdrop-blur-[2px] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="ここあのプロフィール"
      onClick={onClose}
    >
      <div
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-[var(--surface)] shadow-2xl sm:rounded-[28px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ちょっと動く動画エリア */}
        <div className="relative overflow-hidden bg-[#ffe4ef]">
          <div className="relative aspect-[4/3] w-full overflow-hidden">
            {/* メインの動く映像：3枚が ゆっくり切り替わりながら ズームする */}
            <div key={frame} className="absolute inset-0">
              <img
                src={current.src}
                alt={current.alt}
                className="cocoa-kenburns h-full w-full object-cover"
              />
            </div>
            {/* ふわふわ浮くデコ */}
            <span className="cocoa-float-a absolute left-[8%] top-[10%] drop-shadow" aria-hidden="true">
              <SparkleIcon size={22} color="#fff" />
            </span>
            <span className="cocoa-float-b absolute right-[12%] top-[14%]" aria-hidden="true">
              <HeartIcon size={18} color="#fff" />
            </span>
            <span className="cocoa-float-c absolute bottom-[22%] left-[14%]" aria-hidden="true">
              <HeartIcon size={14} color="#ffd6e7" />
            </span>
            <span className="cocoa-float-b absolute bottom-[28%] right-[8%]" aria-hidden="true">
              <SparkleIcon size={16} color="#fff" />
            </span>

            {/* 小さく はねる アバター */}
            <div className="absolute bottom-[74px] left-3 flex items-end gap-2">
              <span className="relative inline-block shrink-0">
                <img
                  src={cocoaAvatar}
                  alt=""
                  className="cocoa-bob h-14 w-14 rounded-full border-[3px] border-white object-cover shadow-lg"
                />
                <PresenceBadge night={night} borderColor="#ffffff" />
              </span>
              <div className="mb-1 rounded-2xl rounded-bl-md bg-white/95 px-3 py-1.5 text-[13px] font-bold leading-tight text-[#3d2c33] shadow">
                {current.caption}
              </div>
            </div>

            {/* 上部バッジ + 閉じる */}
            <div className="absolute left-3 top-3 flex items-center gap-1.5">
              <span className="flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-bold text-white">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ff6b9d] opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#ff6b9d]" />
                </span>
                ちょっと動くよ
              </span>
              <span className="rounded-full bg-white/90 px-2 py-1 text-[11px] font-bold text-[#b03a6b]">GIF風</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="プロフィールを閉じる"
              className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-lg leading-none text-white active:bg-black/70"
            >
              ×
            </button>

            {/* 再生コントロール風バー */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/45 to-transparent px-3 pb-2.5 pt-6">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setPlaying((v) => !v)}
                  aria-label={playing ? "動画を一時停止" : "動画を再生"}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[#3d2c33] shadow"
                >
                  {playing ? (
                    <span className="flex gap-[3px]" aria-hidden="true"><span className="block h-3.5 w-[3px] rounded bg-current" /><span className="block h-3.5 w-[3px] rounded bg-current" /></span>
                  ) : (
                    <PlayIcon />
                  )}
                </button>
                <div className="flex flex-1 items-end gap-[3px]" aria-hidden="true">
                  {[14, 22, 10, 18, 24, 12, 20, 9, 16, 21, 11, 19].map((h, i) => (
                    <span
                      key={i}
                      className="cocoa-wave-bar w-[3px] rounded-full bg-white/90"
                      style={{ height: `${h}px`, animationDelay: `${i * 90}ms`, animationPlayState: playing ? "running" : "paused" }}
                    />
                  ))}
                </div>
                <span className="text-[11px] font-bold tabular-nums text-white">0:0{frame * 3 + 1} / 0:08</span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/35">
                <div key={`${frame}-${playing ? "p" : "s"}`} className="cocoa-progress-bar h-full rounded-full bg-white" style={{ animationPlayState: playing ? "running" : "paused" }} />
              </div>
              <div className="mt-2 flex gap-1.5" role="tablist" aria-label="動画のシーン切り替え">
                {frames.map((f, i) => (
                  <button
                    key={i}
                    type="button"
                    role="tab"
                    aria-selected={frame === i}
                    aria-label={`シーン${i + 1}：${f.caption}`}
                    onClick={() => setFrame(i)}
                    className={`h-1.5 flex-1 rounded-full transition ${frame === i ? "bg-white" : "bg-white/40"}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 簡易プロフィール */}
        <div className="px-5 pb-6 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-1.5 text-[22px] font-bold leading-tight text-[var(--text)]">
                ここあ <HeartIcon size={14} /> <SparkleIcon size={14} />
              </h2>
              <p className="mt-0.5 text-sm text-[var(--dim)]">@cocoa_usamimi ・ うさ耳の女の子</p>
            </div>
            <span className="flex shrink-0 flex-col items-end gap-1">
              <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-bold text-[var(--accent)]">そこにいる子</span>
              <span className="rounded-full bg-[var(--surface-alt)] px-3 py-1 text-[11px] font-bold text-[var(--dim)]">
                {night ? "🌙 お休み中" : "💚 オンライン"}
              </span>
            </span>
          </div>

          <p className="mt-3 text-[15px] leading-relaxed text-[var(--text)]">
            {"そこにいるだけの子。ときどきつぶやきます。朝は東京のお天気、昼は流行りものやグルメや豆知識、夕方はおでかけやアンテナショップの話題をお届けするよ♡"}
          </p>

          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-2xl bg-[var(--surface-alt)] px-3.5 py-3">
              <dt className="text-[11px] font-bold tracking-wide text-[var(--dim)]">すきなもの</dt>
              <dd className="mt-1 font-bold leading-snug text-[var(--text)]">温かいお茶<br />窓際・雪</dd>
            </div>
            <div className="rounded-2xl bg-[var(--surface-alt)] px-3.5 py-3">
              <dt className="text-[11px] font-bold tracking-wide text-[var(--dim)]">スタイル</dt>
              <dd className="mt-1 font-bold leading-snug text-[var(--text)]">JK風デコ<br />ハート柄・ピンク</dd>
            </div>
            <div className="rounded-2xl bg-[var(--surface-alt)] px-3.5 py-3">
              <dt className="text-[11px] font-bold tracking-wide text-[var(--dim)]">チャームポイント</dt>
              <dd className="mt-1 font-bold leading-snug text-[var(--text)]">たれうさ耳<br />ハートのチョーカー</dd>
            </div>
            <div className="rounded-2xl bg-[var(--surface-alt)] px-3.5 py-3">
              <dt className="text-[11px] font-bold tracking-wide text-[var(--dim)]">いまの気分</dt>
              <dd className="mt-1 font-bold leading-snug text-[var(--text)]">おふとんで<br />まるくなりたい</dd>
            </div>
          </dl>

          <p className="mt-3 text-sm text-[var(--dim)]">
            <span className="font-bold text-[var(--text)]">3</span> フォロー中
            <span className="ml-4 font-bold text-[var(--text)]">1</span> フォロワー
            <span className="ml-4">毎日3回つぶやくよ</span>
          </p>

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => { onClose(); onGoTalk(); }}
              className="flex-1 rounded-full bg-[var(--accent)] py-3 text-sm font-bold text-white shadow-sm active:opacity-85"
            >
              トークする
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-full border border-[var(--border)] bg-[var(--surface)] py-3 text-sm font-bold text-[var(--text)]"
            >
              とじる
            </button>
          </div>
          <p className="mt-3 text-center text-[11px] leading-relaxed text-[var(--dim)]">
            アイコンをタップすると、いつでもこのプロフィールが開くよ
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------- らて プロフィール（アイコンタップで開く） ---------- */

function LatteProfileSheet({
  open,
  onClose,
  onGoCocoa,
}: {
  open: boolean;
  onClose: () => void;
  onGoCocoa: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 backdrop-blur-[2px] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="らてのプロフィール"
      onClick={onClose}
    >
      <div
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-[var(--surface)] shadow-2xl sm:rounded-[28px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="relative h-20 overflow-hidden"
          aria-hidden="true"
          style={{
            background:
              "linear-gradient(120deg, var(--deco-lemon) 0%, var(--deco-pink) 60%, var(--deco-lav) 100%)",
          }}
        >
          <span className="absolute left-[14%] top-3 rotate-12 opacity-80">
            <SparkleIcon size={16} color="#ffffff" />
          </span>
          <span className="absolute right-[18%] top-4 -rotate-12 opacity-75">
            <HeartIcon size={15} color="#ffffff" />
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="プロフィールを閉じる"
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-lg leading-none text-white active:bg-black/70"
          >
            ×
          </button>
        </div>
        <div className="px-5 pb-6">
          <div className="-mt-10 flex items-end justify-between">
            <img
              src={latteIcon}
              alt="らて"
              className="relative h-20 w-20 rounded-full border-4 border-[var(--surface)] object-cover shadow"
            />
            <span className="mb-1 shrink-0 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-bold text-[var(--accent)]">
              ラテ担当 ☕
            </span>
          </div>
          <h2 className="mt-2 flex items-center gap-1.5 text-[22px] font-bold leading-tight text-[var(--text)]">
            {USER_NAME} <HeartIcon size={14} /> <SparkleIcon size={14} />
          </h2>
          <p className="mt-0.5 text-sm text-[var(--dim)]">
            {USER_HANDLE} ・ ここあと同じおうち
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-[var(--text)]">
            {USER_BIO}
          </p>

          <div className="mt-4 rounded-2xl bg-[var(--surface-alt)] px-3.5 py-3">
            <p className="text-[11px] font-bold tracking-wide text-[var(--dim)]">
              つながってる子
            </p>
            <button
              type="button"
              onClick={() => { onClose(); onGoCocoa(); }}
              aria-label="ここあのプロフィールを見る"
              className="mt-2 flex w-full items-center gap-3 text-left"
            >
              <img
                src={cocoaAvatar}
                alt=""
                className="h-10 w-10 rounded-full object-cover ring-2 ring-[var(--deco-pink)]"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-[var(--text)]">
                  ここあ
                </span>
                <span className="block text-xs text-[var(--dim)]">
                  @cocoa_usamimi ・ おたがいフォロー中
                </span>
              </span>
              <span className="text-xs font-bold text-[var(--accent)]">
                プロフィール →
              </span>
            </button>
          </div>

          <p className="mt-3 text-sm text-[var(--dim)]">
            <span className="font-bold text-[var(--text)]">1</span> フォロー中
            <span className="ml-4 font-bold text-[var(--text)]">1</span> フォロワー
            <span className="ml-4">おうちはここあとおそろい</span>
          </p>

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-full bg-[var(--accent)] py-3 text-sm font-bold text-white shadow-sm active:opacity-85"
            >
              とじる
            </button>
          </div>
          <p className="mt-3 text-center text-[11px] leading-relaxed text-[var(--dim)]">
            名前とアイコンは、ここあがらてのために考えてくれたものだよ♡
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------- トーク一覧 ---------- */

function TalkList({
  unread,
  posts,
  chatPreview,
  onOpenRoom,
  onAvatarTap,
}: {
  unread: number;
  posts: AutoPost[];
  chatPreview: { text: string; time: string } | null;
  onOpenRoom: () => void;
  onAvatarTap: () => void;
}) {
  const { night } = usePresence();
  const latest = posts[0];
  const preview = chatPreview ? chatPreview.text : latest ? latest.text : PREVIEW_LINE;
  const previewTime = chatPreview
    ? chatPreview.time
    : latest
      ? new Date(latest.created_at).toLocaleTimeString("ja-JP", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "08:12";
  return (
    <div className="flex-1 overflow-y-auto">
      <PurikuraHeaderBanner variant="full" />
      <div
        className="h-1.5"
        aria-hidden="true"
        style={{
          background:
            "repeating-linear-gradient(90deg, var(--deco-pink) 0 26px, var(--deco-lemon) 26px 52px, var(--deco-sky) 52px 78px, var(--deco-mint) 78px 104px, var(--deco-lav) 104px 130px)",
        }}
      />
      <header className="pt-safe sticky top-0 z-10 bg-[var(--bg)] px-5 pb-2">
        <h1 className="flex items-center gap-1.5 pt-3 text-2xl font-bold text-[var(--text)]">
          トーク
          <SparkleIcon size={16} />
          <HeartIcon size={14} />
        </h1>
      </header>
      <button
        type="button"
        onClick={onOpenRoom}
        aria-label="ここあ とのトークを開く"
        className="flex w-full items-center gap-3.5 px-5 py-3 text-left active:bg-[var(--surface-alt)]"
      >
        <span className="relative shrink-0">
          <span
            role="button"
            tabIndex={0}
            aria-label="ここあのプロフィールを見る"
            onClick={(e) => { e.stopPropagation(); onAvatarTap(); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onAvatarTap(); } }}
            className="block cursor-pointer rounded-full focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          >
            <img
              src={cocoaAvatar}
              alt="ここあ"
              className="h-14 w-14 rounded-full object-cover ring-2 ring-[var(--deco-pink)] ring-offset-2 ring-offset-[var(--bg)]"
            />
          </span>
          <PresenceBadge night={night} />
          <span className="absolute -left-1.5 -top-1.5 -rotate-12">
            <SparkleIcon size={15} />
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="flex items-center gap-1 text-base font-bold text-[var(--text)]">
              ここあ
              <HeartIcon size={11} />
              <span className="text-[11px] font-bold text-[var(--dim)]">
                {night ? "お休み中" : "オンライン"}
              </span>
            </span>
            <span className="shrink-0 text-xs text-[var(--dim)]">{previewTime}</span>
          </span>
          <span className="mt-0.5 flex items-start justify-between gap-2">
            <span className="line-clamp-2 text-sm leading-snug text-[var(--dim)]">
              {preview}
            </span>
            {unread > 0 && (
              <span className="mt-0.5 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#f0564f] px-1.5 text-xs font-bold text-white">
                {unread}
              </span>
            )}
          </span>
        </span>
      </button>
      <p className="flex items-center gap-1.5 px-5 pt-3 text-xs text-[var(--dim)]">
        <span aria-hidden="true">{night ? "🌙" : "💚"}</span>
        {night
          ? "いまはお休み中。話しかけると、ねむいけど起きてお返事するよ"
          : "いま起きてるよ。トークで話しかけると、ここあがその場でお返事するよ"}
      </p>
      <p className="px-5 pt-1.5 text-xs text-[var(--dim)]">
        アイコンをタップすると、ここあのプロフィールとちょっと動く動画が見れるよ♡
      </p>
      <div className="px-5 pt-4">
        <a
          href="../kokoadaiari/"
          aria-label="ここあダイアリーを開く"
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 text-sm font-bold text-[var(--accent)] shadow-sm active:bg-[var(--surface-alt)]"
        >
          <span aria-hidden="true">📖</span>
          今日のダイアリー
          <span aria-hidden="true" className="text-[var(--dim)]">›</span>
        </a>
        <p className="pt-1.5 text-xs text-[var(--dim)]">
          ダイアリーのここあと、ここのここあは同じ文脈だよ
        </p>
      </div>
    </div>
  );
}

/* ---------- トークルーム ---------- */

function TalkRoom({
  userMessages,
  cocoaReplies,
  weatherPost,
  activeTopic,
  startingTopic,
  onBack,
  onAvatarTap,
}: {
  userMessages: UserMessage[];
  cocoaReplies: CocoaReply[];
  weatherPost: AutoPost | null;
  activeTopic: AppState["activeTopic"];
  startingTopic: boolean;
  onBack: () => void;
  onAvatarTap: () => void;
}) {
  const queryClient = useQueryClient();
  const { night } = usePresence();
  const [draft, setDraft] = useState("");
  const [timedOut, setTimedOut] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const send = useMutation({
    mutationFn: async (text: string) => {
      // サーバーからの応答が戻らないまま「入力中」が固まらないよう、
      // クライアント側でも上限時間を設ける
      let timer = 0;
      const timeout = new Promise<never>((_, reject) => {
        timer = window.setTimeout(
          () => reject(new Error("reply-timeout")),
          40000,
        );
      });
      try {
        // ?simHour が付いているときだけ、夜モード検証用にサーバーへ渡す
        const sim = simulatedHour();
        return await Promise.race([
          api.sendMessage(sim != null ? { text, simulateHour: sim } : { text }),
          timeout,
        ]);
      } finally {
        window.clearTimeout(timer);
      }
    },
    onMutate: async (text: string) => {
      // 自分の吹き出しは、サーバーの応答を待たずに すぐ表示する
      setTimedOut(false);
      await queryClient.cancelQueries({ queryKey: ["cocoa-state"] });
      const prev = queryClient.getQueryData<AppState>(["cocoa-state"]);
      if (prev) {
        queryClient.setQueryData<AppState>(["cocoa-state"], {
          ...prev,
          userMessages: [
            ...prev.userMessages,
            {
              id: -Date.now(),
              text,
              created_at: new Date().toISOString(),
            },
          ],
        });
      }
      return { prev };
    },
    onSuccess: () => {
      setDraft("");
      void queryClient.invalidateQueries({ queryKey: ["cocoa-state"] });
    },
    onError: (error, _text, context) => {
      // サーバー側では保存できていることがあるので、楽観表示を戻したうえで
      // 最新の状態を取り直して同期する
      if (context?.prev) {
        queryClient.setQueryData<AppState>(["cocoa-state"], context.prev);
      }
      const isTimeout =
        error instanceof Error && error.message === "reply-timeout";
      setTimedOut(isTimeout);
      void queryClient.invalidateQueries({ queryKey: ["cocoa-state"] });
      if (isTimeout) {
        // 時間切れでも裏で お返事が保存されている場合があるので、
        // 少し置いてもう一度取り直す
        window.setTimeout(() => {
          void queryClient.invalidateQueries({ queryKey: ["cocoa-state"] });
        }, 15000);
      }
    },
  });

  type ChatLine =
    | { key: string; who: "user"; text: string; created_at: string; sort: number }
    | { key: string; who: "cocoa"; text: string; created_at: string; sort: number };
  const chatTimeline: ChatLine[] = [
    ...userMessages.map(
      (m): ChatLine => ({
        key: `u-${m.id}`,
        who: "user",
        text: m.text,
        created_at: m.created_at,
        sort: new Date(m.created_at).getTime(),
      }),
    ),
    ...cocoaReplies.map(
      (r): ChatLine => ({
        key: `c-${r.id}`,
        who: "cocoa",
        text: r.text,
        created_at: r.created_at,
        sort: new Date(r.created_at).getTime(),
      }),
    ),
  ].sort((a, b) => a.sort - b.sort || (a.who === "user" ? -1 : 1));

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatTimeline.length, send.isPending, startingTopic]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || send.isPending) return;
    send.mutate(text);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--chat-bg)]">
      <header className="pt-safe sticky top-0 z-10 flex items-center gap-1 border-b border-[var(--border)] bg-[var(--surface)] px-2 pb-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="トーク一覧へ戻る"
          className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--text)] active:bg-[var(--surface-alt)]"
        >
          <BackIcon />
        </button>
        <button
          type="button"
          onClick={onAvatarTap}
          aria-label="ここあのプロフィールを見る"
          className="relative shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        >
          <img
            src={cocoaAvatar}
            alt=""
            className="h-9 w-9 rounded-full object-cover"
          />
          <PresenceBadge night={night} borderColor="var(--surface)" />
        </button>
        <button
          type="button"
          onClick={onAvatarTap}
          aria-label="ここあのプロフィールを見る"
          className="ml-1.5 min-w-0 text-left"
        >
          <p className="text-base font-bold leading-tight text-[var(--text)]">ここあ</p>
          <p className="flex items-center gap-1 text-xs leading-tight text-[var(--dim)]">
            <span aria-hidden="true">{night ? "🌙" : "💚"}</span>
            {send.isPending
              ? night
                ? "ねむそうに入力中…"
                : "入力中…"
              : night
                ? "お休み中 ・ 呼ぶと起きるよ"
                : "オンライン ・ お返事するよ"}
          </p>
        </button>
      </header>
      <PurikuraHeaderBanner variant="compact" />

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mb-4 flex justify-center">
          <span className="rounded-full bg-black/15 px-3 py-1 text-xs text-white">
            今日
          </span>
        </div>

        {activeTopic && (
          <div className="mx-auto mb-4 flex max-w-[320px] items-center gap-1.5 rounded-full bg-[var(--surface)] px-3 py-1.5 text-xs font-bold text-[var(--accent)] shadow-sm">
            <span aria-hidden="true">💬</span>
            <span className="min-w-0 truncate">
              いまの話題：{activeTopic.topic ?? activeTopic.text}
            </span>
          </div>
        )}

        <div className="flex flex-col gap-3.5">
          {COCOA_MESSAGES.map((message, index) => (
            <div key={index} className="flex items-start gap-2">
              <button type="button" onClick={onAvatarTap} aria-label="ここあのプロフィールを見る" className="mt-0.5 shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
                <img src={cocoaAvatar} alt="" className="h-9 w-9 rounded-full object-cover" />
              </button>
              <div className="flex min-w-0 items-end gap-1.5">
                <div className="min-w-0">
                  {message.kind === "text" && (
                    <div className="flex items-end gap-1.5">
                      <div className="max-w-[260px] rounded-3xl rounded-tl-md bg-[var(--bubble-in)] px-3.5 py-2.5 text-[15px] leading-relaxed text-[var(--text)] shadow-sm">
                        {message.text}
                      </div>
                      <SpeakButton id={`talk-fixed-${index}`} text={message.text} />
                    </div>
                  )}
                  {message.kind === "voice" && (
                    <VoiceBubble
                      id={`talk-voice-${index}`}
                      duration={message.duration}
                      transcript={message.transcript}
                      audio={message.audio}
                    />
                  )}
                  {message.kind === "selfie" && (
                    <div>
                      <img
                        src={cocoaSelfieTea}
                        alt="お茶のマグを持つここあの自撮り"
                        className="w-[220px] rounded-3xl rounded-tl-md object-cover shadow-sm"
                      />
                      <div className="mt-1.5 flex items-end gap-1.5">
                        <div className="max-w-[240px] rounded-3xl rounded-tl-md bg-[var(--bubble-in)] px-3.5 py-2.5 text-[15px] leading-relaxed text-[var(--text)] shadow-sm">
                          {message.caption}
                        </div>
                        <SpeakButton id={`talk-selfie-${index}`} text={message.caption} />
                      </div>
                    </div>
                  )}
                </div>
                <span className="shrink-0 pb-0.5 text-[11px] text-[var(--dim)]">
                  {message.time}
                </span>
              </div>
            </div>
          ))}

          {weatherPost && (
            <div className="flex items-start gap-2">
              <button type="button" onClick={onAvatarTap} aria-label="ここあのプロフィールを見る" className="mt-0.5 shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
                <img src={cocoaAvatar} alt="" className="h-9 w-9 rounded-full object-cover" />
              </button>
              <div className="flex min-w-0 items-end gap-1.5">
                <div className="min-w-0">
                  <span
                    className="mb-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
                    style={{
                      background: KIND_BADGE.weather.bg,
                      color: KIND_BADGE.weather.fg,
                    }}
                  >
                    東京のお天気
                  </span>
                  <div className="flex items-end gap-1.5">
                    <div className="max-w-[260px] rounded-3xl rounded-tl-md border-2 border-dashed border-[var(--deco-lemon)] bg-[var(--bubble-in)] px-3.5 py-2.5 text-[15px] leading-relaxed text-[var(--text)] shadow-sm">
                      {weatherPost.text}
                    </div>
                    <SpeakButton id={`talk-weather-${weatherPost.id}`} text={weatherPost.text} />
                  </div>
                  {weatherPost.source_title && (
                    <p className="mt-1 pl-1 text-[11px] text-[var(--dim)]">
                      出典：{weatherPost.source_title}
                    </p>
                  )}
                </div>
                <span className="shrink-0 pb-0.5 text-[11px] text-[var(--dim)]">
                  {new Date(weatherPost.created_at).toLocaleTimeString("ja-JP", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
          )}

          {chatTimeline.map((line) =>
            line.who === "user" ? (
              <div key={line.key} className="flex items-end justify-end gap-1.5">
                <span className="shrink-0 pb-0.5 text-[11px] text-[var(--dim)]">
                  {new Date(line.created_at).toLocaleTimeString("ja-JP", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <div className="max-w-[260px] rounded-3xl rounded-tr-md bg-[var(--bubble-out)] px-3.5 py-2.5 text-[15px] leading-relaxed text-white shadow-sm">
                  {line.text}
                </div>
              </div>
            ) : (
              <div key={line.key} className="flex items-start gap-2">
                <button type="button" onClick={onAvatarTap} aria-label="ここあのプロフィールを見る" className="mt-0.5 shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
                  <img src={cocoaAvatar} alt="" className="h-9 w-9 rounded-full object-cover" />
                </button>
                <div className="flex min-w-0 items-end gap-1.5">
                  <div className="flex items-end gap-1.5">
                    <div className="max-w-[260px] rounded-3xl rounded-tl-md bg-[var(--bubble-in)] px-3.5 py-2.5 text-[15px] leading-relaxed text-[var(--text)] shadow-sm">
                      {line.text}
                    </div>
                    <SpeakButton id={`talk-reply-${line.key}`} text={line.text} />
                  </div>
                  <span className="shrink-0 pb-0.5 text-[11px] text-[var(--dim)]">
                    {new Date(line.created_at).toLocaleTimeString("ja-JP", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            ),
          )}

          {(send.isPending || startingTopic) && (
            <div className="flex items-start gap-2" aria-live="polite">
              <button type="button" onClick={onAvatarTap} aria-label="ここあのプロフィールを見る" className="mt-0.5 shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
                <img src={cocoaAvatar} alt="" className="h-9 w-9 rounded-full object-cover" />
              </button>
              <div className="flex items-center gap-1.5 rounded-3xl rounded-tl-md bg-[var(--bubble-in)] px-4 py-3 shadow-sm">
                <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--accent)] [animation-delay:0ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--accent)] [animation-delay:150ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--accent)] [animation-delay:300ms]" />
                <span className="ml-1 text-xs text-[var(--dim)]">{night ? "ここあがねむそうに入力中…" : "ここあが入力中…"}</span>
              </div>
            </div>
          )}
        </div>

        {chatTimeline.length === 0 && !send.isPending && !startingTopic && (
          <p className="mx-auto mt-5 max-w-[280px] text-center text-xs leading-relaxed text-[var(--dim)]">
            下の入力欄から話しかけてみてね。ここあがお返事するよ
          </p>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="pb-safe sticky bottom-0 border-t border-[var(--border)] bg-[var(--surface)] px-3 pt-2"
      >
        <div className="flex items-center gap-2 pb-2">
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="メッセージを入力"
            aria-label="ここあへのメッセージ"
            className="min-w-0 flex-1 rounded-full border border-[var(--border)] bg-[var(--surface-alt)] px-4 py-2.5 text-[15px] text-[var(--text)] outline-none placeholder:text-[var(--dim)] focus:border-[var(--accent)]"
          />
          <button
            type="submit"
            disabled={!draft.trim() || send.isPending}
            aria-label="メッセージを送信"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white disabled:opacity-35"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 11.5 20 3.8l-4.6 16.4-3.9-6.9L4 11.5Z" fill="currentColor" />
            </svg>
          </button>
        </div>
        {send.isPending && (
          <p className="pb-2 text-center text-xs text-[var(--dim)]">
            {night
              ? "ここあがねむいなかお返事を考えてるよ…"
              : "ここあがお返事を考えてるよ…"}
          </p>
        )}
        {send.isError && (
          <p className="pb-2 text-center text-xs text-[#d14d68]">
            {timedOut
              ? "お返事が遅れちゃったみたい…少し待つと届くかも。届かなかったらもう一度試してね"
              : "おくれなかった…もう一度試してね"}
          </p>
        )}
      </form>
    </div>
  );
}

/* ---------- タイムライン ---------- */

function Timeline({
  posts,
  userPosts,
  onAvatarTap,
  onUserAvatarTap,
  onPostTap,
}: {
  posts: AutoPost[];
  userPosts: UserPost[];
  onAvatarTap: () => void;
  onUserAvatarTap: () => void;
  onPostTap: (info: PostTapInfo) => void;
}) {
  const queryClient = useQueryClient();
  const { night } = usePresence();
  const [tab, setTab] = useState<"posts" | "images">("posts");
  const [composerOpen, setComposerOpen] = useState(false);
  const [draftPost, setDraftPost] = useState("");
  const imagePosts = POSTS.filter((post) => post.image);

  const createPost = useMutation({
    mutationFn: (text: string) => api.createUserPost({ text }),
    onSuccess: () => {
      setDraftPost("");
      setComposerOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["cocoa-state"] });
    },
  });

  const deletePost = useMutation({
    mutationFn: (id: number) => api.deleteUserPost({ id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["cocoa-state"] });
    },
  });

  type FeedItem =
    | { key: string; who: "cocoa"; post: AutoPost; sort: number }
    | { key: string; who: "user"; post: UserPost; sort: number };
  const feed: FeedItem[] = [
    ...posts.map(
      (p): FeedItem => ({
        key: `auto-${p.id}`,
        who: "cocoa",
        post: p,
        sort: new Date(p.created_at).getTime(),
      }),
    ),
    ...userPosts.map(
      (p): FeedItem => ({
        key: `user-${p.id}`,
        who: "user",
        post: p,
        sort: new Date(p.created_at).getTime(),
      }),
    ),
  ].sort((a, b) => b.sort - a.sort);

  const handlePostSubmit = (event: FormEvent) => {
    event.preventDefault();
    const text = draftPost.trim();
    if (!text || createPost.isPending) return;
    createPost.mutate(text);
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
      <PurikuraHeaderBanner variant="timeline" />
      <div className="px-5">
        <div className="-mt-10 flex items-end justify-between">
          <button
            type="button"
            onClick={onAvatarTap}
            aria-label="ここあのプロフィールを見る"
            className="relative shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          >
            <img
              src={cocoaAvatar}
              alt="ここあ"
              className="h-20 w-20 rounded-full border-4 border-[var(--bg)] object-cover"
            />
            <PresenceBadge night={night} />
            <span className="absolute -right-1.5 -top-1 rotate-12">
              <SparkleIcon size={17} />
            </span>
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white">▶ 動くよ</span>
          </button>
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="mb-1 rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-bold text-white shadow-sm active:opacity-80"
          >
            つぶやく
          </button>
        </div>
        <h1 className="mt-2 flex items-center gap-1.5 text-xl font-bold text-[var(--text)]">
          ここあ
          <HeartIcon size={13} />
          <SparkleIcon size={13} />
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-[var(--text)]">
          そこにいるだけの子。ときどきつぶやきます
          <br />
          朝は東京のお天気、昼は流行りもの・グルメ・豆知識など、夕方はおでかけやアンテナショップの話題もお届けするよ♡
          <br />
          ここあの投稿をタップすると、その話題でトークが始まるよ。らてのつぶやきもここに並ぶよ
        </p>
        <p className="mt-2 text-sm text-[var(--dim)]">
          <span className="font-bold text-[var(--text)]">3</span> フォロー中
          <span className="ml-4 font-bold text-[var(--text)]">1</span> フォロワー
        </p>
        <p className="mt-1.5 text-xs text-[var(--dim)]">アイコンをタップで、プロフィールと動くここあが見れるよ</p>
      </div>

      <div
        className="mt-4 flex border-b border-[var(--border)]"
        role="tablist"
        aria-label="プロフィールの表示切り替え"
      >
        {(
          [
            { key: "posts", label: "ポスト" },
            { key: "images", label: "画像" },
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={`relative flex-1 py-3 text-sm font-bold ${
              tab === item.key ? "text-[var(--text)]" : "text-[var(--dim)]"
            }`}
          >
            {item.label}
            {tab === item.key && (
              <span className="absolute inset-x-10 bottom-0 h-[3px] rounded-full bg-[var(--accent)]" />
            )}
          </button>
        ))}
      </div>

      {tab === "posts" && (
        <div className="pb-24">
          {feed.length === 0 && (
            <p className="px-5 py-6 text-center text-sm text-[var(--dim)]">
              まだ投稿がないよ。「つぶやく」から最初の1件を書いてみてね
            </p>
          )}
          {feed.map((item) => {
            if (item.who === "user") {
              const post = item.post as UserPost;
              return (
                <article
                  key={item.key}
                  className="flex gap-3 border-b border-[var(--border)] bg-[var(--accent-soft)]/40 px-5 py-4"
                >
                  <button type="button" onClick={onUserAvatarTap} aria-label="らてのプロフィールを見る" className="h-10 w-10 shrink-0 self-start rounded-full focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
                    <img src={latteIcon} alt="" className="h-10 w-10 rounded-full object-cover" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      <span className="font-bold text-[var(--text)]">{USER_NAME}</span>
                      <span className="text-[var(--dim)]">{USER_HANDLE}</span>
                      <span className="text-[var(--dim)]">
                        · {formatPostTime(post.created_at)}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-[#fde3ee] px-2 py-0.5 text-[11px] font-bold text-[#b03a6b]">
                        ✎ らてのつぶやき
                      </span>
                      <button
                        type="button"
                        onClick={() => deletePost.mutate(post.id)}
                        aria-label="このつぶやきを削除"
                        className="ml-auto text-xs text-[var(--dim)] underline decoration-dotted underline-offset-2"
                      >
                        削除
                      </button>
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--text)]">
                      {post.text}
                    </p>
                  </div>
                </article>
              );
            }
            const post = item.post as AutoPost;
            const badge = KIND_BADGE[post.kind];
            const isApiSource = post.source_url?.includes("api.open-meteo.com");
            return (
              <article
                key={item.key}
                onClick={() =>
                  onPostTap({
                    postId: post.id,
                    text: post.text,
                    kind: post.kind,
                  })
                }
                aria-label={`この投稿についてここあと話す：${post.text}`}
                className="flex cursor-pointer gap-3 border-b border-[var(--border)] px-5 py-4 active:bg-[var(--surface-alt)]"
              >
                <button type="button" onClick={(e) => { e.stopPropagation(); onAvatarTap(); }} aria-label="ここあのプロフィールを見る" className="h-10 w-10 shrink-0 self-start rounded-full focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
                  <img src={cocoaAvatar} alt="" className="h-10 w-10 rounded-full object-cover" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span className="font-bold text-[var(--text)]">ここあ</span>
                    <span className="text-[var(--dim)]">
                      · {formatPostTime(post.created_at)}
                    </span>
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold"
                      style={{ background: badge.bg, color: badge.fg }}
                    >
                      {badge.label}
                    </span>
                    <SpeakButton
                      id={`timeline-auto-${post.id}`}
                      text={post.text}
                      className="ml-auto"
                    />
                  </p>
                  <p className="mt-0.5 text-[15px] leading-relaxed text-[var(--text)]">
                    {post.text}
                  </p>
                  {post.source_title &&
                    (post.source_url && !isApiSource ? (
                      <a
                        href={post.source_url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1.5 block truncate text-xs text-[var(--accent)] underline decoration-dotted underline-offset-2"
                      >
                        出典：{post.source_title}
                      </a>
                    ) : (
                      <p className="mt-1.5 truncate text-xs text-[var(--dim)]">
                        出典：{post.source_title}
                      </p>
                    ))}
                  <p className="mt-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[11px] font-bold text-[var(--accent)]">
                      💬 ここあと話す
                    </span>
                  </p>
                </div>
              </article>
            );
          })}
          {POSTS.map((post) => (
            <article
              key={post.id}
              onClick={() =>
                onPostTap({ text: post.text, topic: post.text, kind: "static" })
              }
              aria-label={`この投稿についてここあと話す：${post.text}`}
              className="flex cursor-pointer gap-3 border-b border-[var(--border)] px-5 py-4 active:bg-[var(--surface-alt)]"
            >
              <button type="button" onClick={(e) => { e.stopPropagation(); onAvatarTap(); }} aria-label="ここあのプロフィールを見る" className="h-10 w-10 shrink-0 self-start rounded-full focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
                <img src={cocoaAvatar} alt="" className="h-10 w-10 rounded-full object-cover" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm">
                  <span className="font-bold text-[var(--text)]">ここあ</span>
                  <span className="text-[var(--dim)]">· {post.timeLabel}</span>
                  <SpeakButton
                    id={`timeline-static-${post.id}`}
                    text={post.text}
                    className="ml-auto"
                  />
                </p>
                <p className="mt-0.5 text-[15px] leading-relaxed text-[var(--text)]">
                  {post.text}
                </p>
                {post.image && (
                  <img
                    src={post.image}
                    alt={post.imageAlt ?? ""}
                    className="mt-2.5 w-full rounded-2xl object-cover"
                  />
                )}
                <p className="mt-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[11px] font-bold text-[var(--accent)]">
                    💬 ここあと話す
                  </span>
                </p>
              </div>
            </article>
          ))}
        </div>
      )}

      {tab === "images" && (
        <div className="grid grid-cols-2 gap-1.5 p-1.5 pb-24">
          {imagePosts.map((post) => (
            <img
              key={post.id}
              src={post.image}
              alt={post.imageAlt ?? ""}
              className="aspect-square w-full rounded-xl object-cover"
            />
          ))}
          <img
            src={cocoaSelfieTea}
            alt="お茶のマグを持つここあ"
            className="aspect-square w-full rounded-xl object-cover"
          />
        </div>
      )}

      </div>

      <button
        type="button"
        onClick={() => setComposerOpen(true)}
        aria-label="つぶやきを書く"
        className="absolute bottom-5 right-5 z-10 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent)] text-3xl font-light text-white shadow-lg"
      >
        +
      </button>

      {composerOpen && (
        <div
          className="absolute inset-0 z-20 flex items-end bg-black/35"
          role="dialog"
          aria-label="つぶやきを書く"
          onClick={() => setComposerOpen(false)}
        >
          <form
            className="w-full rounded-t-3xl bg-[var(--surface)] px-6 pb-8 pt-6"
            onClick={(event) => event.stopPropagation()}
            onSubmit={handlePostSubmit}
          >
            <p className="flex items-center gap-1.5 text-base font-bold text-[var(--text)]">
              つぶやきを書く <SparkleIcon size={14} /> <HeartIcon size={12} />
            </p>
            <p className="mt-1 text-xs text-[var(--dim)]">
              らて（{USER_HANDLE}）の名前でタイムラインに投稿されるよ（280文字まで）
            </p>
            <label htmlFor="user-post-text" className="sr-only">
              つぶやきの内容
            </label>
            <textarea
              id="user-post-text"
              value={draftPost}
              onChange={(event) => setDraftPost(event.target.value)}
              placeholder="いま、なにしてる？"
              maxLength={280}
              rows={4}
              autoFocus
              className="mt-3 w-full resize-none rounded-2xl border border-[var(--border)] bg-[var(--surface-alt)] px-4 py-3 text-[15px] leading-relaxed text-[var(--text)] outline-none placeholder:text-[var(--dim)] focus:border-[var(--accent)]"
            />
            <div className="mt-1 flex items-center justify-between text-xs text-[var(--dim)]">
              <span>{createPost.isError ? "投稿できなかった…もう一度試してね" : ""}</span>
              <span>{draftPost.length} / 280</span>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setComposerOpen(false)}
                className="flex-1 rounded-full border border-[var(--border)] py-3 text-sm font-bold text-[var(--text)]"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={!draftPost.trim() || createPost.isPending}
                className="flex-1 rounded-full bg-[var(--accent)] py-3 text-sm font-bold text-white disabled:opacity-35"
              >
                {createPost.isPending ? "投稿中…" : "つぶやく"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

/* ---------- アプリ本体 ---------- */

export function App() {
  const [view, setView] = useState<View>("list");
  const [profileOpen, setProfileOpen] = useState(false);
  const openProfile = () => setProfileOpen(true);
  const [latteProfileOpen, setLatteProfileOpen] = useState(false);
  const openLatteProfile = () => setLatteProfileOpen(true);
  const state = useQuery({
    queryKey: ["cocoa-state"],
    queryFn: () => api.getState({}),
  });

  const markRead = useMutation({
    mutationFn: () => api.markRead({}),
  });

  const queryClient = useQueryClient();
  const startingRef = useRef(false);
  const startTopic = useMutation({
    mutationFn: async (info: PostTapInfo) => {
      const sim = simulatedHour();
      return api.startPostTalk(
        sim != null ? { ...info, simulateHour: sim } : info,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["cocoa-state"] });
    },
    onSettled: () => {
      startingRef.current = false;
    },
  });

  // 投稿タップ → トークへ移動して会話開始。二重タップは1回に抑える
  const handlePostTap = (info: PostTapInfo) => {
    if (startingRef.current || startTopic.isPending) return;
    startingRef.current = true;
    stopAllPlayback();
    setView("room");
    startTopic.mutate(info);
  };

  const talkRead = state.data?.talkRead ?? false;
  const unread = talkRead ? 0 : 2;
  const userMessages = state.data?.userMessages ?? [];
  const cocoaReplies = state.data?.cocoaReplies ?? [];
  const userPosts = state.data?.userPosts ?? [];
  const posts = state.data?.posts ?? [];
  const chatPreview = (() => {
    type Cand = { text: string; at: number };
    const cands: Cand[] = [
      ...userMessages.map((m) => ({
        text: m.text,
        at: new Date(m.created_at).getTime(),
      })),
      ...cocoaReplies.map((r) => ({
        text: r.text,
        at: new Date(r.created_at).getTime(),
      })),
    ].sort((a, b) => b.at - a.at);
    const top = cands[0];
    if (!top) return null;
    return {
      text: top.text,
      time: new Date(top.at).toLocaleTimeString("ja-JP", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
  })();
  const todayWeather =
    posts.find((post) => {
      if (post.kind !== "weather") return false;
      const d = new Date(post.created_at);
      const now = new Date();
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      );
    }) ?? null;

  useEffect(() => {
    if (view === "room" && state.data && !state.data.talkRead) {
      markRead.mutate();
    }
    // markRead は参照が変わるため依存に含めない（実行は view と既読状態だけで決める）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, state.data?.talkRead]);

  // 画面を切り替えたら、再生中の音声・読み上げは止める
  useEffect(() => {
    return () => stopAllPlayback();
  }, [view]);

  // 相互連携: 開いたときにダイアリー側の「今日の文脈」の取り込みを促す。
  // サーバー側で新しさ・試行間隔を見て間引くので、失敗しても静かに無視する。
  const diarySyncRef = useRef(false);
  useEffect(() => {
    if (diarySyncRef.current) return;
    diarySyncRef.current = true;
    void api.refreshDiaryContext({}).catch(() => undefined);
  }, []);

  const openRoom = () => setView("room");

  return (
    <div className="mx-auto flex h-dvh w-full max-w-md flex-col border-x border-[var(--border)] bg-[var(--bg)]">
      {view === "list" && (
        <TalkList
          unread={unread}
          posts={posts}
          chatPreview={chatPreview}
          onOpenRoom={openRoom}
          onAvatarTap={openProfile}
        />
      )}
      {view === "room" && (
        <TalkRoom
          userMessages={userMessages}
          cocoaReplies={cocoaReplies}
          weatherPost={todayWeather}
          activeTopic={state.data?.activeTopic ?? null}
          startingTopic={startTopic.isPending}
          onBack={() => setView("list")}
          onAvatarTap={openProfile}
        />
      )}
      {view === "timeline" && <Timeline posts={posts} userPosts={userPosts} onAvatarTap={openProfile} onUserAvatarTap={openLatteProfile} onPostTap={handlePostTap} />}

      <CocoaProfileSheet
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        onGoTalk={() => setView("room")}
      />

      <LatteProfileSheet
        open={latteProfileOpen}
        onClose={() => setLatteProfileOpen(false)}
        onGoCocoa={openProfile}
      />

      {view !== "room" && (
        <nav
          className="pb-safe flex border-t border-[var(--border)] bg-[var(--surface)]"
          aria-label="メイン"
        >
          <button
            type="button"
            onClick={() => setView("list")}
            aria-label="トーク"
            aria-current={view === "list" ? "page" : undefined}
            className={`relative flex flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2.5 text-[11px] font-bold ${
              view === "list" ? "text-[var(--accent)]" : "text-[var(--dim)]"
            }`}
          >
            <span className="relative">
              <ChatIcon />
              {unread > 0 && (
                <span className="absolute -right-2.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#f0564f] px-1 text-[10px] font-bold text-white">
                  {unread}
                </span>
              )}
            </span>
            トーク
          </button>
          <button
            type="button"
            onClick={() => setView("timeline")}
            aria-label="タイムライン"
            aria-current={view === "timeline" ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2.5 text-[11px] font-bold ${
              view === "timeline" ? "text-[var(--accent)]" : "text-[var(--dim)]"
            }`}
          >
            <HomeIcon />
            タイムライン
          </button>
        </nav>
      )}
    </div>
  );
}
