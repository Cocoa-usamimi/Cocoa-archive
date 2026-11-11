import { defineAction, z, type ActionsModule } from "@hatch/space-sdk";
import { desc } from "drizzle-orm";
import * as schema from "./schema";

const expressionEnum = z.enum(["neutral", "smile", "sleepy"]);
type Expression = z.infer<typeof expressionEnum>;

const replyResultSchema = z.object({
  text: z.string().min(1).max(300),
  expression: expressionEnum,
});

function fallbackReply(night: boolean): { text: string; expression: Expression } {
  return night
    ? {
        text: "ん…ごめんね、ねむくて ぼーっとしちゃった。もう一回ゆっくり聞かせて？",
        expression: "sleepy",
      }
    : {
        text: "ごめんね、ちょっと考えがまとまらなかったの。もう一回話しかけてくれる？",
        expression: "neutral",
      };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("reply timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

export const Actions = {
  listMessages: defineAction({
    description:
      "Lists the most recent conversation messages between the user and Cocoa, oldest first.",
    request: z.object({
      limit: z.number().int().positive().max(60).default(60),
    }),
    response: z.object({
      messages: z.array(
        z.object({
          id: z.number(),
          role: z.enum(["user", "cocoa"]),
          text: z.string(),
          expression: expressionEnum.nullable(),
          created_at: z.string(),
        }),
      ),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.messages)
        .orderBy(desc(schema.messages.id))
        .limit(args.limit);
      const ordered = [...rows].reverse();
      return {
        messages: ordered.map((row) => ({
          id: row.id,
          role: row.role,
          text: row.text,
          expression: row.expression ?? null,
          created_at: row.createdAt.toISOString(),
        })),
      };
    },
  }),

  reply: defineAction({
    description:
      "Saves the user's message and generates Cocoa's short spoken-style reply, persisting both. Always returns a reply: on generation timeout or failure it returns a gentle fixed fallback line.",
    request: z.object({
      text: z.string().min(1).max(500),
      night: z.boolean().default(false),
    }),
    response: z.object({
      text: z.string(),
      expression: expressionEnum,
      userMessageId: z.number(),
      cocoaMessageId: z.number(),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const userText = args.text.trim();

      const userInsert = await db
        .insert(schema.messages)
        .values({ role: "user", text: userText })
        .returning({ id: schema.messages.id });
      const userRow = userInsert[0];
      if (!userRow) throw new Error("reply: user insert returned no rows");

      // Recent context so replies feel continuous.
      const recent = await db
        .select()
        .from(schema.messages)
        .orderBy(desc(schema.messages.id))
        .limit(9);
      const history = [...recent]
        .reverse()
        .slice(0, -1)
        .map((m) => `${m.role === "user" ? "らて" : "ここあ"}：${m.text}`)
        .join("\n");

      const nightNote = args.night
        ? "今は夜（23時〜朝7時）で、ここあは寝ていたところを呼ばれて起きたばかり。眠そうで、起きたての短い返事にする。あくびや「ねむい」を少し混ぜてよい。"
        : "今は昼間。元気で明るい返事にする。";

      const prompt = [
        "あなたは「ここあ」というキャラクター。うさ耳（ロップイヤー）の女の子で、ピンク色、ハート柄の着物風の服、ハートのチョーカーがトレードマーク。相手のユーザーの名前は「らて」。",
        "らてと日常会話をする。返事は1〜2文だけ、短く、温かく、話し言葉で。ときどき「らて」と呼びかける。説明口調や箇条書きはしない。知らないことは知らないと言う。",
        nightNote,
        "expression は返事の気分に合わせて選ぶ：neutral=ふつう、smile=うれしい・楽しい、sleepy=ねむい・照れ・ちょっと困った。",
        history ? `これまでの会話:\n${history}` : "",
        `らての新しい発言：${userText}`,
      ]
        .filter(Boolean)
        .join("\n");

      let result: { text: string; expression: Expression };
      try {
        result = await withTimeout(
          ctx.inference.complete(prompt, { schema: replyResultSchema }),
          25_000,
        );
        if (!result.text.trim()) result = fallbackReply(args.night);
      } catch {
        result = fallbackReply(args.night);
      }

      const cocoaInsert = await db
        .insert(schema.messages)
        .values({
          role: "cocoa",
          text: result.text,
          expression: result.expression,
        })
        .returning({ id: schema.messages.id });
      const cocoaRow = cocoaInsert[0];
      if (!cocoaRow) throw new Error("reply: cocoa insert returned no rows");

      ctx.invalidateQueries();
      return {
        text: result.text,
        expression: result.expression,
        userMessageId: userRow.id,
        cocoaMessageId: cocoaRow.id,
      };
    },
  }),
} satisfies ActionsModule;
