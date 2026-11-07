import {boundsContain, cellSize, holdOffset, holdSpeed, HOLD_DELAY_MS, padBounds, snapBounds, tapOffset} from './mapGeometry';

describe('mapGeometry', () => {
	test('cellSize halves with every zoom level', () => {
		expect(cellSize(0)).toBe(180);
		expect(cellSize(1)).toBe(90);
		expect(cellSize(11)).toBeCloseTo(0.087890625);
	});

	test('snapBounds rounds outwards to grid cells', () => {
		// zoom 2: 45° cells
		expect(snapBounds([10, 50, -20, 100], 2)).toEqual([0, 90, -45, 135]);
	});

	test('snapBounds gives the same bounds for small pans', () => {
		const a = snapBounds([47.31, 47.42, 8.45, 8.62], 11);
		const b = snapBounds([47.32, 47.43, 8.46, 8.63], 11);
		expect(b).toEqual(a);
	});

	test('snapBounds clamps to the world', () => {
		expect(snapBounds([-100, 100, -200, 200], 3)).toEqual([-90, 90, -180, 180]);
	});

	test('padBounds grows each side by the fraction', () => {
		expect(padBounds([0, 10, 0, 20], 0.25)).toEqual([-2.5, 12.5, -5, 25]);
	});

	test('boundsContain', () => {
		expect(boundsContain([0, 10, 0, 10], 5, 5)).toBe(true);
		expect(boundsContain([0, 10, 0, 10], 11, 5)).toBe(false);
	});

	test('tapOffset pans a quarter of the map', () => {
		expect(tapOffset('left', 800, 600)).toEqual([-200, 0]);
		expect(tapOffset('down', 800, 600)).toEqual([0, 150]);
	});

	test('holding starts after the delay and speeds up', () => {
		expect(holdSpeed(HOLD_DELAY_MS - 1)).toBe(0);
		expect(holdSpeed(HOLD_DELAY_MS)).toBe(500);
		expect(holdSpeed(HOLD_DELAY_MS + 1000)).toBe(2000);
		expect(holdSpeed(HOLD_DELAY_MS + 60000)).toBe(3000);
	});

	test('holdOffset combines held directions', () => {
		const held = new Map([['right', 0], ['up', 0]] as const);
		const [dx, dy] = holdOffset(held, HOLD_DELAY_MS, 100);
		expect(dx).toBeCloseTo(50);
		expect(dy).toBeCloseTo(-50);
	});
});
