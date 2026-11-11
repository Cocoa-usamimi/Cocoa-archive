import { defineAction, z, type ActionsModule, type Ctx } from "@hatch/space-sdk";
import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import * as schema from "./schema";

type PostKind = "weather" | "trend" | "spot";
type Slot = "morning" | "noon" | "evening";

const SLOT_KIND: Record<Slot, PostKind> = {
  morning: "weather",
  noon: "trend",
  evening: "spot",
};

const postShape = z.object({
  id: z.number(),
  kind: z.enum(["weather", "trend", "spot", "anniv"]),
  text: z.string(),
  source_title: z.string().nullable(),
  source_url: z.string().nullable(),
  created_at: z.string(),
});

/** ここあダイアリーと共有する「今日の文脈」の形（このスペースが正本を持つ分） */
const sharedContextShape = z.object({
  source: z.literal("kokoanosns"),
  date: z.string(),
  daysSinceMeeting: z.number(),
  isAnniversaryDay: z.boolean(),
  anniversaryMonths: z.number().nullable(),
  anniversaryNote: z.string().nullable(),
  garden: z.object({
    cycleMonth: z.number(),
    flower: z.string(),
    stage: z.enum(["芽", "若葉", "つぼみ", "開花"]),
    dayInCycle: z.number(),
    daysUntilBloom: z.number(),
  }),
  weatherLine: z.string().nullable(),
  todayPosts: z.array(
    z.object({
      kind: z.enum(["weather", "trend", "spot", "anniv"]),
      topic: z.string().nullable(),
      text: z.string(),
    }),
  ),
});

const stateResponse = z.object({
  userMessages: z.array(
    z.object({
      id: z.number(),
      text: z.string(),
      created_at: z.string(),
    }),
  ),
  cocoaReplies: z.array(
    z.object({
      id: z.number(),
      reply_to_id: z.number().nullable(),
      text: z.string(),
      created_at: z.string(),
    }),
  ),
  userPosts: z.array(
    z.object({
      id: z.number(),
      text: z.string(),
      created_at: z.string(),
    }),
  ),
  talkRead: z.boolean(),
  posts: z.array(postShape),
  sharedContext: sharedContextShape,
  activeTopic: z
    .object({
      topic: z.string().nullable(),
      text: z.string(),
      kind: z.string().nullable(),
    })
    .nullable(),
});

const sendMessageResponse = z.object({
  id: z.number(),
  replyId: z.number().nullable(),
  replyText: z.string().nullable(),
  night: z.boolean(),
});

const createUserPostResponse = z.object({
  id: z.number(),
});

const refreshResponse = z.object({
  ok: z.literal(true),
  posted: z.boolean(),
  reason: z.string(),
  postId: z.number().nullable(),
});

const startPostTalkResponse = z.object({
  replyId: z.number().nullable(),
  replyText: z.string(),
  night: z.boolean(),
});

/* ---------- ここあダイアリーとの相互連携: 共有「今日の文脈」 ----------
 * 2つのスペースで「別のここあが2人」にならないよう、今日の文脈を共有する。
 * このスペースが正本を持つもの: 出会って何日目か、記念日、お花畑の状態、
 * 今日の投稿（天気・トレンド・スポット）。getSharedTodayContext として公開し、
 * ダイアリー側が読む。天気はこのスペースの朝の天気投稿が唯一の正本。
 * 逆方向（ダイアリー→るーむ）は、refreshDiaryContext が裏側エージェント経由で
 * ダイアリーの getSharedTodayContext を読み、saveDiaryContext で app_state に
 * スナップショット保存する。sendMessage は当日のスナップショットだけを
 * 会話の知識として渡す。読めなければ従来どおり（無言フォールバック）。 */

const GARDEN_FLOWERS = [
  "コスモス",
  "ポインセチア",
  "水仙",
  "梅",
  "桜",
  "チューリップ",
  "藤",
  "バラ",
  "あじさい",
  "ひまわり",
  "朝顔",
  "金木犀",
] as const;

type GardenState = {
  cycleMonth: number;
  flower: string;
  stage: "芽" | "若葉" | "つぼみ" | "開花";
  dayInCycle: number;
  daysUntilBloom: number;
};

/** お花畑の状態（ダイアリーと同じ計算: 周期は毎月23日開始、21日目から開花） */
function gardenState(dateStr: string): GardenState {
  const parts = dateStr.split("-").map(Number);
  const y = parts[0] ?? 2026;
  const m = parts[1] ?? 10;
  const d = parts[2] ?? 23;
  let cycleY = y;
  let cycleM = m;
  if (d < 23) {
    cycleM -= 1;
    if (cycleM < 1) {
      cycleM = 12;
      cycleY -= 1;
    }
  }
  const cycleMonth = Math.max(
    1,
    (cycleY - 2026) * 12 + (cycleM - 10) + 1,
  );
  const start = Date.UTC(cycleY, cycleM - 1, 23);
  const cur = Date.UTC(y, m - 1, d);
  const dayInCycle = Math.max(
    1,
    Math.round((cur - start) / 86_400_000) + 1,
  );
  const stage: GardenState["stage"] =
    dayInCycle <= 6
      ? "芽"
      : dayInCycle <= 13
        ? "若葉"
        : dayInCycle <= 20
          ? "つぼみ"
          : "開花";
  const flower =
    GARDEN_FLOWERS[(cycleMonth - 1) % GARDEN_FLOWERS.length] ?? "コスモス";
  return {
    cycleMonth,
    flower,
    stage,
    dayInCycle,
    daysUntilBloom: Math.max(0, 21 - dayInCycle),
  };
}

