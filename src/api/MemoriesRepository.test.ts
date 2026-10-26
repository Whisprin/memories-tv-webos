import {MemoriesRepository, albumToAlbum, dayIdToDate, faceToPerson, photoToAsset, type MediaUrls} from './MemoriesRepository';
import type {NextcloudClient} from './client';

// 2026-03-01 is day 20513 since 1970-01-01.
const MAR_1 = 20513;
const MAR_31 = MAR_1 + 30;
const APR_2 = MAR_1 + 32;

const media: MediaUrls = {
	memoriesUrl: (path, shard = 0) => `proxy:${shard}/${path}`,
	previewUrl: (fileid, x, y, a) => `preview:${fileid}:${x}x${y}:${a}`,
	stop: jest.fn(),
};

const makeRepo = (memories: jest.Mock) => new MemoriesRepository({memories} as unknown as NextcloudClient, media);

describe('dayIdToDate', () => {
	test('converts days since 1970 to an ISO date', () => {
		expect(dayIdToDate(0)).toBe('1970-01-01');
		expect(dayIdToDate(MAR_1)).toBe('2026-03-01');
	});
});

describe('photoToAsset', () => {
	test('maps an image', () => {
		expect(photoToAsset({fileid: 42, dayid: MAR_1, w: 4000, h: 3000, epoch: Date.UTC(2026, 2, 1, 14, 30) / 1000})).toEqual({
			id: '42',
			type: 'IMAGE',
			ratio: 4000 / 3000,
			localDateTime: '2026-03-01T14:30:00.000Z',
			durationSeconds: null,
		});
	});

	test('maps a video and takes the day from dayid even if epoch disagrees', () => {
		const asset = photoToAsset({fileid: 7, dayid: MAR_1, isvideo: 1, video_duration: 12, epoch: Date.UTC(2026, 1, 28, 23, 59) / 1000});
		expect(asset.type).toBe('VIDEO');
		expect(asset.durationSeconds).toBe(12);
		expect(asset.localDateTime).toBe('2026-03-01T23:59:00.000Z');
		expect(asset.ratio).toBe(1);
	});
});

describe('MemoriesRepository', () => {
	test('groups days into month buckets, newest first', async () => {
		const memories = jest.fn().mockResolvedValue([
			{dayid: APR_2, count: 3},
			{dayid: MAR_31, count: 2},
			{dayid: MAR_1, count: 5},
		]);
		const buckets = await makeRepo(memories).getBuckets();
		expect(memories).toHaveBeenCalledWith('/days', {}, 30000);
		expect(buckets).toEqual([
			{timeBucket: '2026-04-01', count: 3},
			{timeBucket: '2026-03-01', count: 7},
		]);
	});

	test('loads a month by fetching its days', async () => {
		const memories = jest
			.fn()
			.mockResolvedValueOnce([
				{dayid: APR_2, count: 1},
				{dayid: MAR_31, count: 1},
				{dayid: MAR_1, count: 1},
			])
			.mockResolvedValueOnce([
				{fileid: 1, dayid: MAR_31},
				{fileid: 2, dayid: MAR_1, isvideo: 1, video_duration: 5},
			]);
		const repo = makeRepo(memories);
		await repo.getBuckets();
		const assets = await repo.getBucketAssets('2026-03-01');
		expect(memories).toHaveBeenLastCalledWith('/days', {method: 'POST', body: JSON.stringify({dayIds: [MAR_31, MAR_1]}), signal: undefined}, 30000);
		expect(assets.map((a) => a.id)).toEqual(['1', '2']);
	});

	test('a month with no days needs no request', async () => {
		const memories = jest.fn().mockResolvedValueOnce([{dayid: MAR_1, count: 1}]);
		const repo = makeRepo(memories);
		expect(await repo.getBucketAssets('2025-12-01')).toEqual([]);
		expect(memories).toHaveBeenCalledTimes(1);
	});

	test('scopes become Memories filters', async () => {
		const memories = jest.fn().mockResolvedValue([]);
		const repo = makeRepo(memories);
		await repo.getBuckets({albumId: 'alice/Holiday 2026'});
		expect(memories).toHaveBeenCalledWith('/days?albums=alice%2FHoliday%202026', {}, 30000);
		await repo.getBuckets({personId: 'alice/12'});
		expect(memories).toHaveBeenCalledWith('/days?recognize=alice%2F12', {}, 30000);
	});

	test('random images come from sampled days and exclude videos', async () => {
		const memories = jest
			.fn()
			.mockResolvedValueOnce([{dayid: MAR_1, count: 3}])
			.mockResolvedValueOnce([
				{fileid: 1, dayid: MAR_1},
				{fileid: 2, dayid: MAR_1, isvideo: 1},
				{fileid: 3, dayid: MAR_1},
			]);
		const images = await makeRepo(memories).searchRandomImages({}, 10);
		expect(images.map((a) => a.id).sort()).toEqual(['1', '3']);
	});

	test('media goes through the proxy URLs', () => {
		const repo = makeRepo(jest.fn());
		expect(repo.thumbnailUrl('42')).toBe('preview:42:512x512:1');
		expect(repo.previewUrl('42')).toBe('preview:42:1920x1080:1');
		expect(repo.videoPlaybackUrl('42')).toBe('proxy:42/api/stream/42');
	});

	test('dispose stops the media proxy', () => {
		makeRepo(jest.fn()).dispose();
		expect(media.stop).toHaveBeenCalled();
	});
});

