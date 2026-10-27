import {APIError, NextcloudClient} from './client';
import type {PhotoRepository} from '../domain/PhotoRepository';
import {MAIN_TIMELINE, type Album, type AlbumDetails, type AssetDetails, type Collection, type Folder, type Person, type Place, type Tag, type TimelineAsset, type TimelineBucket, type TimelineScope} from '../domain/types';

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
	// file name, e.g. 'IMG_1234.jpg'
	basename?: string;
	mimetype?: string;
}

// GET /api/image/info/<fileid>?tags=1&clusters=<face backend>, as Memories' info sidebar reads it.
export interface MemoriesImageInfo {
	basename?: string;
	size?: number;
	w?: number;
	h?: number;
	// human-readable location, when Memories' places are set up
	address?: string;
	exif?: Record<string, unknown>;
	// tag names, as an object of names or a list
	tags?: Record<string, string> | string[];
	// per requested cluster type, the clusters this file belongs to
	clusters?: Record<string, Array<{name?: string}>>;
}

const exifNumber = (exif: Record<string, unknown>, ...keys: string[]): number | null => {
	for (const key of keys) {
		const n = Number(exif[key]);
		if (exif[key] != null && exif[key] !== '' && Number.isFinite(n) && n > 0) return n;
	}
	return null;
};

const exifText = (exif: Record<string, unknown>, key: string): string | null => {
	const v = exif[key];
	return typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null;
};

const roundTo = (n: number, digits: number): string => String(Math.round(n * 10 ** digits) / 10 ** digits);

// The info panel's view of a photo, formatted like Memories' sidebar.
export function imageInfoToDetails(info: MemoriesImageInfo, faceBackend: string | null): AssetDetails {
	const exif = info.exif ?? {};
	const make = exifText(exif, 'Make');
	const model = exifText(exif, 'Model');
	const camera = make && model && !model.toLowerCase().includes(make.toLowerCase()) ? `${make} ${model}` : model ?? make;

	const exposure: string[] = [];
	const aperture = exifNumber(exif, 'FNumber', 'Aperture');
	if (aperture) exposure.push(`f/${roundTo(aperture, 1)}`);
	const shutter = exifNumber(exif, 'ExposureTime', 'ShutterSpeed', 'ShutterSpeedValue');
	if (shutter) exposure.push(shutter < 1 ? `1/${Math.round(1 / shutter)}` : `${roundTo(shutter, 1)}s`);
	const focal = exifNumber(exif, 'FocalLength');
	if (focal) exposure.push(`${roundTo(focal, 1)}mm`);
	const iso = exifNumber(exif, 'ISO');
	if (iso) exposure.push(`ISO ${Math.round(iso)}`);

	const width = info.w || exifNumber(exif, 'ImageWidth');
	const height = info.h || exifNumber(exif, 'ImageHeight');
	const megapixels = exifNumber(exif, 'Megapixels') ?? (width && height ? (width * height) / 1e6 : null);

	const faces = faceBackend ? (info.clusters?.[faceBackend] ?? []) : [];
	const people = faces.map((f) => (f.name ?? '').trim()).filter(Boolean);
	const tags = Array.isArray(info.tags) ? info.tags : Object.values(info.tags ?? {});

	return {
		fileName: info.basename || null,
		fileSize: info.size && info.size > 0 ? info.size : null,
		width: width || null,
		height: height || null,
		megapixels,
		camera: camera || null,
		lens: exifText(exif, 'LensModel'),
		exposure,
		place: info.address?.trim() || null,
		people,
		unnamedPeople: faces.length - people.length,
		tags: tags.filter((t): t is string => typeof t === 'string' && t.trim() !== ''),
	};
}

// Nextcloud's MIME type for camera RAW files (DNG, CR2, NEF, ARW, …), as Memories checks it.
const MIME_RAW = 'image/x-dcraw';

// A photo in a day, with any RAW files stacked under it.
interface StackedPhoto {
	photo: MemoriesPhoto;
	hasRaw: boolean;
}

const withoutExtension = (name: string): string => {
	const dot = name.lastIndexOf('.');
	return dot > 0 ? name.slice(0, dot) : name;
};

