import {renameStorageKey} from './renameStorageKey';

beforeEach(() => localStorage.clear());

test('moves a value saved under the old key', () => {
	localStorage.setItem('old', '{"a":1}');
	renameStorageKey('old', 'new');
	expect(localStorage.getItem('new')).toBe('{"a":1}');
	expect(localStorage.getItem('old')).toBeNull();
});

test('keeps a value already saved under the new key', () => {
	localStorage.setItem('old', 'stale');
	localStorage.setItem('new', 'current');
	renameStorageKey('old', 'new');
	expect(localStorage.getItem('new')).toBe('current');
	expect(localStorage.getItem('old')).toBeNull();
});