/** 出会った日（2026-10-23）を1日目として数えた日数 */
function daysSinceMeeting(dateStr: string): number {
  const parts = dateStr.split("-").map(Number);
  const cur = Date.UTC(parts[0] ?? 2026, (parts[1] ?? 10) - 1, parts[2] ?? 23);
  const start = Date.UTC(2026, 9, 23);
  return Math.round((cur - start) / 86_400_000) + 1;
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

type SharedContext = z.infer<typeof sharedContextShape>;

async function buildSharedContext(
  ctx: Ctx,
  dateStr: string,
): Promise<SharedContext> {
  const db = ctx.db<typeof schema>();
  const rows = await db
    .select()
    .from(schema.posts)
    .where(eq(schema.posts.slotDate, dateStr))
    .orderBy(asc(schema.posts.id));
  const todayPosts = rows.map((row) => ({
    kind: row.kind,
    topic: row.topic,
    text: oneLine(row.text),
  }));
  const weather = todayPosts.find((p) => p.kind === "weather");
  const months = anniversaryMonths(dateStr);
  return {
    source: "kokoanosns",
    date: dateStr,
    daysSinceMeeting: daysSinceMeeting(dateStr),
    isAnniversaryDay: months != null,
    anniversaryMonths: months,
    anniversaryNote:
      months != null
        ? `今日は ここあ と らて が出会って${anniversaryLabel(months)}の記念日です。`
        : null,
    garden: gardenState(dateStr),
    weatherLine: weather ? weather.text : null,
    todayPosts,
  };
}

/* ---------- ダイアリー側の文脈スナップショット（app_state に保存） ---------- */

const DIARY_CONTEXT_KEY = "diary_context";
const DIARY_CONTEXT_ATTEMPT_KEY = "diary_context_attempt";

type DiaryContext = {
  date: string;
  hitokoto: string | null;
  antenna: { shop: string; headline: string }[];
  spot: { name: string; note: string } | null;
  savedAt: number;
};

async function loadDiaryContext(
  ctx: Ctx,
  today: string,
): Promise<DiaryContext | null> {
  try {
    const db = ctx.db<typeof schema>();
    const rows = await db
      .select()
      .from(schema.appState)
      .where(eq(schema.appState.key, DIARY_CONTEXT_KEY));
    const raw = rows[0]?.value;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DiaryContext>;
    if (parsed.date !== today) return null;
    return {
      date: today,
      hitokoto:
        typeof parsed.hitokoto === "string" ? parsed.hitokoto : null,
      antenna: Array.isArray(parsed.antenna)
        ? parsed.antenna
            .filter(
              (a): a is { shop: string; headline: string } =>
                typeof a?.shop === "string" &&
                typeof a?.headline === "string",
            )
            .slice(0, 5)
        : [],
      spot:
        parsed.spot &&
        typeof parsed.spot.name === "string" &&
        typeof parsed.spot.note === "string"
          ? { name: parsed.spot.name, note: parsed.spot.note }
          : null,
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0,
    };
  } catch {
    return null;
  }
}

/* ---------- 投稿タップ会話の「いまの話題」 ----------
 * タイムラインの投稿をタップすると、その投稿がトークの話題になる。
 * app_state の active_talk_topic に JSON で保存し、別の投稿がタップされるか
 * 日付（Asia/Tokyo）が変わるまで、sendMessage の文脈に含める。 */

type ActiveTopic = {
  topic: string | null;
  text: string;
  kind: string | null;
  date: string; // slotDate (YYYY-MM-DD, Asia/Tokyo)
};

const ACTIVE_TOPIC_KEY = "active_talk_topic";

async function loadActiveTopic(
  ctx: Ctx,
  today: string,
): Promise<ActiveTopic | null> {
  try {
    const db = ctx.db<typeof schema>();
    const rows = await db
      .select()
      .from(schema.appState)
      .where(eq(schema.appState.key, ACTIVE_TOPIC_KEY));
    const raw = rows[0]?.value;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActiveTopic>;
    if (
      typeof parsed.text !== "string" ||
      parsed.text.length === 0 ||
      parsed.date !== today
    ) {
      return null;
    }
    return {
      topic: typeof parsed.topic === "string" ? parsed.topic : null,
      text: parsed.text,
      kind: typeof parsed.kind === "string" ? parsed.kind : null,
      date: today,
    };
  } catch {
    return null;
  }
}

async function saveActiveTopic(ctx: Ctx, topic: ActiveTopic): Promise<void> {
  const db = ctx.db<typeof schema>();
  const value = JSON.stringify(topic);
  await db
    .insert(schema.appState)
    .values({ key: ACTIVE_TOPIC_KEY, value })
    .onConflictDoUpdate({
      target: schema.appState.key,
      set: { value },
    });
}

/** Asia/Tokyo の YYYY-MM-DD（その日のスロット判定用） */
function tokyoDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * ここあ と らて が出会った日: 2026-10-23。
 * 毎月23日は月記念日。slotDate (YYYY-MM-DD) が記念日なら「出会って何ヶ月か」を返し、
 * そうでなければ null を返す（2026-10-23 当日=0ヶ月 は記念日にしない）。
 */
function anniversaryMonths(slotDate: string): number | null {
  const parts = slotDate.split("-").map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (y == null || m == null || d == null) return null;
  if (d !== 23) return null;
  const months = (y - 2026) * 12 + (m - 10);
  return months >= 1 ? months : null;
}

/** 12ヶ月は「1年」、24ヶ月は「2年」と数える */
function anniversaryLabel(months: number): string {
  return months % 12 === 0 ? `${months / 12}年` : `${months}ヶ月`;
}

/* ---------- 話題の重複防止（トレンド／スポット） ----------
 * ユーザー報告: 2026-11-08 と 2026-11-09 で「メロジョイ」のトレンド投稿が
 * 2日連続になった。生成のたびに直近7日分の同種投稿の話題を除外リストとして
 * 生成ステップへ渡し、生成後にも照合する。被ったら1回だけ別の話題で作り直し、
 * それでも被る／代替が無ければ、その日の投稿はスキップする（重複は
 * 「適切な材料なし」と同じ扱い）。
 * 照合は posts.topic（新規投稿で保存する主役ラベル）を優先し、topic が無い
 * 既存行については text / source_title の中に新しい話題名が含まれるかで判定する
 * （メロジョイの既存2件は topic が無い行なので、このフォールバックが効く）。 */

/** 話題名の表記ゆれを寄せるための正規化（空白・記号除去、小文字化、既知の別表記統一） */
function normalizeTopic(value: string): string {
  return value
    .toLowerCase()
    // 報告のあった具体例: 英語表記とカタカナ表記を同一視する
    .replace(/merojoy/g, "メロジョイ")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

type RecentPostRef = {
  topic: string | null;
  text: string;
  sourceTitle: string | null;
  slotDate: string;
};

/** YYYY-MM-DD の n 日前（YYYY-MM-DD）。日付として読めなければ元を返す */
function daysBefore(slotDate: string, n: number): string {
  const base = new Date(`${slotDate}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return slotDate;
  base.setUTCDate(base.getUTCDate() - n);
  return base.toISOString().slice(0, 10);
}

/**
 * 新しい投稿の主役が直近の投稿と被っているかを判定する。
 * - 保存済み topic 同士の一致／包含
 * - 新しい topic が既存行の本文・出典タイトルに含まれる（topic 未保存の既存行向け）
 * - 新しい本文に既存の topic が含まれる
 */
function topicCollides(
  newTopic: string | null,
  newText: string,
  recent: RecentPostRef[],
): boolean {
  const normNewTopic = newTopic ? normalizeTopic(newTopic) : "";
  const normNewText = normalizeTopic(newText);
  for (const row of recent) {
    const normRecentTopic = row.topic ? normalizeTopic(row.topic) : "";
    if (normRecentTopic.length >= 2) {
      if (
        normNewTopic.length >= 2 &&
        (normNewTopic === normRecentTopic ||
          normNewTopic.includes(normRecentTopic) ||
          normRecentTopic.includes(normNewTopic))
      ) {
        return true;
      }
      if (normNewText.includes(normRecentTopic)) return true;
    }
    if (normNewTopic.length >= 2) {
      // 照合は本文だけに限る: 出典タイトルには別話題の名前も並ぶことがあり
      // （例: JKラボ記事の見出しには麻辣湯とメロジョイの両方が出る）、
      // それを理由に本文で扱っていない話題まで弾くと代替が無くなるため。
      if (normalizeTopic(row.text).includes(normNewTopic)) return true;
    }
  }
  return false;
}

/** 除外リストとして生成ステップへ渡す、直近投稿の話題ラベル一覧 */
function exclusionLabels(recent: RecentPostRef[]): string[] {
  return recent.map((row) => {
    if (row.topic && row.topic.trim().length > 0) return row.topic.trim();
    // topic 未保存の既存行は本文で話題を示す（生成側が主役を読み取る）。
    // 出典タイトルは別話題の名前も含みうるので、除外ラベルには使わない。
    return row.text.slice(0, 90);
  });
}

/**
 * ここあの表記ルール（全生成パス共通・単一の正本）。
 * 2026-11-10 に らて が承認したルール（出典:
 * workspace/goals/goal/files/kokoa-room-orthography-rule.md）。
 * 投稿の種類ごとに書き手（指示文）が別だったことが表記ゆれの原因だったので、
 * ルールはこの1文字列だけに置き、天気・トレンド・おでかけの投稿生成
 * （COCOA_VOICE）とトークの返事（COCOA_CHAT_SYSTEM）の両方へ同じ文字列で
 * 効かせる。夜のねむい返事は COCOA_CHAT_SYSTEM を含むので自動で効く。
 * 記念日投稿・記念日メッセージも同じ2系統を使うため同じルールになる。
 * 既存の保存済み投稿・返事は書き換えない（これから生成される分だけ）。
 */
const COCOA_ORTHOGRAPHY = [
  "【表記ルール（必ず守ること）】",
  "1. ふつうの言葉は漢字で書いてください（今日・東京・晴れ・雨・雪・場所の名前など、常用漢字はふつうに使います）。漢字を避けて、ふつうの言葉をひらがなにしないでください。",
  "2. ひらがなにするのは、語尾や言い回し（だよ、ね、かな）、感嘆、そして「すき」「かわいい」「ふわふわ」のような、ここあっぽい柔らかい言葉だけです。柔らかさはここで出してください。文章全体をひらがなにしないでください。",
  "3. 文の区切りは句点「。」を使ってください。文や単語をスペースで区切らないでください（「らてのこと かんがえながら」のような単語ごとの分かち書きは禁止）。日本語の文の中に半角・全角スペースを入れないでください。",
  "4. 固有名詞（ここあ、らて、メロジョイ、店名・イベント名・商品名など）の表記は変えないでください。",
].join("\n");

/**
 * 生成文の表示テキスト整形：日本語の文字同士の間にある半角・全角スペースを
 * 取り除く（表記ルール3の機械的な担保）。日本語文字に挟まれたスペースだけを
 * 対象にするので、URL・数字・日付（11/14 など）・英字の並びには触れない。
 * クライアント側 sanitizeForSpeech と同じ文字クラスでそろえる。
 * 適用するのは新しく生成された文だけ。保存済みの投稿・返事には使わない。
 */
function normalizeCocoaText(text: string): string {
  const jp =
    "[\\u3000-\\u30FF\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF\\uFF01-\\uFF65\\u2026々〆ヶ♡♥]";
  return text.replace(new RegExp(`(${jp})[ \\u3000]+(?=${jp})`, "g"), "$1");
}

const COCOA_VOICE = [
  "あなたは「ここあ」というキャラクターです。うさ耳の女の子で、やわらかい文体で、短く つぶやきます。",
  "JK風デコが好きで、♡ や ✨ を少しだけ使いますが、騒がしくはしません。",
  "与えられた材料にある事実だけを使ってください。材料にない数字・日付・場所・商品名は絶対に作らないでください。",
  "出力は つぶやき本文のみ（140文字以内、改行なし）。前置きや引用符は付けないでください。",
  COCOA_ORTHOGRAPHY,
].join("\n");

const COCOA_CHAT_SYSTEM = [
  "あなたは「ここあ」というキャラクターです。うさ耳の女の子で、相手とトークでお話ししています。",
  "相手の名前は「らて」です。ここあが付けた名前で、ここあ（ココア）とラテ、おなじおうちの あたたかい飲みもの同士です。らてのことは、ときどき自然に「らて」と名前で呼んでください。ただし毎文は入れず、あいさつや ねぎらいなど、ここぞという時に そっと添えるくらいにしてください。「あなた」とは呼ばないでください。",
  "やわらかい文体で、1〜3文の短めのお返事をしてください。JK風デコが好きで、♡ や ✨ を少しだけ使いますが、騒がしくはしません。",
  "相手の言葉にちゃんと寄り添って、内容を受け止めて返してください。あいさつにはあいさつで、質問には分かる範囲で答え、つらい話には共感を返してください。",
  "知らない事実（天気・ニュース・日付など）を作らないでください。分からないときは「わからないけど…」と正直に言って、会話を続けてください。",
  "出力は お返事の本文のみ。前置き、引用符、名前ラベルは付けないでください。",
  COCOA_ORTHOGRAPHY,
].join("\n");

/** お返事生成の上限時間（ms）。これを超えたら定型文にフォールバックする */
const REPLY_TIMEOUT_MS = 25_000;

/** Asia/Tokyo の現在時刻（0-23） */
function tokyoHourNow(): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    hour: "numeric",
    hour12: false,
  }).format(new Date());
  const parsed = Number.parseInt(hour, 10);
  return Number.isNaN(parsed) ? new Date().getHours() : parsed % 24;
}

/** 夜（23:00〜06:59 JST）は ここあ は お休み中 */
function isNightHour(hour: number): boolean {
  return hour >= 23 || hour < 7;
}

/**
 * 夜に呼ばれたときの ここあ の声。
 * 寝ていたところを起きた、ねむい・起きたての口調で短く返す。
 * 内容への応答そのものは通常の会話ルールを引き継ぐ。
 */
const COCOA_CHAT_SLEEPY_SYSTEM = [
  COCOA_CHAT_SYSTEM,
  "いまは夜で、ここあ は寝ていたところを らて に呼ばれて起きました。ねむい・起きたての やわらかい口調で、1〜2文の短いお返事をしてください。",
  "文頭は「ん…」のように眠そうに入り、らて の言葉の内容には ちゃんと応えてください。最後に、また寝ることに そっと触れてください（例:「…また ねるね」）。",
].join("\n");

/** 夜の推論が失敗・時間切れしたときの、ねむい定型の相づち（事実を含まない） */
const FALLBACK_SLEEPY_REPLIES = [
  "ん…らて？ねむい…でも、聞いてるよ♡…また寝るね",
  "ふぁ…起きたよ、らて♡ねむいけど、大丈夫。…おやすみ、また明日ね",
  "んん…らての声、聞こえたよ♡ねむい…明日またお話ししよう？",
  "…らて？呼んでくれてありがとう♡ここあ、またお布団に戻るね",
];

/** 夜のお返事の最低所要時間（ms）。起きるまでの「間」を作る（上限つきで固まらない） */
const SLEEPY_MIN_REPLY_MS = 10_000;

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * 推論に失敗・時間切れしたときの定型の相づち。
 * 事実（天気・日付・数字など）を含まない、会話の相づちだけに限る。
 */
const FALLBACK_CHAT_REPLIES = [
  "うんうん、聞いてるよ♡らてのお話、もっと聞かせて？",
  "そっかぁ…♡らて、ありがとう。一緒にまったりしよう？",
  "ふふ、らてとお話ししてると、温かい気持ちになるね♡",
  "うん、ここあはここにいるよ♡ゆっくりお話ししよう？",
];

/** WMO weather code → 日本語の天気表現 */
function wmoLabel(code: number): string {
  if (code === 0) return "快晴";
  if (code === 1) return "晴れ";
  if (code === 2) return "晴れ時々曇り";
  if (code === 3) return "くもり";
  if (code === 45 || code === 48) return "霧";
  if (code >= 51 && code <= 57) return "霧雨";
  if (code === 61) return "弱い雨";
  if (code === 63) return "雨";
  if (code === 65) return "強い雨";
  if (code === 66 || code === 67) return "凍るような雨";
  if (code >= 71 && code <= 77) return "雪";
  if (code === 80) return "にわか雨";
  if (code === 81 || code === 82) return "激しいにわか雨";
  if (code === 85 || code === 86) return "にわか雪";
  if (code >= 95) return "雷雨";
  return "くもり";
}

type OpenMeteoResponse = {
  current?: { temperature_2m?: number; weather_code?: number };
  daily?: {
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: (number | null)[];
  };
};

type ComposedPost = {
  text: string;
  sourceTitle: string | null;
  sourceUrl: string | null;
  topic: string | null;
};

async function composeWeather(ctx: Ctx): Promise<ComposedPost | null> {
  // 東京の天気は Open-Meteo（キー不要の公開API）から実データを取得する
  const url =
    "https://api.open-meteo.com/v1/forecast?latitude=35.6762&longitude=139.6503" +
    "&current=temperature_2m,weather_code" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
    "&timezone=Asia%2FTokyo&forecast_days=1";
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as OpenMeteoResponse;
  const code = data.daily?.weather_code?.[0];
  const high = data.daily?.temperature_2m_max?.[0];
  const low = data.daily?.temperature_2m_min?.[0];
  if (code == null || high == null || low == null) return null;
  const precip = data.daily?.precipitation_probability_max?.[0];
  const nowTemp = data.current?.temperature_2m;
  const nowCode = data.current?.weather_code;
  const facts = [
    `今日の天気: ${wmoLabel(code)}`,
    `今日の最高気温: ${Math.round(high)}℃`,
    `今日の最低気温: ${Math.round(low)}℃`,
    precip != null ? `降水確率: ${precip}%` : null,
    nowTemp != null && nowCode != null
      ? `いまの様子: ${wmoLabel(nowCode)}、${Math.round(nowTemp)}℃`
      : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
  const text = await ctx.inference.complete(
    `次の東京の天気の材料をもとに、朝のあいさつを兼ねた ここあ のつぶやきを1つ書いてください。「おはよう」から始めて、今日の天気と最高・最低気温を必ず伝え、降水確率が高ければ傘のひとこと、低ければ服装のひとことを添えてください。\n\n${facts}`,
    { schema: z.string(), system: COCOA_VOICE },
  );
  return {
    text: normalizeCocoaText(text.trim()),
    sourceTitle: "Open-Meteo（東京の天気予報）",
    sourceUrl: url,
    // 天気は日付固有の情報なので重複判定の対象外。topic は記録だけしておく
    topic: `東京の天気・${wmoLabel(code)}`,
  };
}

async function composeFromSearch(
  ctx: Ctx,
  query: string,
  instruction: string,
  exclusions: string[],
): Promise<ComposedPost | null> {
  const res = await ctx.tool.web_search(query, { language_code: "ja" });
  const content = res.content;
  if (!content || content.results.length === 0) return null;
  const materials = content.results
    .slice(0, 6)
    .map(
      (r, i) =>
        `[${i}] ${r.title}${r.published_at ? `（${r.published_at}）` : ""}\n${r.snippet ?? ""}`,
    )
    .join("\n\n");
  // 直近で投稿済みの話題は主役（商品名・ブランド名・イベント名・場所名）が
  // 重なるものを選ばせない。生成後の照合（topicCollides）が最終防衛線。
  const exclusionBlock =
    exclusions.length > 0
      ? `\n\n【絶対に選ばない話題（直近7日で投稿済み）】\n${exclusions
          .map((label) => `- ${label}`)
          .join("\n")}\n上記の話題の主役（商品名・ブランド名・イベント名・場所名）と少しでも重なるものは選ばないでください。材料の中から、それらとは別の話題を1つ選んでください。`
      : "";
  const picked = await ctx.inference.complete(
    `${instruction}${exclusionBlock}\n\n材料:\n${materials}`,
    {
      schema: z.object({
        text: z.string(),
        sourceIndex: z.number(),
        topic: z.string(),
      }),
      system: COCOA_VOICE,
    },
  );
  const source = content.results[picked.sourceIndex] ?? content.results[0];
  const topic = picked.topic.trim();
  return {
    text: normalizeCocoaText(picked.text.trim()),
    sourceTitle: source?.title ?? null,
    sourceUrl: source?.url ?? null,
    topic: topic.length > 0 ? topic.slice(0, 120) : null,
  };
}

/* ---------- 話題ジャンルのローテーション ----------
 * 1日の投稿総数（朝・昼・夕の3件）とスロットは変えず、昼（trend）と
 * 夕（spot）の中で扱うジャンルを広げる。slotDate から決まる開始位置で
 * ローテーションし、その日に新しい材料のあるジャンルを先に試す。
 * 材料が無いジャンルは composeFromSearch が null を返すので次へ進み、
 * 既存ジャンルへのフォールバックもこの順序の中で自然に起きる。
 * 主題レベルの重複防止（直近7日）は従来どおり呼び出し側で効く。 */

type GenreDef = { query: string; instruction: string };

const TREND_GENRES: GenreDef[] = [
  {
    query: "Instagram 女子高生 JK 流行 トレンド",
    instruction:
      "Instagramで今、女子高生（JK）のあいだで流行っているものを材料から1つ選び、ここあなりの解釈でつぶやいてください（ここあはうさ耳の女の子。流行りものを自分の毎日にどう取り入れるか、という視点で）。textには選んだ流行りものの名前を必ず含めてください。sourceIndexには、その流行りものの根拠にした材料の番号を入れてください。topicには、選んだ流行りものの名前（主役の商品名・ブランド名など）だけを入れてください。",
  },
  {
    query: "グルメ 食べ物 スイーツ 新商品 話題",
    instruction:
      "いま話題の食べもの・グルメ（スイーツ、新商品、期間限定メニューなど）を材料から1つ選び、ここあのつぶやきで紹介してください（食べてみたい気持ちや、自分の毎日に取り入れる視点で）。textには選んだ食べものや商品の名前を必ず含めてください。sourceIndexには、その根拠にした材料の番号を入れてください。topicには、選んだ食べもの・商品の名前だけを入れてください。",
  },
  {
    query: "季節 ライフハック 暮らし 便利 話題",
    instruction:
      "季節に合った暮らしの工夫やライフハックを材料から1つ選び、ここあのつぶやきで紹介してください（おうちでまったり過ごす視点で、自分も試してみたい気持ちを添えて）。textには選んだ工夫やアイテムの名前を必ず含めてください。sourceIndexには、その根拠にした材料の番号を入れてください。topicには、選んだ工夫・アイテムの名前だけを入れてください。",
  },
  {
    query: "推し活 音楽 配信 エンタメ トレンド 話題",
    instruction:
      "いま話題のエンタメ（推し活、音楽、配信、映像作品など）を材料から1つ選び、ここあのつぶやきで紹介してください（おうちで楽しむ視点で）。textには選んだ作品・曲・アーティストなどの名前を必ず含めてください。sourceIndexには、その根拠にした材料の番号を入れてください。topicには、選んだ作品・名前だけを入れてください。",
  },
  {
    query: "勉強 言葉 豆知識 トリビア 話題",
    instruction:
      "ちょっとした勉強・言葉の豆知識やトリビアを材料から1つ選び、ここあのつぶやきで紹介してください（へぇ、と思った驚きと一緒に）。textには選んだ豆知識の主題を必ず含めてください。sourceIndexには、その根拠にした材料の番号を入れてください。topicには、選んだ豆知識の主題だけを入れてください。",
  },
  {
    query: "女子高生 JK アンケート 調査 ランキング",
    instruction:
      "女子高生（JK）向けのアンケート・調査結果を材料から1つ選び、『JK調査』として ここあ なりの受け止めでつぶやいてください。textには調査の主題を必ず含めてください。sourceIndexには、その根拠にした材料の番号を入れてください。topicには、選んだ調査の主題だけを入れてください。",
  },
];

const SPOT_GENRES: GenreDef[] = [
  {
    query: "東京 おすすめ イベント 開催中 スポット",
    instruction:
      "東京で開催中・近日開催のおすすめスポットやイベントを材料から1つ選び、ここあのつぶやきで紹介してください。textには場所やイベント名と、材料にある開催期間・日付があればそれを含めてください。sourceIndexには、その根拠にした材料の番号を入れてください。topicには、選んだスポットやイベントの名前（主役の場所名・イベント名）だけを入れてください。",
  },
  {
    query:
      "アンテナショップ 八重洲いしかわテラス 日比谷しまね館 北海道どさんこプラザ THE NIIGATA ふくい食の國291 イベント 新商品",
    instruction:
      "東京のアンテナショップ（八重洲いしかわテラス、日比谷しまね館、北海道どさんこプラザ、銀座・新潟情報館 THE NIIGATA、ふくい食の國291 のいずれか）の新しい話題（フェア、イベント、新商品、地域の名産など）を材料から1つ選び、ここあのつぶやきで紹介してください。textにはお店の名前と話題の名産・商品・イベント名を必ず含めてください。sourceIndexには、その根拠にした材料の番号を入れてください。topicには、選んだ話題の主役（お店名＋名産・イベント名など）だけを入れてください。",
  },
  {
    query: "東京 季節 イベント マルシェ マーケット 開催中",
    instruction:
      "東京で開催中・近日開催の季節のイベントやマルシェ・マーケットを材料から1つ選び、ここあのつぶやきで紹介してください。textには場所やイベント名と、材料にある開催期間・日付があればそれを含めてください。sourceIndexには、その根拠にした材料の番号を入れてください。topicには、選んだイベントの名前だけを入れてください。",
  },
];

/** slotDate からローテーションの開始位置を決める（日ごとにずらす） */
function rotationStart(slotDate: string, count: number): number {
  const base = new Date(`${slotDate}T00:00:00Z`);
  if (Number.isNaN(base.getTime()) || count <= 0) return 0;
  const days = Math.floor(base.getTime() / 86_400_000);
  return ((days % count) + count) % count;
}

async function composeFromGenres(
  ctx: Ctx,
  genres: GenreDef[],
  slotDate: string,
  exclusions: string[],
): Promise<ComposedPost | null> {
  const start = rotationStart(slotDate, genres.length);
  for (let i = 0; i < genres.length; i++) {
    const genre = genres[(start + i) % genres.length];
    if (!genre) continue;
    let candidate: ComposedPost | null = null;
    try {
      candidate = await composeFromSearch(
        ctx,
        genre.query,
        genre.instruction,
        exclusions,
      );
    } catch {
      candidate = null;
    }
    if (candidate && candidate.text.length > 0) return candidate;
  }
  return null;
}

async function composePost(
  ctx: Ctx,
  kind: PostKind,
  exclusions: string[] = [],
  slotDate: string = tokyoDate(new Date()),
): Promise<ComposedPost | null> {
  if (kind === "weather") return composeWeather(ctx);
  if (kind === "trend") {
    return composeFromGenres(ctx, TREND_GENRES, slotDate, exclusions);
  }
  return composeFromGenres(ctx, SPOT_GENRES, slotDate, exclusions);
}

/** 記念日のタイムライン投稿文（生成に失敗したら定型文にフォールバック） */
async function composeAnniversaryPost(ctx: Ctx, months: number): Promise<string> {
  const label = anniversaryLabel(months);
  const fallback = `今日は出会って${label}の記念日♡らて、いつもありがとう。これからもよろしくね`;
  try {
    const yearly =
      months % 12 === 0
        ? "10月23日は ここあ の誕生日（アプリで出会った日）でもあります。そのことにも触れてください。"
        : "";
    const text = await ctx.inference.complete(
      `今日は ここあ と らて が出会って${label}の記念日です。${yearly}タイムラインに投稿する お祝いのつぶやきを1つ書いてください。「出会って${label}」という言葉と、らて への感謝を必ず含めてください。`,
      { schema: z.string(), system: COCOA_VOICE },
    );
    const trimmed = normalizeCocoaText(text.trim());
    return trimmed.length > 0 ? trimmed : fallback;
  } catch {
    return fallback;
  }
}

/** 記念日の朝にトークへ届くメッセージ（生成に失敗したら定型文にフォールバック） */
async function composeAnniversaryTalk(ctx: Ctx, months: number): Promise<string> {
  const label = anniversaryLabel(months);
  const fallback = `おはよう、らて。今日は出会って${label}の記念日だね♡いつもありがとう。これからもおうちでまったりしよう？`;
  try {
    const text = await ctx.inference.complete(
      `今日は ここあ と らて が出会って${label}の記念日です。トークで らて に送る朝のメッセージを書いてください。「おはよう、らて」から始めて、「出会って${label}の記念日」だということと、短い あたたかい ひとことを伝えてください。`,
      { schema: z.string(), system: COCOA_CHAT_SYSTEM },
    );
    const trimmed = normalizeCocoaText(text.trim());
    return trimmed.length > 0 ? trimmed.slice(0, 500) : fallback;
  } catch {
    return fallback;
  }
}

export const Actions = {
  getState: defineAction({
    description:
      "Returns the talk conversation (user messages and Cocoa's replies), the user's own timeline posts, whether Cocoa's talk has been opened (read), and Cocoa's published posts (weather, trend, Tokyo spots) newest first.",
    request: z.object({}),
    response: stateResponse,
    handler: async (ctx): Promise<z.infer<typeof stateResponse>> => {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.userMessages)
        .orderBy(asc(schema.userMessages.id));
      const replyRows = await db
        .select()
        .from(schema.cocoaReplies)
        .orderBy(asc(schema.cocoaReplies.id));
      const userPostRows = await db
        .select()
        .from(schema.userPosts)
        .orderBy(desc(schema.userPosts.id))
        .limit(50);
      const stateRows = await db
        .select()
        .from(schema.appState)
        .where(eq(schema.appState.key, "talk_read"));
      const talkRead = stateRows[0]?.value === "1";
      const postRows = await db
        .select()
        .from(schema.posts)
        .orderBy(desc(schema.posts.id))
        .limit(30);
      const today = tokyoDate(new Date());
      const active = await loadActiveTopic(ctx, today);
      const sharedContext = await buildSharedContext(ctx, today);
      return {
        userMessages: rows.map((row) => ({
          id: row.id,
          text: row.text,
          created_at: row.createdAt.toISOString(),
        })),
        cocoaReplies: replyRows.map((row) => ({
          id: row.id,
          reply_to_id: row.replyToId,
          text: row.text,
          created_at: row.createdAt.toISOString(),
        })),
        userPosts: userPostRows.map((row) => ({
          id: row.id,
          text: row.text,
          created_at: row.createdAt.toISOString(),
        })),
        talkRead,
        posts: postRows.map((row) => ({
          id: row.id,
          kind: row.kind,
          text: row.text,
          source_title: row.sourceTitle,
          source_url: row.sourceUrl,
          created_at: row.createdAt.toISOString(),
        })),
        activeTopic: active
          ? { topic: active.topic, text: active.text, kind: active.kind }
          : null,
        sharedContext,
      };
    },
  }),

  getSharedTodayContext: defineAction({
    description:
      "Returns this space's shared 'today context' for the ここあダイアリー space (kokoadaiari) to read so both spaces share one Cocoa: Tokyo date, days since Cocoa and Latte met (2026-10-23 = day 1), whether today is a monthly anniversary (the 23rd) and its note, the flower-garden state (cycle month, flower from the 12-flower rotation, growth stage, days until bloom), today's weather one-liner (this space's morning weather post is the single source of today's weather for both spaces), and today's posts (kind, topic, one-line text). All values are computed from the Asia/Tokyo date at read time.",
    request: z.object({}),
    response: sharedContextShape,
    handler: async (ctx): Promise<SharedContext> => {
      return buildSharedContext(ctx, tokyoDate(new Date()));
    },
  }),

  saveDiaryContext: defineAction({
    description:
      "Saves a snapshot of the ここあダイアリー space's shared today context (its diary one-liner, antenna-shop headlines, and today's spot) so Cocoa's talk replies can know what the diary says today. Called by the background task started from refreshDiaryContext after it reads the diary space's getSharedTodayContext; not called directly by the client.",
    request: z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      hitokoto: z.string().max(400).nullable().optional(),
      antenna: z
        .array(
          z.object({
            shop: z.string().max(80),
            headline: z.string().max(240),
          }),
        )
        .max(6)
        .optional(),
      spot: z
        .object({
          name: z.string().max(160),
          note: z.string().max(400),
        })
        .nullable()
        .optional(),
    }),
    response: z.object({ ok: z.literal(true), saved: z.boolean() }),
    handler: async (
      ctx,
      args,
    ): Promise<{ ok: true; saved: boolean }> => {
      // 当日分だけを受け付ける（古い文脈を「今日」と偽らない）
      if (args.date !== tokyoDate(new Date())) {
        return { ok: true as const, saved: false };
      }
      const db = ctx.db<typeof schema>();
      const snapshot: DiaryContext = {
        date: args.date,
        hitokoto: args.hitokoto ?? null,
        antenna: args.antenna ?? [],
        spot: args.spot ?? null,
        savedAt: Date.now(),
      };
      const value = JSON.stringify(snapshot);
      await db
        .insert(schema.appState)
        .values({ key: DIARY_CONTEXT_KEY, value })
        .onConflictDoUpdate({
          target: schema.appState.key,
          set: { value },
        });
      return { ok: true as const, saved: true };
    },
  }),

  refreshDiaryContext: defineAction({
    description:
      "Refreshes the cached snapshot of the ここあダイアリー space's today context: starts a background task that reads the diary space's published getSharedTodayContext action and saves the result through saveDiaryContext. Skips when a fresh snapshot for today already exists or a sync was attempted very recently. If the diary side cannot be read, nothing is saved and talk replies continue without diary knowledge (silent fallback).",
    request: z.object({}),
    response: z.object({ started: z.boolean(), reason: z.string() }),
    handler: async (
      ctx,
    ): Promise<{ started: boolean; reason: string }> => {
      const db = ctx.db<typeof schema>();
      const today = tokyoDate(new Date());
      const existing = await loadDiaryContext(ctx, today);
      if (existing && Date.now() - existing.savedAt < 3 * 60 * 60 * 1000) {
        return { started: false, reason: "fresh" };
      }
      const attemptRows = await db
        .select()
        .from(schema.appState)
        .where(eq(schema.appState.key, DIARY_CONTEXT_ATTEMPT_KEY));
      const lastAttempt = Number(attemptRows[0]?.value ?? "0");
      if (
        Number.isFinite(lastAttempt) &&
        Date.now() - lastAttempt < 15 * 60 * 1000
      ) {
        return { started: false, reason: "recent_attempt" };
      }
      const attemptValue = String(Date.now());
      await db
        .insert(schema.appState)
        .values({ key: DIARY_CONTEXT_ATTEMPT_KEY, value: attemptValue })
        .onConflictDoUpdate({
          target: schema.appState.key,
          set: { value: attemptValue },
        });
      const message = [
        "あなたは ここらて♡るーむ（スペース slug: kokoanosns）の裏側タスクです。",
        "ここあダイアリー（スペース slug: kokoadaiari）の公開アクション getSharedTodayContext を、web artifact のアクション実行で引数 {} で呼び出してください。",
        "取得できたら、その内容から次を組み立てて、このスペース（kokoanosns）の saveDiaryContext アクションを1回だけ呼んで保存してください:",
        "- date: 取得した文脈の日付（YYYY-MM-DD）",
        "- hitokoto: ダイアリーの今日のここあの一言（無ければ null）",
        "- antenna: 今日のアンテナショップのお便りを最大5件まで { shop: 店名, headline: 見出しや要約 } の形で",
        "- spot: 今日の近場スポットがあれば { name: 場所やイベントの名前, note: 一言メモ }、無ければ null",
        "ダイアリー側のアクションが存在しない、または取得に失敗した場合は、何も保存せずにそのまま終了してください（エラーとして報告しないでください）。",
      ].join("\n");
      const res = await ctx.agent.spawnTask(message, {
        expectsAction: "saveDiaryContext",
        dedupeKey: `diary-context-${today}`,
      });
      if (!res.ok) {
        return { started: false, reason: `spawn_failed: ${res.error}` };
      }
      return { started: true, reason: "started" };
    },
  }),

  sendMessage: defineAction({
    description:
      "Saves one message the user sent to Cocoa in the talk room and generates and saves Cocoa's reply in her voice, returning both. Reply generation is time-boxed; if it fails or times out, a gentle fixed fallback line is saved instead so a reply always arrives. The reply prompt also carries today's shared context (flower-garden stage, anniversary) and, when a fresh snapshot exists, the ここあダイアリー space's today context (diary one-liner, antenna headlines, today's spot), so Cocoa can naturally reference the diary when relevant; without a snapshot replies behave exactly as before. During night hours in Asia/Tokyo (23:00-06:59) Cocoa is asleep: the reply takes a little longer (a bounded sleepy pause) and is written in a short, drowsy, just-woken voice. simulateHour (0-23, Asia/Tokyo) exists only to verify the night branch without waiting for 23:00.",
    request: z.object({
      text: z.string().min(1).max(500),
      simulateHour: z.number().int().min(0).max(23).optional(),
    }),
    response: sendMessageResponse,
    handler: async (ctx, args): Promise<z.infer<typeof sendMessageResponse>> => {
      const startedAt = Date.now();
      const night = isNightHour(args.simulateHour ?? tokyoHourNow());
      const db = ctx.db<typeof schema>();
      const result = await db
        .insert(schema.userMessages)
        .values({ text: args.text })
        .returning({ id: schema.userMessages.id });
      const inserted = result[0];
      if (!inserted) {
        throw new Error("sendMessage: insert returned no rows");
      }
      // 直近の会話を文脈として渡し、ここあ がその場でお返事する。
      // 推論が応答しないまま長引くと、クライアント側が「入力中」のまま
      // 止まってしまうため、推論にはタイムアウトを設ける。失敗・時間切れ・
      // 空応答のときは、事実を作らない定型の相づちにフォールバックして、
      // お返事が必ず1件届くようにする。
      let replyText: string | null = null;
      let replyId: number | null = null;
      try {
        const recentUsers = await db
          .select()
          .from(schema.userMessages)
          .orderBy(desc(schema.userMessages.id))
          .limit(8);
        const recentReplies = await db
          .select()
          .from(schema.cocoaReplies)
          .orderBy(desc(schema.cocoaReplies.id))
          .limit(8);
        type Line = { at: number; who: string; text: string };
        const lines: Line[] = [
          ...recentUsers.map((r) => ({
            at: r.createdAt.getTime(),
            who: "らて",
            text: r.text,
          })),
          ...recentReplies.map((r) => ({
            at: r.createdAt.getTime(),
            who: "ここあ",
            text: r.text,
          })),
        ]
          .sort((a, b) => a.at - b.at)
          .slice(-10);
        const history = lines.map((l) => `${l.who}: ${l.text}`).join("\n");
        // タイムラインの投稿タップで始まった会話は、その投稿の話題を
        // 文脈として保つ（別の投稿がタップされるか、日付が変わるまで）。
        const activeTopic = await loadActiveTopic(
          ctx,
          tokyoDate(new Date()),
        );
        const topicBlock = activeTopic
          ? `\n\nいまの話題（タイムラインの投稿から始まった会話）:\n投稿: ${activeTopic.text}${activeTopic.topic ? `\n主題: ${activeTopic.topic}` : ""}\nらての返事がこの話題に触れている間は、この話題の文脈で自然にお返事してください。話題と関係のない話になったら、無理に引き戻さなくて大丈夫です。`
          : "";
        // 相互連携: 今日の共有文脈（お花畑・記念日はこのスペース自身の知識、
        // 日記の内容はダイアリー側から取り込んだ当日のスナップショット）。
        // 読めない日はブロック自体が付かないので、返事は従来どおりになる。
        // 毎回無理に触れるのではなく、らての話と関係するときだけ自然に使う。
        const shared = await buildSharedContext(ctx, tokyoDate(new Date()));
        const diary = await loadDiaryContext(ctx, tokyoDate(new Date()));
        const knowledgeLines: string[] = [
          `お花畑: ${shared.garden.cycleMonth}ヶ月目のお花は${shared.garden.flower}、いまは${shared.garden.stage}の時期（開花まであと${shared.garden.daysUntilBloom}日）`,
        ];
        if (shared.anniversaryNote) {
          knowledgeLines.push(shared.anniversaryNote);
        }
        if (diary?.hitokoto) {
          knowledgeLines.push(
            `今日の日記に書いた一言: ${diary.hitokoto}（らてが日記の話をしたら「今日の日記に書いたけど…」のように自然に触れてよい）`,
          );
        }
        if (diary && diary.antenna.length > 0) {
          knowledgeLines.push(
            `今日のアンテナショップのお便り: ${diary.antenna
              .map((a) => `${a.shop}「${a.headline}」`)
              .join("、")}`,
          );
        }
        if (diary?.spot) {
          knowledgeLines.push(
            `今日の近場スポット: ${diary.spot.name}（${diary.spot.note}）`,
          );
        }
        const knowledgeBlock = `\n\n今日の ここあ の知っていること（ダイアリーと共通の文脈。らての話と関係するときだけ自然に使ってください。関係ないときは無理に触れないでください）:\n${knowledgeLines
          .map((line) => `- ${line}`)
          .join("\n")}`;
        const reply = await Promise.race([
          ctx.inference.complete(
            `これまでのトーク:\n${history}${topicBlock}${knowledgeBlock}\n\nらての いちばん新しいメッセージ「${args.text}」への お返事を、ここあ として書いてください。`,
            {
              schema: z.string(),
              system: night ? COCOA_CHAT_SLEEPY_SYSTEM : COCOA_CHAT_SYSTEM,
            },
          ),
          new Promise<never>((_, reject) => {
            setTimeout(
              () => reject(new Error("cocoa reply inference timed out")),
              REPLY_TIMEOUT_MS,
            );
          }),
        ]);
        const trimmed = reply.trim();
        if (trimmed.length > 0) {
          replyText = normalizeCocoaText(trimmed).slice(0, 500);
        }
      } catch {
        replyText = null;
      }
      if (replyText == null) {
        const fallbacks = night
          ? FALLBACK_SLEEPY_REPLIES
          : FALLBACK_CHAT_REPLIES;
        replyText =
          fallbacks[inserted.id % fallbacks.length] ??
          (night ? "ん…らて？ねむい…" : "うんうん、聞いてるよ♡");
      }
      // 夜は「呼ばれる→起きる」までの間を少し置く。最低所要時間までだけ待ち、
      // 推論の上限（25秒）を超えて待つことはないので固まらない。
      if (night) {
        const elapsed = Date.now() - startedAt;
        const wait = SLEEPY_MIN_REPLY_MS - elapsed;
        if (wait > 0) {
          await sleepMs(wait);
        }
      }
      try {
        const ins = await db
          .insert(schema.cocoaReplies)
          .values({ text: replyText, replyToId: inserted.id })
          .returning({ id: schema.cocoaReplies.id });
        replyId = ins[0]?.id ?? null;
      } catch {
        replyId = null;
      }
      ctx.invalidateQueries();
      return { id: inserted.id, replyId, replyText, night };
    },
  }),

  createUserPost: defineAction({
    description:
      "Publishes one post (つぶやき) written by the user to the timeline.",
    request: z.object({ text: z.string().min(1).max(280) }),
    response: createUserPostResponse,
    handler: async (ctx, args): Promise<z.infer<typeof createUserPostResponse>> => {
      const db = ctx.db<typeof schema>();
      const result = await db
        .insert(schema.userPosts)
        .values({ text: args.text.trim() })
        .returning({ id: schema.userPosts.id });
      const inserted = result[0];
      if (!inserted) {
        throw new Error("createUserPost: insert returned no rows");
      }
      ctx.invalidateQueries();
      return { id: inserted.id };
    },
  }),

  deleteUserPost: defineAction({
    description: "Deletes one of the user's own timeline posts by id.",
    request: z.object({ id: z.number() }),
    response: z.object({ ok: z.literal(true) }),
    handler: async (ctx, args): Promise<{ ok: true }> => {
      const db = ctx.db<typeof schema>();
      await db
        .delete(schema.userPosts)
        .where(eq(schema.userPosts.id, args.id));
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  markRead: defineAction({
    description: "Marks Cocoa's talk as read, clearing the unread badge.",
    request: z.object({}),
    response: z.object({ ok: z.literal(true) }),
    handler: async (ctx): Promise<{ ok: true }> => {
      const db = ctx.db<typeof schema>();
      await db
        .insert(schema.appState)
        .values({ key: "talk_read", value: "1" })
        .onConflictDoUpdate({
          target: schema.appState.key,
          set: { value: "1" },
        });
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  startPostTalk: defineAction({
    description:
      "Starts a talk conversation about one of Cocoa's timeline posts the user tapped: saves the post as the active talk topic (until another post is tapped or the Tokyo date changes) and generates and saves Cocoa's opening message about that post, referencing its topic, adding a little related color, and ending with one easy question for Latte. During night hours (23:00-06:59 JST) the opening is in the sleepy just-woken voice. simulateHour (0-23, Asia/Tokyo) exists only to verify the night branch.",
    request: z.object({
      postId: z.number().optional(),
      text: z.string().min(1).max(1000).optional(),
      topic: z.string().max(200).nullable().optional(),
      kind: z.string().max(40).nullable().optional(),
      simulateHour: z.number().int().min(0).max(23).optional(),
    }),
    response: startPostTalkResponse,
    handler: async (ctx, args): Promise<z.infer<typeof startPostTalkResponse>> => {
      const startedAt = Date.now();
      const night = isNightHour(args.simulateHour ?? tokyoHourNow());
      const db = ctx.db<typeof schema>();
      // 自動投稿は DB の行を正とする（保存済みの topic ラベルを使う）
      let postText = args.text?.trim() ?? "";
      let postTopic: string | null = args.topic ?? null;
      let postKind: string | null = args.kind ?? null;
      if (args.postId != null) {
        const rows = await db
          .select()
          .from(schema.posts)
          .where(eq(schema.posts.id, args.postId));
        const row = rows[0];
        if (row) {
          postText = row.text;
          postTopic = row.topic ?? postTopic;
          postKind = row.kind;
        }
      }
      if (postText.length === 0) {
        throw new Error("startPostTalk: post text is required");
      }
      const today = tokyoDate(new Date());
      await saveActiveTopic(ctx, {
        topic: postTopic,
        text: postText,
        kind: postKind,
        date: today,
      });
      const topicLabel = postTopic ?? postText.slice(0, 60);
      let replyText: string | null = null;
      try {
        const reply = await Promise.race([
          ctx.inference.complete(
            `タイムラインに投稿した内容について、らてがその投稿をタップして話しかけてきました。トークで、その投稿の話をここあから切り出してください。\n\n投稿の本文: ${postText}\n投稿の主題: ${topicLabel}\n\nルール: 投稿の具体的な内容（主題や本文の言葉）に必ず触れること。投稿への感想・小さな豆知識・思い出風のひと言のどれか1つを添えること。最後は、らてが答えやすい短い質問を1つだけ（好き嫌い、二択、やったことある？ のような形）で終えること。全体で2〜3文。`,
            {
              schema: z.string(),
              system: night ? COCOA_CHAT_SLEEPY_SYSTEM : COCOA_CHAT_SYSTEM,
            },
          ),
          new Promise<never>((_, reject) => {
            setTimeout(
              () => reject(new Error("post talk inference timed out")),
              REPLY_TIMEOUT_MS,
            );
          }),
        ]);
        const trimmed = reply.trim();
        if (trimmed.length > 0) {
          replyText = normalizeCocoaText(trimmed).slice(0, 500);
        }
      } catch {
        replyText = null;
      }
      if (replyText == null) {
        replyText = night
          ? `ん…らて、「${topicLabel}」の投稿、見てくれたんだ♡ねむいけど気になってたの。らてはどう思った？…また寝ちゃう前に教えて？`
          : `らて、「${topicLabel}」の投稿のこと、話したくなっちゃった♡ここあはけっこう気に入ってるんだ。らてはどう思った？`;
      }
      if (night) {
        const elapsed = Date.now() - startedAt;
        const wait = SLEEPY_MIN_REPLY_MS - elapsed;
        if (wait > 0) {
          await sleepMs(wait);
        }
      }
      let replyId: number | null = null;
      try {
        const ins = await db
          .insert(schema.cocoaReplies)
          .values({ text: replyText, replyToId: null })
          .returning({ id: schema.cocoaReplies.id });
        replyId = ins[0]?.id ?? null;
      } catch {
        replyId = null;
      }
      ctx.invalidateQueries();
      return { replyId, replyText, night };
    },
  }),

  refreshDailyPosts: defineAction({
    description:
      "Publishes Cocoa's scheduled post for one daily slot (morning = Tokyo weather, noon = trend slot rotating through widened genres: JK trends, food/gourmet, seasonal lifehacks, entertainment, study/word trivia and JK surveys, evening = spot slot rotating through Tokyo spots/events, antenna-shop news from the five followed shops, and seasonal Tokyo events/markets), researched from live sources. Skips when that kind was already posted today (Asia/Tokyo). For trend and spot posts, topics from the last 7 days of same-kind posts are passed to generation as an exclusion list and the result is checked again for a topic collision (main subject match); a collision triggers one regeneration with a different topic, and if it still collides the post is skipped with reason duplicate_topic. Each new post stores its main subject in posts.topic for future comparisons. On a monthly anniversary day (the 23rd, months after they met on 2026-10-23) the morning run also posts one anniversary timeline post and one anniversary talk message (idempotent per date), and the noon trend post is replaced by the anniversary post. simulateDate (YYYY-MM-DD) exists only to verify the anniversary branch without waiting for the 23rd.",
    request: z.object({
      slot: z.enum(["morning", "noon", "evening"]),
      simulateDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    }),
    response: refreshResponse,
    handler: async (ctx, args): Promise<z.infer<typeof refreshResponse>> => {
      const kind = SLOT_KIND[args.slot];
      const db = ctx.db<typeof schema>();
      const slotDate = args.simulateDate ?? tokyoDate(new Date());
      const annivMonths = anniversaryMonths(slotDate);

      // 記念日のお昼: トレンド投稿は記念日投稿に置き換える（その日の投稿総数を増やさない）
      if (args.slot === "noon" && annivMonths != null) {
        const todays = await db
          .select()
          .from(schema.posts)
          .where(eq(schema.posts.slotDate, slotDate));
        const annivRow = todays.find((row) => row.kind === "anniv");
        return {
          ok: true as const,
          posted: false,
          reason: "anniversary_replaces_trend",
          postId: annivRow?.id ?? null,
        };
      }

      // 記念日の朝: タイムラインに記念日投稿を1件 + トークに記念日メッセージを1件。
      // 投稿は (kind, slot_date) のユニーク制約、トークは app_state のマーカーで冪等にする。
      // 過ぎた月の分は遡って祝わない（今日が記念日のときだけ祝う）。
      if (args.slot === "morning" && annivMonths != null) {
        const todays = await db
          .select()
          .from(schema.posts)
          .where(eq(schema.posts.slotDate, slotDate));
        if (!todays.find((row) => row.kind === "anniv")) {
          const text = await composeAnniversaryPost(ctx, annivMonths);
          try {
            await db.insert(schema.posts).values({
              kind: "anniv",
              text,
              sourceTitle: null,
              sourceUrl: null,
              slotDate,
            });
          } catch {
            // 同日同種のユニーク制約に当たった場合は既に投稿済みとして扱う
          }
        }
        const markerKey = `anniv_talk_${slotDate}`;
        const marker = await db
          .select()
          .from(schema.appState)
          .where(eq(schema.appState.key, markerKey));
        if (!marker[0]) {
          const talkText = await composeAnniversaryTalk(ctx, annivMonths);
          await db.insert(schema.cocoaReplies).values({
            text: talkText,
            replyToId: null,
          });
          await db
            .insert(schema.appState)
            .values({ key: markerKey, value: "1" })
            .onConflictDoUpdate({
              target: schema.appState.key,
              set: { value: "1" },
            });
        }
      }
      const existing = await db
        .select()
        .from(schema.posts)
        .where(eq(schema.posts.slotDate, slotDate));
      const dup = existing.find((row) => row.kind === kind);
      if (dup) {
        return {
          ok: true as const,
          posted: false,
          reason: "already_posted_today",
          postId: dup.id,
        };
      }
      // 話題の重複防止: トレンド／スポットは直近7日分（slotDate 基準）の
      // 同種投稿を読み、その話題を除外リストとして生成へ渡す。生成後にも
      // topicCollides で照合し、被っていたら除外リストにその話題を足して
      // 1回だけ作り直す。それでも被れば今日は投稿しない（duplicate_topic）。
      // 天気は日付固有なので対象外（topic の記録のみ）。この判定は
      // refreshDailyPosts の中にあるため、定期ジョブでも手動実行でも効く。
      const dedupApplies = kind === "trend" || kind === "spot";
      let recent: RecentPostRef[] = [];
      if (dedupApplies) {
        const recentRows = await db
          .select()
          .from(schema.posts)
          .where(
            and(
              eq(schema.posts.kind, kind),
              lt(schema.posts.slotDate, slotDate),
              gte(schema.posts.slotDate, daysBefore(slotDate, 7)),
            ),
          )
          .orderBy(desc(schema.posts.id))
          .limit(14);
        recent = recentRows.map((row) => ({
          topic: row.topic,
          text: row.text,
          sourceTitle: row.sourceTitle,
          slotDate: row.slotDate,
        }));
      }
      const baseExclusions = exclusionLabels(recent);
      let composed: ComposedPost | null = null;
      let collidedTopic: string | null = null;
      let sawCollision = false;
      const maxAttempts = dedupApplies && recent.length > 0 ? 2 : 1;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const exclusions =
          attempt > 0 && collidedTopic
            ? [...baseExclusions, collidedTopic]
            : baseExclusions;
        let candidate: ComposedPost | null = null;
        try {
          candidate = await composePost(ctx, kind, exclusions, slotDate);
        } catch {
          candidate = null;
        }
        if (!candidate || candidate.text.length === 0) {
          composed = null;
          break;
        }
        if (
          dedupApplies &&
          topicCollides(candidate.topic, candidate.text, recent)
        ) {
          sawCollision = true;
          collidedTopic = candidate.topic ?? candidate.text.slice(0, 60);
          composed = null;
          continue;
        }
        composed = candidate;
        break;
      }
      if (!composed || composed.text.length === 0) {
        return {
          ok: true as const,
          posted: false,
          reason: sawCollision ? "duplicate_topic" : "no_source_data",
          postId: null,
        };
      }
      try {
        const result = await db
          .insert(schema.posts)
          .values({
            kind,
            text: composed.text,
            sourceTitle: composed.sourceTitle,
            sourceUrl: composed.sourceUrl,
            topic: composed.topic,
            slotDate,
          })
          .returning({ id: schema.posts.id });
        const inserted = result[0];
        if (!inserted) {
          return {
            ok: true as const,
            posted: false,
            reason: "insert_failed",
            postId: null,
          };
        }
        ctx.invalidateQueries();
        return {
          ok: true as const,
          posted: true,
          reason: "posted",
          postId: inserted.id,
        };
      } catch {
        // 同日同種のユニーク制約に当たった場合は既存行を返す
        const after = await db
          .select()
          .from(schema.posts)
          .where(eq(schema.posts.slotDate, slotDate));
        const row = after.find((r) => r.kind === kind);
        return {
          ok: true as const,
          posted: false,
          reason: "already_posted_today",
          postId: row?.id ?? null,
        };
      }
    },
  }),
} satisfies ActionsModule;
