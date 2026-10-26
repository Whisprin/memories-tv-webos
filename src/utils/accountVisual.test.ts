import {deriveLabel, deriveInitial, pickGradient, GRADIENT_PALETTE} from './accountVisual';
import type {Account} from './accountsStore';

const make = (over: Partial<Account>): Account => ({
	id: 'id',
	baseUrl: 'https://cloud.home.local',
	loginName: 'marie',
	appPassword: 'pw',
	addedAt: 0,
	...over,
});

describe('deriveLabel', () => {
	test('prefers the Nextcloud display name', () => {
		expect(deriveLabel(make({displayName: 'Marie Curie'}))).toBe('Marie Curie');
	});

	test('falls back to the login name', () => {
		expect(deriveLabel(make({}))).toBe('marie');
	});

	test('falls back to the host when there is no name', () => {
		expect(deriveLabel(make({loginName: '', baseUrl: 'https://cloud.home.local:8443'}))).toBe('cloud.home.local');
	});

	test('tolerates a baseUrl without scheme', () => {
		expect(deriveLabel(make({loginName: '', baseUrl: '192.168.1.42:8080'}))).toBe('192.168.1.42');
	});
});

describe('deriveInitial', () => {
	test('uppercases the first visible glyph of the label', () => {
		expect(deriveInitial(make({displayName: 'marie curie'}))).toBe('M');
		expect(deriveInitial(make({loginName: '', baseUrl: 'https://cloud.home.local'}))).toBe('C');
	});
});

describe('pickGradient', () => {
	test('returns a member of the palette', () => {
		expect(GRADIENT_PALETTE).toContain(pickGradient('any-id'));
	});

	test('is deterministic for the same id', () => {
		expect(pickGradient('abc')).toBe(pickGradient('abc'));
	});

	test('produces different gradients for different ids (at least sometimes)', () => {
		const seen = new Set<string>();
		for (let i = 0; i < 50; i++) seen.add(pickGradient(`id-${i}`));
		expect(seen.size).toBeGreaterThan(1);
	});
});
