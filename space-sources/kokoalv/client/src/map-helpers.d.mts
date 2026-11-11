export interface PlaceRefLike {
  label: string;
  venue?: string;
  address?: string;
  locality?: string;
  region?: string;
  country?: string;
  lat?: number;
  lng?: number;
}

export interface HatchMapHandle {
  selectPlace(index: number | null): void;
}

export declare function mountMap(
  container: HTMLElement,
  options: Record<string, unknown>,
  onUnavailable: () => void,
): HatchMapHandle | null;

export declare function mountPlaceListMap(
  container: HTMLElement,
  options: Record<string, unknown>,
  onUnavailable: () => void,
): HatchMapHandle | null;

export declare function mapsSearchUrl(place: PlaceRefLike): string | null;

export declare function mapsDirectionsUrl(
  destination: PlaceRefLike,
  options?: { travelmode?: string; origin?: { lat: number; lng: number } },
): string | null;

export declare function buildStaticMapUrl(
  opts: Record<string, unknown>,
): string;

export declare function heatmapOverlay(
  id: string,
  data: unknown,
  colorStops: unknown[],
  radius?: number,
): unknown;

export declare function mountChoropleth(
  container: HTMLElement,
  options: Record<string, unknown>,
  onUnavailable: () => void,
): unknown;
