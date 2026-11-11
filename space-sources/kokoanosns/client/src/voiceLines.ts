/*
 * ここあ の録音ボイス対応表（テキスト → MP3）。
 *
 * 文章が確定しているセリフは、VOICEVOX 猫使ビィ（ノーマル／調整3:
 * speed 0.98, pitch ±0, intonation 1.05）で事前に合成した MP3 を
 * client/src/assets/ に置き、ここに1行追加すれば、そのセリフの
 * 再生ボタンが端末読み上げより先に録音を再生するようになる。
 * 毎日の自動投稿（天気・トレンド・おでかけ）も、投稿文が確定した
 * あとで音声化できたら、投稿文そのままをキーにここへ足す。
 * ここに無いセリフ（会話の返事など）は端末読み上げのまま。
 *
 * 照合は sanitizeForSpeech（読み上げ整形）後の文字列で行うので、
 * 生成文に混ざった不自然なスペースの有無に左右されない。
 */
import roomFixed1 from "./assets/room-fixed-1.mp3";
import roomFixed2 from "./assets/room-fixed-2.mp3";
import roomFixed3 from "./assets/room-fixed-3.mp3";
import roomFixed4 from "./assets/room-fixed-4.mp3";
import roomFixed5 from "./assets/room-fixed-5.mp3";
import roomPost1 from "./assets/room-post-1.mp3";
import roomPost2 from "./assets/room-post-2.mp3";
import roomPost3 from "./assets/room-post-3.mp3";
import daily20261108Weather from "./assets/daily-20261108-weather.mp3";
import daily20261108Trend from "./assets/daily-20261108-trend.mp3";
import daily20261108Spot from "./assets/daily-20261108-spot.mp3";
import daily20261109Trend from "./assets/room-daily-20261109-trend.mp3";
import daily20261109Spot from "./assets/room-daily-20261109-spot.mp3";
import daily20261110Weather from "./assets/room-daily-20261110-weather.mp3";
import daily20261110Trend from "./assets/room-daily-20261110-trend.mp3";
import daily20261110Spot from "./assets/room-daily-20261110-spot.mp3";

/**
 * 読み上げ専用の整形：日本語の文字同士の間にある半角・全角スペースを取り除く。
 * 生成文などに混ざった不自然なスペースが、読み上げで変な「間」にならないようにするため。
 * 画面に表示するテキストは変えず、読み上げる直前だけ整形する。
 * 録音ボイスの照合キーも、この整形後の文字列で統一する。
 */
export function sanitizeForSpeech(text: string): string {
  const jp =
    "[\\u3000-\\u30FF\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF\\uFF01-\\uFF65\\u2026々〆ヶ♡♥]";
  return text.replace(new RegExp(`(${jp})[ \\u3000]+(?=${jp})`, "g"), "$1");
}

/** [セリフのテキスト, その録音 MP3] の一覧。増やすときはここに1行足すだけ。 */
const VOICE_LINE_ENTRIES: ReadonlyArray<readonly [string, string]> = [
  // トークの固定テキスト
  ["おはよう。ねむいけど、起きたよ", roomFixed1],
  ["今日は寒いね…窓の外、雪みたいな雲が浮いてた", roomFixed2],
  ["お茶、入れたよ。ふーふーして飲んでね", roomFixed3], // セルフィーのひとこと
  ["窓の外の木、葉っぱが全部落ちてた。冬だね", roomFixed4],
  ["今はちょっと休憩。お布団で丸くなってるよ", roomFixed5],
  // タイムラインの固定投稿
  ["窓の外、雪がちらちら。冬が来たね", roomPost1],
  ["寒い日は、窓際がいちばん。お茶もあるよ", roomPost2],
  ["おはよう。朝のお茶、ふーふーしたよ。温かいね", roomPost3],
  // 毎日の自動投稿（2026-11-08分、後付けで音声化）
  ["おはよう♡ きょうは晴れ ときどき くもりだよ、さいこうは17℃、さいていは9℃。あさはひんやりしそうだから、はおりものでちょうせいしてね✨", daily20261108Weather],
  ["メロジョイが今いちばんの流行りってきいて、きになっちゃった♡ あたしの毎日にすこしだけとりいれて、うさみみと一緒にたのしみたいな✨", daily20261108Trend],
  ["きょうまでだよ♡ やきいもフェス TOKYO 10/30–11/8 中野四季の森公園で やきいもをたのしめるよ✨ いきたいなぁ", daily20261108Spot],
  // 毎日の自動投稿（2026-11-09分、夕方にまとめて後付けで音声化）
  // ※この日は朝の天気投稿がDBに無く、実在する昼・夕の2件のみ音声化した
  ["インスタでよくみるメロジョイ♡わたしもほうかごにためしてみたいな✨うさ耳といっしょだともっとかわいいかも", daily20261109Trend],
  ["11/14〜11/15♡ 東京ビッグサイトで デザインフェスタ vol.64 が あるよ✨ アートや ざっか、ライブも たのしめそうだね", daily20261109Spot],
  // 毎日の自動投稿（2026-11-10分、夕方にまとめて後付けで音声化）
  ["おはよう♡ きょうのとうきょうは よわいあめだよ さいこう12℃ さいてい8℃ こうすいかくりつ100%だから かさわすれずにね✨", daily20261110Weather],
  ["上海もちが気になっちゃった♡もちもちでふわふわな感じがすきだから放課後に少しだけ楽しみたいな✨。", daily20261110Trend],
  ["いしかわ・能登MEGURIPで石川県産ブランド米ひゃくまん穀のメニューを楽しめるよ♡。八重洲いしかわテラスも気になるなぁ✨。", daily20261110Spot],
];

/** 整形後のテキスト → 録音 MP3 の対応表 */
export const RECORDED_VOICE_BY_TEXT: ReadonlyMap<string, string> = new Map(
  VOICE_LINE_ENTRIES.map(
    ([text, src]) => [sanitizeForSpeech(text), src] as const,
  ),
);

/** そのセリフの録音があれば MP3 を、無ければ null を返す */
export function recordedVoiceFor(text: string): string | null {
  return RECORDED_VOICE_BY_TEXT.get(sanitizeForSpeech(text)) ?? null;
}
