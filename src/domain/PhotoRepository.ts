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

	// File, camera, place, people and tags of one photo (the viewer's info panel).
	getAssetDetails(assetId: string): Promise<AssetDetails>;

	thumbnailUrl(assetId: string): string;
	previewUrl(assetId: string): string;
	// The full-resolution image for the TV's own photo viewer (Show in 4K), as a JPEG or a
	// format the TV decodes.
	fullResolutionUrl(asset: TimelineAsset): string;
	videoPlaybackUrl(assetId: string): string;
	faceUrl(personId: string): string;
}
