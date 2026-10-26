import {formatAssetDateTime, formatCount, formatDuration} from './FormattingService';

describe('formatDuration', () => {
	it('formats sub-hour durations as M:SS', () => {
		expect(formatDuration(106.786)).toBe('1:46');
		expect(formatDuration(9)).toBe('0:09');
	});

	it('formats hour-plus durations as H:MM:SS', () => {
		expect(formatDuration(3723)).toBe('1:02:03');
	});
});

describe('formatAssetDateTime', () => {
	test('formats the wall-clock fields regardless of the TV timezone', () => {
		expect(formatAssetDateTime('2016-08-30T23:49:37.000Z')).toEqual({date: 'Tuesday, Aug 30, 2016', time: '23:49'});
	});
});

describe('formatCount', () => {
	it('pluralizes and groups thousands', () => {
		expect(formatCount(1, 'item')).toBe('1 item');
		expect(formatCount(0, 'album')).toBe('0 albums');
		expect(formatCount(1234, 'item')).toBe('1,234 items');
	});

	it('takes an irregular plural', () => {
		expect(formatCount(1, 'person', 'people')).toBe('1 person');
		expect(formatCount(3, 'person', 'people')).toBe('3 people');
	});
});
