type RotationStore = typeof import('./rotationStore');

// A fresh module instance models an app restart: the in-memory cache is gone, storage remains.
function freshStore(): RotationStore {
	let store: RotationStore | undefined;
	jest.isolateModules(() => {
		store = require('./rotationStore');
	});
	return store!;
}

describe('rotationStore', () => {
	beforeEach(() => localStorage.clear());

	test('cycles clockwise by quarter turns and persists across restarts', () => {
		const store = freshStore();
		expect(store.rotateClockwise('a')).toBe(90);
		expect(store.rotateClockwise('a')).toBe(180);
		const restarted = freshStore();
		expect(restarted.getRotation('a')).toBe(180);
		expect(restarted.rotateClockwise('a')).toBe(270);
		expect(restarted.rotateClockwise('a')).toBe(0);
		expect(JSON.parse(localStorage.getItem('memoriestv_rotations')!)).toEqual([]);
	});

	test('keeps only the most recently rotated assets', () => {
		const store = freshStore();
		for (let i = 0; i < 1001; i++) store.rotateClockwise(`asset-${i}`);
		expect(store.getRotation('asset-0')).toBe(0);
		expect(store.getRotation('asset-1000')).toBe(90);
	});

	test('trims the oldest rotations, also for numeric file ids', () => {
		// The oldest rotation has the highest id, so numeric key order would trim '1' instead.
		const store = freshStore();
		store.rotateClockwise('99999');
		for (let i = 1; i <= 1000; i++) store.rotateClockwise(String(i));
		const restarted = freshStore();
		expect(restarted.getRotation('99999')).toBe(0);
		expect(restarted.getRotation('1')).toBe(90);
		expect(restarted.getRotation('1000')).toBe(90);
	});

	test('reads rotations saved by earlier versions', () => {
		localStorage.setItem('immich_rotations', JSON.stringify({'42': 270}));
		expect(freshStore().getRotation('42')).toBe(270);
		expect(localStorage.getItem('immich_rotations')).toBeNull();
	});
});
