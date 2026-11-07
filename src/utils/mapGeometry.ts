import type {MapBounds} from '../domain/types';

// Memories rejects zoom 0, and at zoom 1 the world is smaller than the map.
export const MIN_ZOOM = 2;
export const MAX_ZOOM = 19;
// Web Mercator ends here; the map can't show anything beyond it.
export const MAX_LAT = 85.0511;
// Where the map starts when the account has no last view.
export const NEWEST_PHOTO_ZOOM = 11;
export const WORLD_VIEW = {lat: 30, lon: 0, zoom: MIN_ZOOM};

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;

// Memories groups photos into a grid with cells of 180 / 2^zoom degrees (half a 256 px tile).
export const cellSize = (zoom: number): number => 180 / 2 ** Math.round(zoom);

// Bounds grown by a fraction of their size on each side, as Memories loads markers for.
export function padBounds([minLat, maxLat, minLon, maxLon]: MapBounds, fraction: number): MapBounds {
	const dLat = (maxLat - minLat) * fraction;
	const dLon = (maxLon - minLon) * fraction;
	return [minLat - dLat, maxLat + dLat, minLon - dLon, maxLon + dLon];
}

// Bounds rounded outwards to whole grid cells and clamped to the world, so small pans give the
// same bounds (and hit the query cache), and markers on the edge are never cut in half.
export function snapBounds([minLat, maxLat, minLon, maxLon]: MapBounds, zoom: number): MapBounds {
	const g = cellSize(zoom);
	return [
		round6(clamp(Math.floor(minLat / g) * g, -90, 90)),
		round6(clamp(Math.ceil(maxLat / g) * g, -90, 90)),
		round6(clamp(Math.floor(minLon / g) * g, -180, 180)),
		round6(clamp(Math.ceil(maxLon / g) * g, -180, 180)),
	];
}

export const boundsKey = (b: MapBounds): string => b.join(',');

export const boundsContain = ([minLat, maxLat, minLon, maxLon]: MapBounds, lat: number, lon: number): boolean =>
	lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;

export type PanDirection = 'left' | 'right' | 'up' | 'down';

const PAN_VECTORS: Record<PanDirection, [number, number]> = {left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1]};

// A tap on an arrow pans a quarter of the map in that direction (screen pixels, for panBy).
export function tapOffset(dir: PanDirection, width: number, height: number): [number, number] {
	const [x, y] = PAN_VECTORS[dir];
	return [x * width * 0.25, y * height * 0.25];
}

// Holding an arrow pans continuously, faster the longer it is held.
export const HOLD_DELAY_MS = 300;
const HOLD_START_SPEED = 500; // px per second
const HOLD_MAX_SPEED = 3000;
const HOLD_ACCELERATION = 1500; // px per second, per second

export function holdSpeed(heldMs: number): number {
	if (heldMs < HOLD_DELAY_MS) return 0;
	return Math.min(HOLD_MAX_SPEED, HOLD_START_SPEED + (HOLD_ACCELERATION * (heldMs - HOLD_DELAY_MS)) / 1000);
}

// Combined pan for the held directions over one animation frame.
export function holdOffset(held: ReadonlyMap<PanDirection, number>, now: number, frameMs: number): [number, number] {
	let dx = 0;
	let dy = 0;
	for (const [dir, since] of held) {
		const step = (holdSpeed(now - since) * frameMs) / 1000;
		const [x, y] = PAN_VECTORS[dir];
		dx += x * step;
		dy += y * step;
	}
	return [dx, dy];
}
