import type {Album, AlbumDetails, AssetDetails, Folder, MapBounds, MapCluster, MapPosition, MapStyle, MapTileSource, Person, Place, Tag, TimelineAsset, TimelineBucket, TimelineScope} from './types';

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

	// Map: where the newest photo with a location was taken (null when none has one), the
	// markers inside an area at a zoom level, and the tiles to draw.
	getMapInit(): Promise<MapPosition | null>;
	getMapClusters(bounds: MapBounds, zoom: number, signal?: AbortSignal): Promise<MapCluster[]>;
	mapTiles(style: MapStyle): MapTileSource;

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
