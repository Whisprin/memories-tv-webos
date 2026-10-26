import {APIError, NextcloudClient} from './client';
import type {PhotoRepository} from '../domain/PhotoRepository';
import {MAIN_TIMELINE, type Album, type AlbumDetails, type Person, type Place, type TimelineAsset, type TimelineBucket, type TimelineScope} from '../domain/types';

// Memories (https://memories.gallery) groups the library by day: GET /api/days returns
// [{dayid, count}] with dayid = days since 1970-01-01 in the photos' local time, newest
// first; POST /api/days {dayIds} returns the photos of those days. The timeline UI works in
// month buckets ('YYYY-MM-01'), so days are grouped into months here.

interface MemoriesDay {
	dayid: number;
	count: number;
}

interface MemoriesPhoto {
	fileid: number;
	dayid: number;
	w?: number;
	h?: number;
	isvideo?: number;
	video_duration?: number;
	// datetaken as seconds, local wall-clock time stored as UTC
	epoch?: number;
	liveid?: string;
}

// Media URLs. In the app these come from the helper service's localhost proxy, which adds
// the Authorization header that <img>/<video> can't send (see platform/helperService.ts).
export interface MediaUrls {
	memoriesUrl(path: string, shard?: number): string;
	previewUrl(fileid: number, x: number, y: number, a: 0 | 1): string;
	stop?(): void;
}

// Grid rows are 400 CSS px high with the aspect ratio kept (TARGET_ROW_HEIGHT_PX).
// 512 is a size Nextcloud's preview cache already holds.
const THUMB_PX = 512;
// The app renders at 1920x1080, also on UHD panels.
const PREVIEW_W = 1920;
const PREVIEW_H = 1080;
const DAY_MS = 24 * 60 * 60 * 1000;
// Random slideshow: how many days to sample per request.
const RANDOM_MAX_DAYS = 12;

export const dayIdToDate = (dayid: number): string => new Date(dayid * DAY_MS).toISOString().slice(0, 10);
const monthBucketOf = (dayid: number): string => `${dayIdToDate(dayid).slice(0, 7)}-01`;

export function photoToAsset(p: MemoriesPhoto): TimelineAsset {
	// The day comes from dayid so day grouping always matches the month buckets; epoch only
	// adds the time of day.
	const time = p.epoch ? new Date(p.epoch * 1000).toISOString().slice(10) : 'T00:00:00.000Z';
	const isVideo = !!p.isvideo;
	return {
		id: String(p.fileid),
		type: isVideo ? 'VIDEO' : 'IMAGE',
		ratio: p.w && p.h ? p.w / p.h : 1,
		localDateTime: dayIdToDate(p.dayid) + time,
		durationSeconds: isVideo ? (p.video_duration ?? null) : null,
	};
}

// Memories filters the timeline with query parameters.
function scopeQuery(scope: TimelineScope): string {
	if (scope.albumId) return `?albums=${encodeURIComponent(scope.albumId)}`;
	if (scope.personId) return `?recognize=${encodeURIComponent(scope.personId)}`;
	return '';
}

const scopeKey = (scope: TimelineScope): string => scopeQuery(scope) || 'main';

export class MemoriesRepository implements PhotoRepository {
	private client: NextcloudClient;
	private media: MediaUrls;
	// Day lists per scope, kept from getBuckets so month loads know which days to fetch.
	private days = new Map<string, Promise<MemoriesDay[]>>();

	constructor(client: NextcloudClient, media: MediaUrls) {
		this.client = client;
		this.media = media;
	}

	// Stops the media proxy. Called when the account is switched or removed.
	dispose(): void {
		this.media.stop?.();
	}

	private loadDays(scope: TimelineScope, refresh = false): Promise<MemoriesDay[]> {
		const key = scopeKey(scope);
		let days = refresh ? undefined : this.days.get(key);
		if (!days) {
			days = this.client.memories<MemoriesDay[]>(`/days${scopeQuery(scope)}`, {}, 30000);
			this.days.set(key, days);
			// A failed load must not stick in the cache.
			days.catch(() => this.days.delete(key));
		}
		return days;
	}

	private fetchDays(dayIds: number[], scope: TimelineScope, signal?: AbortSignal): Promise<MemoriesPhoto[]> {
		return this.client.memories<MemoriesPhoto[]>(`/days${scopeQuery(scope)}`, {method: 'POST', body: JSON.stringify({dayIds}), signal}, 30000);
	}

	public async getBuckets(scope: TimelineScope = MAIN_TIMELINE): Promise<TimelineBucket[]> {
		const days = await this.loadDays(scope, true);
		const buckets: TimelineBucket[] = [];
		for (const day of days) {
			const timeBucket = monthBucketOf(day.dayid);
			const last = buckets[buckets.length - 1];
			if (last && last.timeBucket === timeBucket) last.count += day.count;
			else buckets.push({timeBucket, count: day.count});
		}
		return buckets;
	}

	public async getBucketAssets(timeBucket: string, scope: TimelineScope = MAIN_TIMELINE, signal?: AbortSignal): Promise<TimelineAsset[]> {
		const month = timeBucket.slice(0, 7);
		const days = await this.loadDays(scope);
		const dayIds = days.filter((d) => dayIdToDate(d.dayid).slice(0, 7) === month).map((d) => d.dayid);
		if (dayIds.length === 0) return [];
		const photos = await this.fetchDays(dayIds, scope, signal);
		return photos.map(photoToAsset);
	}

	// Albums, people and places follow in the next step.
	public async getAlbums(): Promise<Album[]> {
		return [];
	}

	public async getAlbum(albumId: string): Promise<AlbumDetails> {
		throw new APIError(`Album ${albumId} not available yet`, 404);
	}

	public async getPeople(): Promise<Person[]> {
		return [];
	}

	public async getPlaces(): Promise<Place[]> {
		return [];
	}

	public async searchByCity(): Promise<TimelineAsset[]> {
		return [];
	}

	// Memories has no random endpoint: sample random days and pick images from them.
	public async searchRandomImages(scope: TimelineScope, size: number): Promise<TimelineAsset[]> {
		const days = await this.loadDays(scope);
		if (days.length === 0) return [];
		const picked: number[] = [];
		let photos = 0;
		const pool = days.slice();
		while (pool.length > 0 && picked.length < RANDOM_MAX_DAYS && photos < size * 2) {
			const day = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]!;
			picked.push(day.dayid);
			photos += day.count;
		}
		const images = (await this.fetchDays(picked, scope)).filter((p) => !p.isvideo).map(photoToAsset);
		for (let i = images.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[images[i], images[j]] = [images[j]!, images[i]!];
		}
		return images.slice(0, size);
	}

	public thumbnailUrl(assetId: string): string {
		return this.media.previewUrl(Number(assetId), THUMB_PX, THUMB_PX, 1);
	}

	public previewUrl(assetId: string): string {
		return this.media.previewUrl(Number(assetId), PREVIEW_W, PREVIEW_H, 1);
	}

	public videoPlaybackUrl(assetId: string): string {
		return this.media.memoriesUrl(`api/stream/${assetId}`, Number(assetId));
	}

	public faceUrl(): string {
		return '';
	}
}
