import {renameStorageKey} from './renameStorageKey';

export type Rotation = 0 | 90 | 180 | 270;

// Viewing preference only: rotations stay on this TV and are never written to the server.
const STORAGE_KEY = 'memoriestv_rotations';
const MAX_ENTRIES = 1000;

// Kept in recency order (oldest first) and stored as [assetId, rotation] pairs. A plain object
// would not keep that order: asset ids are Nextcloud file ids, and JavaScript sorts
// integer-like object keys numerically.
let rotations: Map<string, Rotation> | null = null;

function load(): Map<string, Rotation> {
	if (!rotations) {
		renameStorageKey('immich_rotations', STORAGE_KEY);
		try {
			const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
			// Earlier versions saved an {assetId: rotation} object.
			const entries = Array.isArray(saved) ? saved : saved && typeof saved === 'object' ? Object.entries(saved) : [];
			rotations = new Map(entries as Array<[string, Rotation]>);
		} catch {
			rotations = new Map();
		}
	}
	return rotations;
}

export function getRotation(assetId: string): Rotation {
	return load().get(assetId) ?? 0;
}

export function rotateClockwise(assetId: string): Rotation {
	const map = load();
	const next = ((getRotation(assetId) + 90) % 360) as Rotation;
	// Re-inserting moves the asset to the newest end, so the oldest entries are the ones trimmed.
	map.delete(assetId);
	if (next) map.set(assetId, next);
	for (const id of map.keys()) {
		if (map.size <= MAX_ENTRIES) break;
		map.delete(id);
	}
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify([...map]));
	} catch {
		// Storage unavailable: the rotation still applies for this session.
	}
	return next;
}
