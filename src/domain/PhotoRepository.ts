import type {Album, AlbumDetails, AssetDetails, Folder, Person, Place, Tag, TimelineAsset, TimelineBucket, TimelineScope} from './types';

export interface PhotoRepository {
	getBuckets(scope?: TimelineScope): Promise<TimelineBucket[]>;
	getBucketAssets(timeBucket: string, scope?: TimelineScope, signal?: AbortSignal): Promise<TimelineAsset[]>;

	getAlbums(): Promise<Album[]>;
	getAlbum(albumId: string): Promise<AlbumDetails>;

	getPeople(): Promise<Person[]>;

	getPlaces(): Promise<Place[]>;

	getTags(): Promise<Tag[]>;

	// Memories' folders root (its Folders setting), and the subfolders of a folder.
	getFolderRoot(): Promise<string>;
	getSubfolders(path: string): Promise<Folder[]>;

	searchRandomImages(scope: TimelineScope, size: number): Promise<TimelineAsset[]>;

	// TEST (feature/tv-photo-viewer): image sources for the hand-off probe; optional so fakes needn't have it.
	handoffSources?(assetId: string): Array<{label: string; url: string; mime: string}>;

	// File, camera, place, people and tags of one photo (the viewer's info panel).
	getAssetDetails(assetId: string): Promise<AssetDetails>;

	thumbnailUrl(assetId: string): string;
	previewUrl(assetId: string): string;
	videoPlaybackUrl(assetId: string): string;
	faceUrl(personId: string): string;
}
