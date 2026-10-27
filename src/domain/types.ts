type AssetType = 'IMAGE' | 'VIDEO';

export interface TimelineAsset {
	id: string;
	type: AssetType;
	ratio: number;
	// Local wall-clock time; day grouping must use it to match the server's month buckets,
	// which are cut on localDateTime, not UTC.
	localDateTime: string;
	durationSeconds: number | null;
	// a RAW file, or a photo with RAW files of the same name stacked under it (Memories'
	// "Stack RAW files with same name")
	isRaw?: boolean;
	// the file's own MIME type and name, when the server sends them
	mimeType?: string;
	fileName?: string;
	city?: string | null;
	country?: string | null;
}

export interface TimelineBucket {
	timeBucket: string;
	count: number;
}

export interface DayGroup {
	timeBucket: string;
	assets: TimelineAsset[];
	count: number;
}

export interface Album {
	id: string;
	albumName: string;
	description: string;
	albumThumbnailAssetId: string | null;
	assetCount: number;
}

export type AssetOrder = 'asc' | 'desc';

export interface AlbumDetails extends Album {
	order: AssetOrder;
}

// The empty scope is the main library timeline.
export interface TimelineScope {
	albumId?: string;
	personId?: string;
	placeId?: string;
	// tag name
	tagId?: string;
	// folder path below the user's Nextcloud root, e.g. '/Photos/2026'
	folder?: string;
	// with folder: include subfolders
	recursive?: boolean;
	// only photos and videos marked as favourite in Nextcloud
	favorites?: boolean;
	// only archived photos and videos (hidden from the main timeline)
	archive?: boolean;
	// photos and videos taken on today's date (± a few days, as set in Memories) in past years
	onThisDay?: boolean;
	order?: AssetOrder;
}

export const MAIN_TIMELINE: TimelineScope = {};

// A named group of photos, browsed as a grid of covers that each open a filtered timeline.
export interface Collection {
	id: string;
	name: string;
	assetCount: number;
	// cover image, ready for <img src>
	coverUrl: string;
}

export type Place = Collection;
export type Tag = Collection;

export interface Folder {
	// e.g. '/Photos/2026'
	path: string;
	name: string;
	// a photo from inside the folder, ready for <img src>; null for folders without photos
	coverUrl: string | null;
}

export interface Person {
	id: string;
	name: string;
	assetCount: number;
}

// What the viewer's info panel shows about a photo. Empty fields are null or [].
export interface AssetDetails {
	fileName: string | null;
	// bytes
	fileSize: number | null;
	width: number | null;
	height: number | null;
	megapixels: number | null;
	// e.g. 'samsung SM-S921B'
	camera: string | null;
	lens: string | null;
	// e.g. ['f/1.8', '1/120', '6.3mm', 'ISO 50']
	exposure: string[];
	// the address Memories found for the photo's location
	place: string | null;
	// names of recognised people; faces not yet named only count
	people: string[];
	unnamedPeople: number;
	tags: string[];
}
