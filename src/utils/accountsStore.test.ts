import {
	readAccountsStore,
	writeAccountsStore,
	addAccountToStore,
	updateAccountInStore,
	removeAccountFromStore,
	setDefaultInStore,
	setLastActiveInStore,
	type AccountsStore,
	type Account,
} from './accountsStore';

const ACCOUNTS_KEY = 'memoriestv_accounts';

const account = (id: string, addedAt: number): Account => ({
	id,
	baseUrl: `https://${id}.example`,
	loginName: `user-${id}`,
	appPassword: `pw-${id}`,
	addedAt,
});

beforeEach(() => {
	localStorage.clear();
});

describe('readAccountsStore', () => {
	test('returns empty store when nothing in localStorage', () => {
		const store = readAccountsStore();
		expect(store).toEqual({version: 1, accounts: [], defaultAccountId: null, lastActiveAccountId: null});
	});

	test('returns the parsed store when present and valid', () => {
		const acc = {...account('abc', 123), displayName: 'Alice'};
		localStorage.setItem(
			ACCOUNTS_KEY,
			JSON.stringify({version: 1, accounts: [acc], defaultAccountId: null, lastActiveAccountId: 'abc'}),
		);
		expect(readAccountsStore()).toEqual({
			version: 1,
			accounts: [acc],
			defaultAccountId: null,
			lastActiveAccountId: 'abc',
		});
	});

	test('drops entries without credentials', () => {
		const good = account('a', 1);
		localStorage.setItem(
			ACCOUNTS_KEY,
			JSON.stringify({version: 1, accounts: [good, {id: 'b', baseUrl: 'https://b'}], defaultAccountId: null, lastActiveAccountId: 'a'}),
		);
		expect(readAccountsStore().accounts).toEqual([good]);
	});

	test('returns an empty store for unparseable data', () => {
		localStorage.setItem(ACCOUNTS_KEY, '{not json');
		expect(readAccountsStore().accounts).toEqual([]);
	});

	test('ignores stores of an unknown version', () => {
		localStorage.setItem(ACCOUNTS_KEY, JSON.stringify({version: 99, accounts: [account('a', 1)]}));
		expect(readAccountsStore().accounts).toEqual([]);
	});
});

describe('mutators', () => {
	const base: AccountsStore = {version: 1, accounts: [], defaultAccountId: null, lastActiveAccountId: null};
	const a = account('a', 1);
	const b = account('b', 2);

	test('addAccountToStore appends and sets lastActive', () => {
		const next = addAccountToStore(base, a);
		expect(next.accounts).toEqual([a]);
		expect(next.lastActiveAccountId).toBe('a');
		expect(next.defaultAccountId).toBeNull();
	});

	test('addAccountToStore preserves existing default', () => {
		const initial = {...base, accounts: [a], defaultAccountId: 'a', lastActiveAccountId: 'a'};
		const next = addAccountToStore(initial, b);
		expect(next.defaultAccountId).toBe('a');
		expect(next.lastActiveAccountId).toBe('b');
	});

	test('updateAccountInStore patches only the matching account', () => {
		const initial = {...base, accounts: [a, b]};
		const next = updateAccountInStore(initial, 'b', {displayName: 'Bob'});
		expect(next.accounts).toEqual([a, {...b, displayName: 'Bob'}]);
	});

	test('removeAccountFromStore drops the account and clears defaults pointing at it', () => {
		const initial: AccountsStore = {
			version: 1,
			accounts: [a, b],
			defaultAccountId: 'a',
			lastActiveAccountId: 'a',
		};
		const next = removeAccountFromStore(initial, 'a');
		expect(next.accounts).toEqual([b]);
		expect(next.defaultAccountId).toBeNull();
		expect(next.lastActiveAccountId).toBe('b');
	});

	test('removeAccountFromStore on empty list leaves both ids null', () => {
		const initial: AccountsStore = {version: 1, accounts: [a], defaultAccountId: 'a', lastActiveAccountId: 'a'};
		const next = removeAccountFromStore(initial, 'a');
		expect(next.accounts).toEqual([]);
		expect(next.defaultAccountId).toBeNull();
		expect(next.lastActiveAccountId).toBeNull();
	});

	test('setDefaultInStore sets and clears', () => {
		const initial: AccountsStore = {version: 1, accounts: [a, b], defaultAccountId: null, lastActiveAccountId: 'a'};
		expect(setDefaultInStore(initial, 'b').defaultAccountId).toBe('b');
		expect(setDefaultInStore(initial, null).defaultAccountId).toBeNull();
	});

	test('setLastActiveInStore updates only that field', () => {
		const initial: AccountsStore = {version: 1, accounts: [a, b], defaultAccountId: 'a', lastActiveAccountId: 'a'};
		const next = setLastActiveInStore(initial, 'b');
		expect(next.lastActiveAccountId).toBe('b');
		expect(next.defaultAccountId).toBe('a');
	});
});

describe('writeAccountsStore', () => {
	test('serializes to localStorage', () => {
		const store: AccountsStore = {
			version: 1,
			accounts: [account('x', 7)],
			defaultAccountId: 'x',
			lastActiveAccountId: 'x',
		};
		writeAccountsStore(store);
		expect(JSON.parse(localStorage.getItem(ACCOUNTS_KEY)!)).toEqual(store);
	});
});