// Memories' "Stack RAW files with same name", which its web app applies to each day after
// loading it: a RAW file is hidden when a non-RAW photo of the same day has the same name
// without extension, and that photo is marked as RAW. A RAW without such a partner stays.
export function stackRawFiles(photos: MemoriesPhoto[]): StackedPhoto[] {
	const raws = new Map<string, MemoriesPhoto[]>();
	for (const p of photos) {
		if (p.mimetype !== MIME_RAW || !p.basename || p.basename.startsWith('.')) continue;
		let key = withoutExtension(p.basename);
		if (key.includes('.ORIGINAL')) key = p.basename.split('.', 1)[0]!;
		const id = `${p.dayid}/${key}`;
		raws.set(id, [...(raws.get(id) ?? []), p]);
	}
	if (raws.size === 0) return photos.map((photo) => ({photo, hasRaw: false}));

	const stacked = new Set<MemoriesPhoto>();
	const result: StackedPhoto[] = [];
	for (const p of photos) {
		let hasRaw = false;
		if (p.mimetype !== MIME_RAW && p.basename && !p.basename.startsWith('.')) {
			const key = withoutExtension(p.basename);
			const keys = key.includes('.') ? [key, key.split('.', 1)[0]!] : [key];
			for (const k of keys) {
				for (const raw of raws.get(`${p.dayid}/${k}`) ?? []) {
					stacked.add(raw);
					hasRaw = true;
				}
			}
		}
		result.push({photo: p, hasRaw});
	}
	return result.filter(({photo}) => !stacked.has(photo));
}

// GET /api/clusters/albums: the user's own albums and those shared with them.
interface MemoriesAlbum {
	album_id: number;
	name: string;
	// owner's user id
	user: string;
	count: number;
	created?: number;
	// cover photo chosen in Memories, if any
	cover?: number | null;
	last_added_photo?: number;
}

// GET /api/clusters/recognize (or facerecognition): one entry per person.
interface MemoriesFace {
	cluster_id: number | string;
	// empty for people who haven't been named yet
	name: string;
	user_id: string;
	count: number;
}

// GET /api/clusters/places and /api/clusters/tags: one entry per place or tag.
interface MemoriesCluster {
	cluster_id: number | string;
	name: string;
	count: number;
	// photo chosen as cover in Memories, if any
	cover?: number | null;
}

// GET /api/folders/sub?folder=<path>: the subfolders of a folder, sorted by name.
interface MemoriesFolder {
	fileid: number;
	name: string;
	// a few photos from inside the folder
	previews?: Array<{fileid: number}>;
}

const joinFolder = (base: string, name: string): string => `${base}/${name}`.replace(/\/\/+/g, '/');

// The parts of GET /api/config this app uses.
interface MemoriesConfig {
	recognize_enabled?: boolean;
	facerecognition_enabled?: boolean;
	systemtags_enabled?: boolean;
	// the user's Folders root in Memories, '/' by default
	folders_path?: string;
	// "Stack RAW files with same name" in Memories' settings
	stack_raw_files?: boolean;
	// On this day: days either side of today's date to include (0 by default)
	onthisday_day_range?: number;
}

type FaceBackend = 'recognize' | 'facerecognition';

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

// How many past years On this day looks back, as in Memories.
const ON_THIS_DAY_YEARS = 120;
const ON_THIS_DAY_MAX_RANGE = 30;

// The dayids On this day covers: today's local date, ± range days, in each past year.
// Same calculation as Memories (dayids count local calendar days since 1970-01-01).
export const onThisDayIds = (now: Date, range: number): Set<number> => {
	const r = Math.min(Math.max(Math.floor(range) || 0, 0), ON_THIS_DAY_MAX_RANGE);
	const ids = new Set<number>();
	for (let i = 1; i <= ON_THIS_DAY_YEARS; i++) {
		const year = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
		year.setUTCFullYear(now.getFullYear() - i);
		for (let j = -r; j <= r; j++) {
			ids.add(Math.floor(year.getTime() / DAY_MS) + j);
		}
	}
	return ids;
};

// Albums are addressed as '<owner>/<album name>', which is also the timeline filter value.
const albumIdOf = (a: MemoriesAlbum): string => `${a.user}/${a.name}`;

export function albumToAlbum(a: MemoriesAlbum): Album {
	// Like Memories' web app: the chosen cover, else the most recently added photo.
	const cover = a.cover && a.cover > 0 ? a.cover : a.last_added_photo && a.last_added_photo > 0 ? a.last_added_photo : null;
	return {
		id: albumIdOf(a),
		albumName: a.name,
		description: '',
		albumThumbnailAssetId: cover ? String(cover) : null,
		assetCount: a.count,
	};
}

export function photoToAsset(p: MemoriesPhoto, hasStackedRaw = false): TimelineAsset {
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
		isRaw: hasStackedRaw || p.mimetype === MIME_RAW,
		mimeType: p.mimetype,
		fileName: p.basename,
	};
}

