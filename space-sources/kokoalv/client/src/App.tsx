import { useEffect, useRef, useState } from "react";
import {
useMutation,
useQuery,
useQueryClient,
} from "@tanstack/react-query";
import { SafeAreaTopScrim } from "@hatch/space-sdk/client";
import { api, type ApiResponse } from "./api";
import {
mapsDirectionsUrl,
mapsSearchUrl,
mountPlaceListMap,
type PlaceRefLike,
} from "./map-helpers.mjs";

type TripSummary = ApiResponse<typeof api, "listTrips">["trips"][number];
type TripDetail = NonNullable<
  ApiResponse<typeof api, "getTrip">["trip"]
>;
type Spot = TripDetail["spots"][number];
type GuideItem = ApiResponse<typeof api, "listGuide">["items"][number];

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function formatTripDate(iso: string): string {
  const [y = 1970, m = 1, d = 1] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return iso;
  return `${y}年${m}月${d}日（${WEEKDAYS[date.getDay()] ?? ""}）`;
}

const KIND_LABEL: Record<TripSummary["kind"], string> = {
  walk: "おさんぽ",
  scout: "遠征の下見",
  antenna: "アンテナの先",
};

function placeRef(spot: Spot): PlaceRefLike {
  return {
    label: spot.name,
    address: spot.address ?? undefined,
    lat: spot.lat ?? undefined,
    lng: spot.lng ?? undefined,
  };
}

function HeartMark({
  marked,
  onToggle,
  spotName,
}: {
  marked: boolean;
  onToggle: () => void;
  spotName: string;
}) {
  return (
    <button
      type="button"
      aria-label={`${spotName}にいっしょに行きたい印を${marked ? "外す" : "付ける"}`}
      aria-pressed={marked}
      onClick={onToggle}
      className={`flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors ${
        marked
          ? "bg-[var(--accent-strong)] text-white"
          : "bg-[var(--surface-alt)] text-[var(--dim)]"
      }`}
    >
      <span aria-hidden className="text-base leading-none">
        {marked ? "♥" : "♡"}
      </span>
      いっしょに行きたい
    </button>
  );
}

function formatPostedDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** Per-spot illustration + Instagram おすすめスポット controls. */
function SpotMediaControls({ spot }: { spot: Spot }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [requested, setRequested] = useState(false);
  const illustration = useMutation({
    mutationFn: async () =>
      await api.generateSpotIllustration({ spotId: spot.id }),
    onSuccess: () => void queryClient.invalidateQueries(),
  });
  const post = useMutation({
    mutationFn: async () =>
      await api.postSpotToInstagram({ spotId: spot.id }),
    onSuccess: (res) => {
      if (res.ok) setRequested(true);
      setConfirming(false);
    },
  });

  return (
    <div className="mt-3">
      {spot.illustrationUrl ? (
        <figure>
          <img
            src={spot.illustrationUrl}
            alt={`${spot.name}にいるここあの挿絵`}
            className="w-full max-w-xs rounded-[var(--radius)] border border-[var(--border)] object-cover"
            loading="lazy"
          />
          <figcaption className="mt-1 text-xs text-[var(--dim)]">
            🎨 {spot.name}の挿絵（バーチャル下見）
          </figcaption>
        </figure>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => illustration.mutate()}
            disabled={illustration.isPending}
            className="flex min-h-11 items-center rounded-full bg-[var(--surface-alt)] px-3 text-sm font-medium disabled:opacity-50"
          >
            {illustration.isPending
              ? "挿絵を描いてる…"
              : "このスポットの挿絵を作る"}
          </button>
          {illustration.data && !illustration.data.ok && (
            <span className="text-xs text-[var(--accent-strong)]">
              挿絵は作れなかった…。また今度試してみて。
            </span>
          )}
        </div>
      )}

      {spot.illustrationUrl &&
        (spot.igPostedAt ? (
          <p className="mt-2 text-sm text-[var(--dim)]">
            <span className="font-round font-bold text-[var(--accent-strong)]">
              Instagram投稿済み
            </span>
            （{formatPostedDate(spot.igPostedAt)}・おすすめスポット）
            {spot.igPostUrl && (
              <>
                {" "}
                <a
                  href={spot.igPostUrl}
                  target="_blank"
                  rel="noopener"
                  className="underline"
                >
                  投稿を見る
                </a>
              </>
            )}
          </p>
        ) : requested ? (
          <p className="mt-2 text-sm text-[var(--dim)]">
            Instagramへの投稿を頼んだよ。届いたら、ここに「投稿済み」が付く。
          </p>
        ) : confirming ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-sm">
              この挿絵で「ここあのおすすめスポット」として投稿する？
            </span>
            <button
              type="button"
              onClick={() => post.mutate()}
              disabled={post.isPending}
              className="min-h-11 rounded-full bg-[var(--accent)] px-4 text-sm font-bold text-white disabled:opacity-50"
            >
              {post.isPending ? "頼んでる…" : "投稿する"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="min-h-11 rounded-full px-3 text-sm text-[var(--dim)] underline"
            >
              やめておく
            </button>
            {post.data && !post.data.ok && (
              <span className="text-xs text-[var(--accent-strong)]">
                {post.data.reason ?? "頼めなかった…"}
              </span>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="mt-2 flex min-h-11 items-center rounded-full bg-[var(--surface-alt)] px-3 text-sm font-medium"
          >
            Instagramにおすすめスポットとして投稿
          </button>
        ))}
    </div>
  );
}

/** Map + numbered course list. Pins and rows stay in sync via the helper;
 * when the map control is unavailable the list alone carries the course. */
function CourseSection({
  spots,
  onToggleWant,
}: {
  spots: Spot[];
  onToggleWant: (spot: Spot) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Array<HTMLLIElement | null>>([]);
  const [mapGone, setMapGone] = useState(false);
  const coordSpots = spots.filter((s) => s.lat != null && s.lng != null);
  const coordKey = coordSpots.map((s) => s.id).join(",");

  useEffect(() => {
    const el = mapRef.current;
    if (!el || coordSpots.length === 0) return;
    const rows = coordSpots
      .map((s) => rowRefs.current[spots.indexOf(s)] ?? null)
      .filter((r): r is HTMLLIElement => r != null);
    if (rows.length !== coordSpots.length) return;
    const handle = mountPlaceListMap(
      el,
      {
        places: coordSpots.map(placeRef),
        rows,
        baseStyle: "light",
      },
      () => setMapGone(true),
    );
    if (!handle) setMapGone(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordKey]);

  return (
    <div>
      {coordSpots.length > 0 && !mapGone && (
        <div
          ref={mapRef}
          role="img"
          aria-label="コースの地図"
          className="mb-4 h-64 w-full overflow-hidden rounded-[var(--radius)] border border-[var(--border)]"
        />
      )}
      <ol className="relative space-y-3">
        {spots.map((spot, i) => {
          const searchUrl = mapsSearchUrl(placeRef(spot));
          const dirUrl = mapsDirectionsUrl(placeRef(spot), {
            travelmode: "walking",
          });
          return (
            <li
              key={spot.id}
              ref={(el) => {
                rowRefs.current[i] = el;
              }}
              className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="font-round flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-bold text-white"
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <h4 className="font-round text-base font-bold">
                      {spot.name}
                    </h4>
                    {spot.category && (
                      <span className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 text-xs text-[var(--dim)]">
                        {spot.category}
                      </span>
                    )}
                    {spot.rating != null && (
                      <span className="text-xs text-[var(--dim)]">
                        ★ {spot.rating.toFixed(1)}
                        {spot.ratingCount != null &&
                          `（${spot.ratingCount}件）`}
                      </span>
                    )}
                  </div>
                  {spot.address && (
                    <p className="mt-0.5 text-xs text-[var(--dim)]">
                      {spot.address}
                    </p>
                  )}
                  <p className="mt-2 text-sm leading-relaxed">{spot.memo}</p>
                  {spot.highlight && (
                    <p className="mt-2 text-sm leading-relaxed">
                      <span className="font-round mr-1 font-bold text-[var(--accent-strong)]">
                        案内ポイント
                      </span>
                      {spot.highlight}
                    </p>
                  )}
                  {spot.tips && (
                    <p className="mt-1 text-sm leading-relaxed text-[var(--dim)]">
                      <span className="font-round mr-1 font-bold">
                        メモ
                      </span>
                      {spot.tips}
                    </p>
                  )}
                  {spot.hoursNote && (
                    <p className="mt-1 text-xs text-[var(--dim)]">
                      🕐 {spot.hoursNote}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <HeartMark
                      marked={spot.wantToGo}
                      spotName={spot.name}
                      onToggle={() => onToggleWant(spot)}
                    />
                    {dirUrl && (
                      <a
                        href={dirUrl}
                        target="_blank"
                        rel="noopener"
                        className="flex min-h-11 items-center rounded-full bg-[var(--surface-alt)] px-3 text-sm font-medium"
                      >
                        ここへの道順
                      </a>
                    )}
                    {!dirUrl && searchUrl && (
                      <a
                        href={searchUrl}
                        target="_blank"
                        rel="noopener"
                        className="flex min-h-11 items-center rounded-full bg-[var(--surface-alt)] px-3 text-sm font-medium"
                      >
                        地図で見る
                      </a>
                    )}
                    {spot.sourceUrl && (
                      <a
                        href={spot.sourceUrl}
                        target="_blank"
                        rel="noopener"
                        className="flex min-h-11 items-center px-2 text-sm text-[var(--dim)] underline"
                      >
                        出典
                      </a>
                    )}
                  </div>
                  <SpotMediaControls spot={spot} />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function GuideMemoEditor({ spot }: { spot: Spot }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(spot.guideMemo ?? "");
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: async () =>
      await api.updateGuideMemo({ spotId: spot.id, guideMemo: text }),
    onSuccess: () => {
      setSaved(true);
      void queryClient.invalidateQueries();
    },
  });
  return (
    <div className="mt-3">
      <label
        htmlFor={`guide-memo-${spot.id}`}
        className="font-round text-sm font-bold text-[var(--sage)]"
      >
        案内メモ（らての書き込み）
      </label>
      <div className="mt-1 flex gap-2">
        <input
          id={`guide-memo-${spot.id}`}
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSaved(false);
          }}
          placeholder="例：着いたらまず駅舎の前で写真"
          className="min-h-11 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
        />
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="min-h-11 shrink-0 rounded-full bg-[var(--sage)] px-4 text-sm font-bold text-white disabled:opacity-50"
        >
          {saved ? "保存したよ" : "保存"}
        </button>
      </div>
    </div>
  );
}

function TripDetailView({
  tripId,
  onBack,
}: {
  tripId: number;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ["trip", tripId],
    queryFn: () => api.getTrip({ tripId }),
    refetchInterval: (query) =>
      query.state.data?.trip?.status === "draft" ? 8000 : false,
  });
  const toggleWant = useMutation({
    mutationFn: async (spot: Spot) =>
      await api.toggleWant({ spotId: spot.id, want: !spot.wantToGo }),
    onSuccess: () => void queryClient.invalidateQueries(),
  });
  const photo = useMutation({
    mutationFn: async () => await api.generateTripPhoto({ tripId }),
    onSuccess: () => void queryClient.invalidateQueries(),
  });
  const retry = useMutation({
    mutationFn: async () => await api.retryTripPlan({ tripId }),
    onSuccess: () => void queryClient.invalidateQueries(),
  });
  const illustrations = useMutation({
    mutationFn: async () =>
      await api.generateMissingIllustrations({ tripId }),
    onSuccess: () => void queryClient.invalidateQueries(),
  });

  const trip = detail.data?.trip;

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-3 flex min-h-11 items-center gap-1 text-sm font-medium text-[var(--dim)]"
      >
        ← 日記一覧へ
      </button>
      {detail.isPending && (
        <p className="py-10 text-center text-sm text-[var(--dim)]">
          日記を開いてる…
        </p>
      )}
      {detail.error && (
        <p className="py-10 text-center text-sm text-[var(--accent-strong)]">
          読み込めなかった。もう一度開いてみて。
        </p>
      )}
      {trip && (
        <article>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--dim)]">
            <span className="rounded-full bg-[var(--accent)] px-2.5 py-1 font-bold text-white">
              {KIND_LABEL[trip.kind]}
            </span>
            <span>{formatTripDate(trip.tripDate)}</span>
            <span>{trip.areaLabel}</span>
            {trip.weather && <span>☀ {trip.weather}</span>}
            {trip.mood && <span>きぶん：{trip.mood}</span>}
          </div>
          <h2 className="font-round mt-2 text-2xl font-bold leading-snug">
            {trip.title}
          </h2>

          {trip.status === "draft" && (
            <div className="mt-4 rounded-[var(--radius)] border border-dashed border-[var(--accent)] bg-[var(--surface)] p-4 text-sm leading-relaxed">
              ここあが今まさに下見中…。コースが決まったら、ここに日記が届くよ。
              少し待ってから開き直してみて。
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => retry.mutate()}
                  disabled={retry.isPending}
                  className="min-h-11 rounded-full bg-[var(--surface-alt)] px-4 text-sm font-medium disabled:opacity-50"
                >
                  なかなか届かない時は、もう一度頼む
                </button>
              </div>
            </div>
          )}

          {trip.status === "ready" && (
            <>
              {trip.photoUrl ? (
                <figure className="mt-4">
                  <img
                    src={trip.photoUrl}
                    alt={trip.photoCaption ?? `${trip.areaLabel}にいるここあ`}
                    className="w-full rounded-[var(--radius)] border border-[var(--border)] object-cover"
                  />
                  {trip.photoCaption && (
                    <figcaption className="mt-1.5 text-xs text-[var(--dim)]">
                      📷 {trip.photoCaption}（実際に行った写真じゃなくて、下見のイメージだよ）
                    </figcaption>
                  )}
                </figure>
              ) : (
                <div className="mt-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
                  <p className="text-sm text-[var(--dim)]">
                    この旅の「ここあがいる写真」はまだないよ。
                  </p>
                  <button
                    type="button"
                    onClick={() => photo.mutate()}
                    disabled={photo.isPending}
                    className="mt-2 min-h-11 rounded-full bg-[var(--accent)] px-4 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {photo.isPending
                      ? "写真を作ってる…"
                      : "ここあの写真を作る"}
                  </button>
                  {photo.data && !photo.data.ok && (
                    <p className="mt-2 text-xs text-[var(--accent-strong)]">
                      写真は作れなかった…。日記はそのまま読めるよ。
                    </p>
                  )}
                </div>
              )}

              <p className="mt-4 whitespace-pre-wrap text-base leading-loose">
                {trip.diary}
              </p>

              <h3 className="font-round mb-3 mt-8 text-lg font-bold">
                今日のコース
              </h3>
              {trip.spots.some((s) => !s.illustrationUrl) && (
                <div className="mb-4">
                  <button
                    type="button"
                    onClick={() => illustrations.mutate()}
                    disabled={illustrations.isPending}
                    className="min-h-11 rounded-full bg-[var(--surface-alt)] px-4 text-sm font-medium disabled:opacity-50"
                  >
                    {illustrations.isPending
                      ? "挿絵を描いてる…（少し時間がかかるよ）"
                      : "まだ挿絵のないスポットに挿絵を作る"}
                  </button>
                  {illustrations.data && (
                    <p className="mt-1.5 text-xs text-[var(--dim)]">
                      {illustrations.data.generated}件の挿絵ができたよ。
                      {illustrations.data.remaining > 0 &&
                        `あと${illustrations.data.remaining}件は次に作れる。`}
                    </p>
                  )}
                </div>
              )}
              <CourseSection
                spots={trip.spots}
                onToggleWant={(spot) => toggleWant.mutate(spot)}
              />

              {trip.spots.some((s) => s.wantToGo) && (
                <div className="mt-6 space-y-4">
                  {trip.spots
                    .filter((s) => s.wantToGo)
                    .map((s) => (
                      <div
                        key={s.id}
                        className="rounded-[var(--radius)] border border-[var(--sage)] bg-[var(--surface)] p-4"
                      >
                        <p className="font-round text-sm font-bold">
                          ♥ {s.name} の案内準備
                        </p>
                        <GuideMemoEditor spot={s} />
                      </div>
                    ))}
                </div>
              )}
            </>
          )}
        </article>
      )}
    </div>
  );
}

function TripCard({
  trip,
  onOpen,
}: {
  trip: TripSummary;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`日記「${trip.title}」を開く`}
      className="block w-full overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] text-left shadow-sm"
    >
      {trip.photoUrl && (
        <img
          src={trip.photoUrl}
          alt={trip.photoCaption ?? `${trip.areaLabel}にいるここあ`}
          className="h-44 w-full object-cover"
        />
      )}
      <div className="p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--dim)]">
          <span className="rounded-full bg-[var(--accent)] px-2.5 py-1 font-bold text-white">
            {KIND_LABEL[trip.kind]}
          </span>
          <span>{formatTripDate(trip.tripDate)}</span>
          <span>{trip.areaLabel}</span>
          {trip.weather && <span>☀ {trip.weather}</span>}
        </div>
        <p className="font-round mt-1.5 text-lg font-bold leading-snug">
          {trip.title}
        </p>
        <p className="mt-1 text-sm text-[var(--dim)]">
          {trip.status === "draft"
            ? "ここあが下見中…"
            : `スポット${trip.spotCount}件`}
          {trip.wantCount > 0 && (
            <span className="ml-2 font-bold text-[var(--accent-strong)]">
              ♥ いっしょに行きたい {trip.wantCount}件
            </span>
          )}
        </p>
      </div>
    </button>
  );
}

