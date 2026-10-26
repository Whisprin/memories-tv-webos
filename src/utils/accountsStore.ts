export interface Account {
	id: string;
	// Nextcloud base URL, including any subfolder, without a trailing slash
	baseUrl: string;
	loginName: string;
	// App password from Login Flow v2; revocable under Nextcloud → Settings → Security
	appPassword: string;
	// Nextcloud display name, filled in after sign-in
	displayName?: string;
	addedAt: number;
}

export interface AccountsStore {
	version: 1;
	accounts: Account[];
	defaultAccountId: string | null;
	lastActiveAccountId: string | null;
}

const ACCOUNTS_KEY = 'memoriestv_accounts';

const emptyStore = (): AccountsStore => ({
	version: 1,
	accounts: [],
	defaultAccountId: null,
	lastActiveAccountId: null,
});

const isAccount = (value: unknown): value is Account => {
	const a = value as Partial<Account> | null;
	return !!a && typeof a.id === 'string' && typeof a.baseUrl === 'string' && typeof a.loginName === 'string' && typeof a.appPassword === 'string';
};

export function readAccountsStore(): AccountsStore {
	const raw = localStorage.getItem(ACCOUNTS_KEY);
	if (raw) {
		try {
			const parsed = JSON.parse(raw) as Record<string, unknown>;
			if (parsed && parsed['version'] === 1 && Array.isArray(parsed['accounts'])) {
				const store = parsed as unknown as AccountsStore;
				return {...store, accounts: store.accounts.filter(isAccount)};
			}
		} catch (e) {
			console.error('[accountsStore] failed to parse store, starting empty', e);
		}
	}
	return emptyStore();
}

export function writeAccountsStore(store: AccountsStore): void {
	localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(store));
}

export function addAccountToStore(store: AccountsStore, account: Account): AccountsStore {
	return {
		...store,
		accounts: [...store.accounts, account],
		lastActiveAccountId: account.id,
	};
}

export function updateAccountInStore(store: AccountsStore, id: string, patch: Partial<Omit<Account, 'id'>>): AccountsStore {
	return {...store, accounts: store.accounts.map((a) => (a.id === id ? {...a, ...patch} : a))};
}

export function removeAccountFromStore(store: AccountsStore, id: string): AccountsStore {
	const accounts = store.accounts.filter(a => a.id !== id);
	const sortedRemaining = [...accounts].sort((a, b) => b.addedAt - a.addedAt);
	return {
		...store,
		accounts,
		defaultAccountId: store.defaultAccountId === id ? null : store.defaultAccountId,
		lastActiveAccountId:
			store.lastActiveAccountId === id ? (sortedRemaining[0]?.id ?? null) : store.lastActiveAccountId,
	};
}

export function setDefaultInStore(store: AccountsStore, id: string | null): AccountsStore {
	return {...store, defaultAccountId: id};
}

export function setLastActiveInStore(store: AccountsStore, id: string): AccountsStore {
	return {...store, lastActiveAccountId: id};
}