// A person is addressed as '<user>/<cluster id>'. Memories accepts that both as the timeline
// filter value and as the preview name, and the numeric id stays unique even if names repeat.
export function faceToPerson(f: MemoriesFace): Person {
	return {id: `${f.user_id}/${f.cluster_id}`, name: f.name, assetCount: f.count};
}

export class MemoriesRepository implements PhotoRepository {
	private client: NextcloudClient;
	private media: MediaUrls;
	// Day lists per scope, kept from getBuckets so month loads know which days to fetch.
	private days = new Map<string, Promise<MemoriesDay[]>>();
	private albums: Promise<MemoriesAlbum[]> | null = null;
	private config: Promise<MemoriesConfig> | null = null;
	// The face-recognition app in use, known after getPeople
	private faceBackend: FaceBackend = 'recognize';

	constructor(client: NextcloudClient, media: MediaUrls) {
		this.client = client;
		this.media = media;
	}

	// Stops the media proxy. Called when the account is switched or removed.
	dispose(): void {
		this.media.stop?.();
	}

	// Memories filters the timeline with query parameters.
	private scopeQuery(scope: TimelineScope): string {
		if (scope.albumId) return `?albums=${encodeURIComponent(scope.albumId)}`;
		if (scope.personId) return `?${this.faceBackend}=${encodeURIComponent(scope.personId)}`;
		if (scope.placeId) return `?places=${encodeURIComponent(scope.placeId)}`;
		if (scope.tagId) return `?tags=${encodeURIComponent(scope.tagId)}`;
		if (scope.folder) return `?folder=${encodeURIComponent(scope.folder)}${scope.recursive ? '&recursive=1' : ''}`;
		if (scope.favorites) return '?fav=1';
		if (scope.archive) return '?archive=1';
		return '';
	}

	private loadDays(scope: TimelineScope, refresh = false): Promise<MemoriesDay[]> {
		const key = scope.onThisDay ? 'onthisday' : this.scopeQuery(scope) || 'main';
		let days = refresh ? undefined : this.days.get(key);
		if (!days) {
			days = scope.onThisDay ? this.loadOnThisDay(refresh) : this.client.memories<MemoriesDay[]>(`/days${this.scopeQuery(scope)}`, {}, 30000);
			this.days.set(key, days);
			// A failed load must not stick in the cache.
			days.catch(() => this.days.delete(key));
		}
		return days;
	}

	// Memories has no On this day filter: its web app picks the matching days itself, and so do we,
	// from the main timeline's day list.
	private async loadOnThisDay(refresh: boolean): Promise<MemoriesDay[]> {
		const [all, config] = await Promise.all([this.loadDays(MAIN_TIMELINE, refresh), this.loadConfig()]);
		const ids = onThisDayIds(new Date(), Number(config.onthisday_day_range ?? 0));
		return all.filter((d) => ids.has(d.dayid));
	}

	// The photos of some days as assets, with RAW files stacked when Memories is set to.
	private async fetchDays(dayIds: number[], scope: TimelineScope, signal?: AbortSignal): Promise<TimelineAsset[]> {
		const [photos, config] = await Promise.all([
			this.client.memories<MemoriesPhoto[]>(`/days${this.scopeQuery(scope)}`, {method: 'POST', body: JSON.stringify({dayIds}), signal}, 30000),
			// Without the config, photos still load, just unstacked.
			this.loadConfig().catch((): MemoriesConfig => ({})),
		]);
		if (!config.stack_raw_files) return photos.map((p) => photoToAsset(p));
		return stackRawFiles(photos).map(({photo, hasRaw}) => photoToAsset(photo, hasRaw));
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
		return this.fetchDays(dayIds, scope, signal);
	}

	private loadAlbums(refresh = false): Promise<MemoriesAlbum[]> {
		if (refresh || !this.albums) {
			const albums = this.client.memories<MemoriesAlbum[]>('/clusters/albums');
			this.albums = albums;
			albums.catch(() => {
				if (this.albums === albums) this.albums = null;
			});
		}
		return this.albums;
	}

	// Newest album first.
	public async getAlbums(): Promise<Album[]> {
		const albums = await this.loadAlbums(true);
		return [...albums].sort((a, b) => (b.created ?? 0) - (a.created ?? 0)).map(albumToAlbum);
	}

	public async getAlbum(albumId: string): Promise<AlbumDetails> {
		let album = (await this.loadAlbums()).find((a) => albumIdOf(a) === albumId);
		if (!album) album = (await this.loadAlbums(true)).find((a) => albumIdOf(a) === albumId);
		if (!album) throw new APIError(`Album ${albumId} not found`, 404);
		// Memories keeps no per-album sort order; newest first like the timeline.
		return {...albumToAlbum(album), order: 'desc'};
	}