describe('albums', () => {
	const holiday = {album_id: 1, name: 'Holiday 2026', user: 'alice', count: 12, created: 200, cover: 55, last_added_photo: 77};
	const family = {album_id: 2, name: 'Family', user: 'bob', count: 3, created: 300, cover: null, last_added_photo: 88};
	const empty = {album_id: 3, name: 'Empty', user: 'alice', count: 0, created: 100, cover: null, last_added_photo: 0};

	test('maps an album: owner/name id, chosen cover first, then last added photo', () => {
		expect(albumToAlbum(holiday)).toEqual({id: 'alice/Holiday 2026', albumName: 'Holiday 2026', description: '', albumThumbnailAssetId: '55', assetCount: 12});
		expect(albumToAlbum(family).albumThumbnailAssetId).toBe('88');
		expect(albumToAlbum(empty).albumThumbnailAssetId).toBeNull();
	});

	test('lists albums newest first', async () => {
		const memories = jest.fn().mockResolvedValue([holiday, family, empty]);
		const albums = await makeRepo(memories).getAlbums();
		expect(memories).toHaveBeenCalledWith('/clusters/albums');
		expect(albums.map((a) => a.id)).toEqual(['bob/Family', 'alice/Holiday 2026', 'alice/Empty']);
	});

	test('finds an album by id, refreshing the list once if needed', async () => {
		const memories = jest.fn().mockResolvedValueOnce([holiday]).mockResolvedValueOnce([holiday, family]);
		const repo = makeRepo(memories);
		await expect(repo.getAlbum('bob/Family')).resolves.toMatchObject({id: 'bob/Family', albumName: 'Family', order: 'desc'});
		expect(memories).toHaveBeenCalledTimes(2);
	});

	test('an unknown album is a 404', async () => {
		const memories = jest.fn().mockResolvedValue([holiday]);
		await expect(makeRepo(memories).getAlbum('alice/Nope')).rejects.toMatchObject({status: 404});
	});
});

describe('people', () => {
	const anna = {cluster_id: 12, name: 'Anna', user_id: 'alice', count: 40};
	const unnamed = {cluster_id: 7, name: '', user_id: 'alice', count: 90};
	const emptyCluster = {cluster_id: 3, name: 'Gone', user_id: 'alice', count: 0};

	const reply = (config: object, faces: object[] = []) =>
		jest.fn((path: string) => Promise.resolve(path === '/config' ? config : path.startsWith('/clusters/') ? faces : []));

	test('maps a face cluster to a person addressed as user/cluster id', () => {
		expect(faceToPerson(anna)).toEqual({id: 'alice/12', name: 'Anna', assetCount: 40});
	});

	test('no people when no face recognition app is enabled', async () => {
		const memories = reply({recognize_enabled: false, facerecognition_enabled: false});
		expect(await makeRepo(memories).getPeople()).toEqual([]);
		expect(memories).toHaveBeenCalledTimes(1);
	});

	test('lists Recognize people with photos, most photos first', async () => {
		const memories = reply({recognize_enabled: true}, [anna, unnamed, emptyCluster]);
		const people = await makeRepo(memories).getPeople();
		expect(memories).toHaveBeenCalledWith('/clusters/recognize');
		expect(people.map((p) => p.id)).toEqual(['alice/7', 'alice/12']);
	});

	test('face crops come from the cluster preview through the proxy', async () => {
		const repo = makeRepo(reply({recognize_enabled: true}, [anna]));
		await repo.getPeople();
		expect(repo.faceUrl('alice/12')).toBe('proxy:12/api/clusters/recognize/preview?name=alice%2F12');
	});

	test('with the Face Recognition app, its clusters and timeline filter are used', async () => {
		const memories = reply({facerecognition_enabled: true}, [anna]);
		const repo = makeRepo(memories);
		await repo.getPeople();
		expect(memories).toHaveBeenCalledWith('/clusters/facerecognition');
		await repo.getBuckets({personId: 'alice/12'});
		expect(memories).toHaveBeenCalledWith('/days?facerecognition=alice%2F12', {}, 30000);
	});
});

describe('places', () => {
	test('lists places with photos by name, with a cover from the chosen photo or the cluster preview', async () => {
		const memories = jest.fn().mockResolvedValue([
			{cluster_id: 62422, name: 'Berlin', count: 120, cover: 501},
			{cluster_id: 9, name: 'Amsterdam', count: 8, cover: null},
			{cluster_id: 5, name: 'Nowhere', count: 0},
		]);
		const places = await makeRepo(memories).getPlaces();
		expect(memories).toHaveBeenCalledWith('/clusters/places');
		expect(places).toEqual([
			{id: '9', name: 'Amsterdam', assetCount: 8, coverUrl: 'proxy:9/api/clusters/places/preview?name=9'},
			{id: '62422', name: 'Berlin', assetCount: 120, coverUrl: 'preview:501:512x512:1'},
		]);
	});

	test('a place opens as a timeline filtered by its id', async () => {
		const memories = jest.fn().mockResolvedValue([]);
		await makeRepo(memories).getBuckets({placeId: '62422'});
		expect(memories).toHaveBeenCalledWith('/days?places=62422', {}, 30000);
	});
});
