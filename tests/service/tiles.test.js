// Node-side tests for the helper service's map tile cache (service/tiles.js).
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const {EventEmitter} = require('events');
const {Buffer} = require('buffer');
const tiles = require('../../service/tiles');

const DAY = 24 * 60 * 60 * 1000;

// A fake tile server: answers with `reply(headers)` → {status, headers, body}.
function fakeUpstream(reply) {
	const calls = [];
	jest.spyOn(https, 'request').mockImplementation((options, onResponse) => {
		calls.push(options);
		const req = new EventEmitter();
		req.setTimeout = () => {};
		req.abort = () => {};
		req.end = () => setTimeout(() => {
			const r = reply(options.headers);
			if (r.error) { req.emit('error', new Error('offline')); return; }
			const up = new EventEmitter();
			up.statusCode = r.status;
			up.headers = r.headers || {};
			up.resume = () => {};
			onResponse(up);
			if (r.body) up.emit('data', Buffer.from(r.body));
			up.emit('end');
		}, 0);
		return req;
	});
	return calls;
}

// Calls handleTile and resolves with what was sent.
function request(rest) {
	return new Promise((resolve) => {
		const res = {
			finished: false,
			writeHead(status, headers) { this.status = status; this.headers = headers; },
			end(data) { this.finished = true; resolve({status: this.status, headers: this.headers, body: data ? data.toString() : ''}); },
		};
		tiles.handleTile({}, res, rest, 'MemoriesTV/test');
	});
}

const PNG = {status: 200, headers: {'content-type': 'image/png', etag: '"v1"', 'cache-control': 'max-age=60'}, body: 'PNG'};

afterEach(() => jest.restoreAllMocks());

describe('parse', () => {
	test('known providers within their zoom range and tile grid', () => {
		expect(tiles.parse('osm/11/1072/709.png')).toEqual({key: 'osm/11/1072/709', url: 'https://tile.openstreetmap.org/11/1072/709.png'});
		expect(tiles.parse('topo/3/1/2.png').url).toMatch(/^https:\/\/[abc]\.tile\.opentopomap\.org\/3\/1\/2\.png$/);
	});

	test('rejects unknown providers, zooms past the provider, and tiles outside the grid', () => {
		expect(tiles.parse('evil/1/0/0.png')).toBeNull();
		expect(tiles.parse('topo/18/0/0.png')).toBeNull();
		expect(tiles.parse('osm/2/4/0.png')).toBeNull();
		expect(tiles.parse('osm/2/0/0.png/../../x')).toBeNull();
	});
});

test('freshFor keeps tiles at least 7 and at most 30 days', () => {
	expect(tiles.freshFor('max-age=60')).toBe(7 * DAY);
	expect(tiles.freshFor('max-age=1209600')).toBe(14 * DAY);
	expect(tiles.freshFor('max-age=99999999')).toBe(30 * DAY);
	expect(tiles.freshFor(undefined)).toBe(7 * DAY);
});

describe('handleTile', () => {
	beforeEach(() => tiles.useStore(tiles.memoryStore(1024 * 1024)));

	test('unknown tiles are a 404 without asking the tile server', async () => {
		const calls = fakeUpstream(() => PNG);
		expect((await request('osm/2/9/9.png')).status).toBe(404);
		expect(calls).toHaveLength(0);
	});

	test('fetches a tile once with the app User-Agent, then serves it from the cache', async () => {
		const calls = fakeUpstream(() => PNG);
		expect(await request('osm/3/1/1.png')).toMatchObject({status: 200, body: 'PNG'});
		expect(await request('osm/3/1/1.png')).toMatchObject({status: 200, body: 'PNG'});
		expect(calls).toHaveLength(1);
		expect(calls[0].headers['User-Agent']).toBe('MemoriesTV/test');
	});

	test('requests for the same tile at the same time share one fetch', async () => {
		const calls = fakeUpstream(() => PNG);
		const [a, b] = await Promise.all([request('osm/3/2/2.png'), request('osm/3/2/2.png')]);
		expect(a.body).toBe('PNG');
		expect(b.body).toBe('PNG');
		expect(calls).toHaveLength(1);
	});

	test('a stale tile is revalidated with its ETag and kept on 304', async () => {
		const store = tiles.memoryStore(1024 * 1024);
		store.put('osm/3/3/3', Buffer.from('OLD'), {type: 'image/png', etag: '"v1"', fetched: Date.now() - 8 * DAY, fresh: 7 * DAY});
		tiles.useStore(store);
		const calls = fakeUpstream((headers) => (headers['If-None-Match'] === '"v1"' ? {status: 304} : PNG));
		expect(await request('osm/3/3/3.png')).toMatchObject({status: 200, body: 'OLD'});
		expect(calls).toHaveLength(1);
		// fresh again: no second request
		await request('osm/3/3/3.png');
		expect(calls).toHaveLength(1);
	});

	test('a stale tile is served when the tile server is unreachable', async () => {
		const store = tiles.memoryStore(1024 * 1024);
		store.put('osm/3/4/4', Buffer.from('OLD'), {type: 'image/png', fetched: 0});
		tiles.useStore(store);
		fakeUpstream(() => ({error: true}));
		expect(await request('osm/3/4/4.png')).toMatchObject({status: 200, body: 'OLD'});
	});

	test('without a cached tile, upstream failures become 404 or 502', async () => {
		fakeUpstream(() => ({status: 404}));
		expect((await request('osm/3/5/5.png')).status).toBe(404);
		jest.restoreAllMocks();
		fakeUpstream(() => ({error: true}));
		expect((await request('osm/3/6/6.png')).status).toBe(502);
	});
});

describe('stores', () => {
	test('the memory store drops the least recently used tiles past its cap', () => {
		const store = tiles.memoryStore(10);
		store.put('a', Buffer.from('123456'), {});
		store.put('b', Buffer.from('123456'), {});
		expect(store.get('a')).toBeNull();
		expect(store.get('b').data.toString()).toBe('123456');
	});

	test('the disk store trims to its cap and finds its tiles again after a restart', () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tiles-test-'));
		try {
			const store = tiles.diskStore(dir, 25);
			store.put('osm/1/0/0', Buffer.from('0123456789'), {fetched: 1});
			store.put('osm/1/0/1', Buffer.from('0123456789'), {fetched: 2});
			store.put('osm/1/1/1', Buffer.from('0123456789'), {fetched: 3});
			// 30 bytes > 25: the oldest tiles go until it is below 80 % of the cap
			expect(store.get('osm/1/0/0')).toBeNull();
			const restarted = tiles.diskStore(dir, 1000);
			expect(restarted.get('osm/1/1/1')).toEqual({data: Buffer.from('0123456789'), meta: {fetched: 3}});
		} finally {
			fs.rmSync(dir, {recursive: true, force: true});
		}
	});
});