	private loadConfig(): Promise<MemoriesConfig> {
		if (!this.config) {
			const config = this.client.memories<MemoriesConfig>('/config');
			this.config = config;
			config.catch(() => {
				if (this.config === config) this.config = null;
			});
		}
		return this.config;
	}

	// People come from Recognize (or the older Face Recognition app), whichever Memories has
	// enabled; none means no people. Most photos first, as Memories lists them.
	public async getPeople(): Promise<Person[]> {
		const config = await this.loadConfig();
		const backend: FaceBackend | null = config.recognize_enabled ? 'recognize' : config.facerecognition_enabled ? 'facerecognition' : null;
		if (!backend) return [];
		this.faceBackend = backend;
		const faces = await this.client.memories<MemoriesFace[]>(`/clusters/${backend}`);
		return faces.filter((f) => f.count > 0).sort((a, b) => b.count - a.count).map(faceToPerson);
	}

	// Clusters with photos, by name. The cover is the photo chosen in Memories, else the cluster
	// preview (which picks a photo on the server). idOf gives the value the timeline filter takes.
	private async loadCollections(backend: 'places' | 'tags', idOf: (c: MemoriesCluster) => string): Promise<Collection[]> {
		const clusters = await this.client.memories<MemoriesCluster[]>(`/clusters/${backend}`);
		return clusters
			.filter((c) => c.count > 0)
			.map((c) => {
				const id = idOf(c);
				const coverUrl = c.cover && c.cover > 0
					? this.thumbnailUrl(String(c.cover))
					: this.media.memoriesUrl(`api/clusters/${backend}/preview?name=${encodeURIComponent(id)}`, Number(c.cluster_id) || 0);
				return {id, name: c.name || id, assetCount: c.count, coverUrl};
			})
			.sort((a, b) => a.name.localeCompare(b.name));
	}

	// Places from Memories' reverse geocoding, filtered by id.
	public getPlaces(): Promise<Place[]> {
		return this.loadCollections('places', (c) => String(c.cluster_id));
	}

	// Nextcloud's collaborative (system) tags, filtered by name. None if Memories has them off.
	public async getTags(): Promise<Tag[]> {
		const config = await this.loadConfig();
		if (config.systemtags_enabled === false) return [];
		return this.loadCollections('tags', (c) => c.name);
	}

	public async getFolderRoot(): Promise<string> {
		const config = await this.loadConfig();
		return joinFolder('/', config.folders_path || '/');
	}

	public async getSubfolders(path: string): Promise<Folder[]> {
		const folders = await this.client.memories<MemoriesFolder[]>(`/folders/sub?folder=${encodeURIComponent(path)}`);
		return folders.map((f) => ({
			path: joinFolder(path, f.name),
			name: f.name,
			coverUrl: f.previews?.[0] ? this.thumbnailUrl(String(f.previews[0].fileid)) : null,
		}));
	}

	// The TV's Media Player shows JPEG and HEIC originals itself; RAW files go as the JPEG
	// Memories converts them to (its "decodable" image, full size). Previews are no use here:
	// Nextcloud caps them (often at 2048 px), and the player doesn't enlarge images.
	public fullResolutionUrl(asset: TimelineAsset): string {
		const id = encodeURIComponent(asset.id);
		return this.media.memoriesUrl(asset.mimeType === MIME_RAW ? `api/image/decodable/${id}` : `api/stream/${id}`);
	}

	public async getAssetDetails(assetId: string): Promise<AssetDetails> {
		const config = await this.loadConfig().catch((): MemoriesConfig => ({}));
		const faceBackend: FaceBackend | null = config.recognize_enabled ? 'recognize' : config.facerecognition_enabled ? 'facerecognition' : null;
		const query = `tags=1${faceBackend ? `&clusters=${faceBackend}` : ''}`;
		const info = await this.client.memories<MemoriesImageInfo>(`/image/info/${encodeURIComponent(assetId)}?${query}`);
		return imageInfoToDetails(info, faceBackend);
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
		const images = (await this.fetchDays(picked, scope)).filter((a) => a.type !== 'VIDEO');
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

	// The cluster preview is cropped to the face on the server.
	public faceUrl(personId: string): string {
		const shard = Number(personId.split('/').pop()) || 0;
		return this.media.memoriesUrl(`api/clusters/${this.faceBackend}/preview?name=${encodeURIComponent(personId)}`, shard);
	}
}