function GuideView({ onOpenTrip }: { onOpenTrip: (tripId: number) => void }) {
  const queryClient = useQueryClient();
  const guide = useQuery({
    queryKey: ["guide"],
    queryFn: () => api.listGuide({}),
  });
  const toggleWant = useMutation({
    mutationFn: async (spot: Spot) =>
      await api.toggleWant({ spotId: spot.id, want: false }),
    onSuccess: () => void queryClient.invalidateQueries(),
  });
  const items = guide.data?.items ?? [];

  return (
    <div>
      <p className="text-sm leading-relaxed text-[var(--dim)]">
        日記に「いっしょに行きたい」印を付けた場所がここに貯まるよ。
        実際に行く日が来たら、ここあが下見メモを持って案内する側になる。
      </p>
      {guide.isPending && (
        <p className="py-10 text-center text-sm text-[var(--dim)]">
          案内リストを開いてる…
        </p>
      )}
      {guide.data && items.length === 0 && (
        <div className="mt-6 rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--surface)] p-6 text-center">
          <p className="text-2xl" aria-hidden>
            ♡
          </p>
          <p className="mt-2 text-sm leading-relaxed">
            まだ印は付いてないよ。
            <br />
            日記を読んで「ここ行きたい」と思ったら、スポットの
            「いっしょに行きたい」を押してみて。
          </p>
        </div>
      )}
      <ul className="mt-4 space-y-3">
        {items.map((item: GuideItem) => {
          const dirUrl = mapsDirectionsUrl(placeRef(item.spot), {
            travelmode: "walking",
          });
          return (
            <li
              key={item.spot.id}
              className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              {item.spot.illustrationUrl && (
                <img
                  src={item.spot.illustrationUrl}
                  alt={`${item.spot.name}にいるここあの挿絵`}
                  className="mb-3 h-40 w-full rounded-[var(--radius)] object-cover"
                  loading="lazy"
                />
              )}
              <div className="flex flex-wrap items-baseline gap-x-2">
                <h3 className="font-round text-base font-bold">
                  {item.spot.name}
                </h3>
                <span className="text-xs text-[var(--dim)]">
                  {item.areaLabel}｜{formatTripDate(item.tripDate)}
                </span>
                {item.spot.igPostedAt && (
                  <span className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 text-xs font-bold text-[var(--accent-strong)]">
                    Instagram投稿済み
                  </span>
                )}
              </div>
              {item.spot.address && (
                <p className="mt-0.5 text-xs text-[var(--dim)]">
                  {item.spot.address}
                </p>
              )}
              <p className="mt-2 text-sm leading-relaxed">
                {item.spot.memo}
              </p>
              {item.spot.highlight && (
                <p className="mt-1 text-sm leading-relaxed">
                  <span className="font-round mr-1 font-bold text-[var(--accent-strong)]">
                    案内ポイント
                  </span>
                  {item.spot.highlight}
                </p>
              )}
              <GuideMemoEditor spot={item.spot} />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onOpenTrip(item.tripId)}
                  className="flex min-h-11 items-center rounded-full bg-[var(--surface-alt)] px-4 text-sm font-medium"
                >
                  日記「{item.tripTitle}」を開く
                </button>
                {dirUrl && (
                  <a
                    href={dirUrl}
                    target="_blank"
                    rel="noopener"
                    className="flex min-h-11 items-center rounded-full bg-[var(--surface-alt)] px-4 text-sm font-medium"
                  >
                    ここへの道順
                  </a>
                )}
                <button
                  type="button"
                  aria-label={`${item.spot.name}の印を外す`}
                  onClick={() => toggleWant.mutate(item.spot)}
                  className="flex min-h-11 items-center rounded-full px-3 text-sm text-[var(--dim)] underline"
                >
                  印を外す
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const AREA_CHIPS = [
  "丸の内・銀座",
  "神戸 三宮〜元町",
  "金沢",
  "松江",
  "札幌",
  "新潟市",
  "福井市",
];

function RequestView({
  onPlanned,
}: {
  onPlanned: (tripId: number) => void;
}) {
  const queryClient = useQueryClient();
  const [area, setArea] = useState("");
  const [theme, setTheme] = useState("");
  const plan = useMutation({
    mutationFn: async () =>
      await api.planTrip({ area: area.trim(), theme: theme.trim() || undefined }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries();
      onPlanned(res.tripId);
    },
  });
  return (
    <div>
      <p className="text-sm leading-relaxed text-[var(--dim)]">
        行ってみたい場所を頼むと、ここあが先にバーチャル下見して日記にしてくれる。
        実在の場所だけを調べてコースを組むから、届くまで少し時間がかかるよ。
      </p>
      <div
        className="mt-4 flex flex-wrap gap-2"
        role="group"
        aria-label="行き先の候補"
      >
        {AREA_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => setArea(chip)}
            aria-pressed={area === chip}
            className={`min-h-11 rounded-full px-4 text-sm font-medium ${
              area === chip
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--surface-alt)]"
            }`}
          >
            {chip}
          </button>
        ))}
      </div>
      <div className="mt-4">
        <label
          htmlFor="area-input"
          className="font-round text-sm font-bold"
        >
          行き先
        </label>
        <input
          id="area-input"
          type="text"
          value={area}
          onChange={(e) => setArea(e.target.value)}
          placeholder="例：神戸 三宮〜元町"
          className="mt-1 min-h-12 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-base"
        />
      </div>
      <div className="mt-3">
        <label
          htmlFor="theme-input"
          className="font-round text-sm font-bold"
        >
          テーマ・希望（任意）
        </label>
        <input
          id="theme-input"
          type="text"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          placeholder="例：ライブ会場の周りを先に見ておきたい"
          className="mt-1 min-h-12 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-base"
        />
      </div>
      <button
        type="button"
        onClick={() => plan.mutate()}
        disabled={area.trim() === "" || plan.isPending}
        className="mt-5 min-h-12 w-full rounded-full bg-[var(--accent)] text-base font-bold text-white disabled:opacity-40"
      >
        {plan.isPending ? "ここあに頼んでる…" : "ここあに下見を頼む"}
      </button>
      {plan.error && (
        <p className="mt-2 text-sm text-[var(--accent-strong)]">
          頼めなかった…。もう一度試してみて。
        </p>
      )}
      <p className="mt-6 text-xs leading-relaxed text-[var(--dim)]">
        神戸は2027年4月の遠征の下見に。三宮・元町・GLION ARENA
        周辺を先に歩いておくと、当日ここあが案内できるよ。金沢・松江・札幌・新潟・福井は、
        アンテナショップで見かける土地たちへの遠出の下見。
      </p>
    </div>
  );
}

type View = "diary" | "guide" | "request";

export function App() {
  const [view, setView] = useState<View>("diary");
  const [openTripId, setOpenTripId] = useState<number | null>(null);

  const trips = useQuery({
    queryKey: ["trips"],
    queryFn: () => api.listTrips({}),
    refetchInterval: (query) =>
      query.state.data?.trips.some((t) => t.status === "draft")
        ? 8000
        : false,
  });
  const guide = useQuery({
    queryKey: ["guide"],
    queryFn: () => api.listGuide({}),
  });
  const guideCount = guide.data?.items.length ?? 0;
  const tripList = trips.data?.trips ?? [];

  const tabs: { key: View; label: string }[] = [
    { key: "diary", label: "旅日記" },
    { key: "guide", label: `案内リスト${guideCount > 0 ? `（${guideCount}）` : ""}` },
    { key: "request", label: "下見を頼む" },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <SafeAreaTopScrim backgroundColor="var(--bg)" />
      <main className="mx-auto w-full max-w-2xl px-4 pb-10 pt-4">
        <nav
          aria-label="ここあ旅の画面切り替え"
          className="flex gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] p-1.5"
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setView(tab.key);
                setOpenTripId(null);
              }}
              aria-pressed={view === tab.key}
              className={`font-round min-h-11 flex-1 rounded-full text-sm font-bold ${
                view === tab.key
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--dim)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="mt-5">
          {view === "diary" &&
            (openTripId != null ? (
              <TripDetailView
                tripId={openTripId}
                onBack={() => setOpenTripId(null)}
              />
            ) : (
              <div>
                {trips.isPending && (
                  <p className="py-10 text-center text-sm text-[var(--dim)]">
                    日記帳を開いてる…
                  </p>
                )}
                {trips.error && (
                  <p className="py-10 text-center text-sm text-[var(--accent-strong)]">
                    日記が読み込めなかった。
                  </p>
                )}
                {trips.data && tripList.length === 0 && (
                  <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--surface)] p-6 text-center">
                    <p className="text-sm leading-relaxed">
                      まだ旅日記はないよ。
                      <br />
                      「下見を頼む」から、最初の行き先を頼んでみて。
                    </p>
                  </div>
                )}
                <div className="space-y-4">
                  {tripList.map((trip) => (
                    <TripCard
                      key={trip.id}
                      trip={trip}
                      onOpen={() => setOpenTripId(trip.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          {view === "guide" && (
            <GuideView
              onOpenTrip={(tripId) => {
                setView("diary");
                setOpenTripId(tripId);
              }}
            />
          )}
          {view === "request" && (
            <RequestView
              onPlanned={(tripId) => {
                setView("diary");
                setOpenTripId(tripId);
              }}
            />
          )}
        </div>
      </main>
    </div>
  );
}
