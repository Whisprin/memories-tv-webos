type AssetType = 'IMAGE' | 'VIDEO';

export interface TimelineAsset {
	id: string;
	type: AssetType;
	ratio: number;
	// Local wall-clock time; day grouping must use it to match the server's month buckets,
	// which are cut on localDateTime, not UTC.
	localDateTime: string;
	durationSeconds: number | null;
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
	// only photos and videos marked as favourite in Nextcloud
	favorites?: boolean;
	// only archived photos and videos (hidden from the main timeline)
	archive?: boolean;
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

export interface Person {
	id: string;
	name: string;
	assetCount: number;
}
