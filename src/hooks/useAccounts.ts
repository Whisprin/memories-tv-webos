import {useState, useEffect, useCallback, useMemo, useRef} from 'react';
import {APIError, NextcloudClient, type NextcloudCredentials} from '../api/client';
import {MemoriesRepository, type MediaUrls} from '../api/MemoriesRepository';
import {getUser, revokeAppPassword} from '../api/nextcloudAuth';
import type {AuthSubmitResult, AuthFormPayload} from '../api/types';
import type {PhotoRepository} from '../domain/PhotoRepository';
import {hasHelperService, startMediaProxy} from '../platform/helperService';
import {
	readAccountsStore,
	writeAccountsStore,
	addAccountToStore,
	updateAccountInStore,
	removeAccountFromStore,
	setDefaultInStore,
	setLastActiveInStore,
	type Account,
	type AccountsStore,
} from '../utils/accountsStore';
import {randomId} from '../utils/uuid';
import {makeAuthErrorMessage, makeConnectErrorMessage} from './_authHelpers';

const credentialsOf = (a: Account): NextcloudCredentials => ({baseUrl: a.baseUrl, loginName: a.loginName, appPassword: a.appPassword});

// Without the helper service (a desktop browser during development) media URLs point at
// Nextcloud directly. Those need the Authorization header, so images won't load there.
const directMedia = (baseUrl: string): MediaUrls => ({
	memoriesUrl: (path) => `${baseUrl}/index.php/apps/memories/${path.replace(/^\/+/, '')}`,
	previewUrl: (fileid, x, y, a) => `${baseUrl}/index.php/apps/memories/api/image/preview/${fileid}?x=${x}&y=${y}&a=${a}`,
});

async function createRepository(account: Account): Promise<MemoriesRepository> {
	const media = hasHelperService()
		? await startMediaProxy({server: account.baseUrl, loginName: account.loginName, appPassword: account.appPassword})
		: directMedia(account.baseUrl);
	return new MemoriesRepository(new NextcloudClient(credentialsOf(account)), media);
}

const resolveActiveId = (store: AccountsStore): string | null =>
	store.defaultAccountId ?? store.lastActiveAccountId ?? store.accounts[0]?.id ?? null;

// Checks an account with Nextcloud and builds its repository. No React state: the hook applies
// the result in the promise's callbacks.
async function connectAccount(account: Account): Promise<{repository: MemoriesRepository; displayName: string}> {
	const user = await getUser(credentialsOf(account));
	return {repository: await createRepository(account), displayName: user.displayName};
}

const findAccount = (id: string | null): Account | undefined => (id ? readAccountsStore().accounts.find(a => a.id === id) : undefined);

export const useAccounts = () => {
	let _initial: AccountsStore | undefined;
	const getInitial = () => (_initial ??= readAccountsStore());

	const [store, setStore] = useState<AccountsStore>(getInitial);
	// The account the app opens with, as activate() would choose it: validating it until the
	// mount effect has connected.
	const [activeAccountId, setActiveAccountId] = useState<string | null>(() => findAccount(resolveActiveId(getInitial()))?.id ?? null);
	const [repository, setRepository] = useState<PhotoRepository | null>(null);
	const [isValidating, setIsValidating] = useState<boolean>(() => findAccount(resolveActiveId(getInitial())) !== undefined);
	const [validationError, setValidationError] = useState('');
	// The active account couldn't connect (offline, server down): shown with Try again, unlike a
	// rejected sign-in, which opens Accounts.
	const [connectionError, setConnectionError] = useState('');
	const repositoryRef = useRef<MemoriesRepository | null>(null);

	const persist = useCallback((next: AccountsStore) => {
		writeAccountsStore(next);
		setStore(next);
	}, []);

	// Swaps the active repository and stops the previous one's media proxy.
	const installRepository = useCallback((next: MemoriesRepository | null) => {
		const previous = repositoryRef.current;
		repositoryRef.current = next;
		setRepository(next);
		if (previous && previous !== next) previous.dispose();
	}, []);

	useEffect(() => () => repositoryRef.current?.dispose(), []);

	// Connects to an account and installs its repository, or records why it couldn't. State is
	// set only in the callbacks, once the server has answered; activate() resets it before.
	const connect = useCallback(
		(account: Account): Promise<void> =>
			connectAccount(account)
				.then(
					({repository: next, displayName}) => {
						if (displayName !== account.displayName) {
							persist(updateAccountInStore(readAccountsStore(), account.id, {displayName}));
						}
						installRepository(next);
						setActiveAccountId(account.id);
					},
					(error: unknown) => {
						console.error('[useAccounts] validation failed', error);
						// A 401 means the app password was revoked (Nextcloud → Settings → Security).
						if (error instanceof APIError && error.status === 401) setValidationError(makeAuthErrorMessage(error));
						else setConnectionError(makeConnectErrorMessage(error));
						installRepository(null);
						setActiveAccountId(account.id);
					}
				)
				.finally(() => setIsValidating(false)),
		[installRepository, persist]
	);

	const activate = useCallback(async (id: string | null) => {
		const account = findAccount(id);
		if (!account) {
			installRepository(null);
			setActiveAccountId(null);
			setIsValidating(false);
			return;
		}
		setIsValidating(true);
		setValidationError('');
		setConnectionError('');
		await connect(account);
	}, [connect, installRepository]);

	// On mount, connect to the account chosen above; its state is already set up for that.
	// Later activations are explicit (switchTo, removeAccount).
	useEffect(() => {
		const account = findAccount(activeAccountId);
		if (account) void connect(account);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const addAccount = useCallback(
		async (input: AuthFormPayload): Promise<AuthSubmitResult> => {
			setIsValidating(true);
			setValidationError('');
			try {
				const credentials: NextcloudCredentials = {baseUrl: input.baseUrl, loginName: input.loginName, appPassword: input.appPassword};
				const user = await getUser(credentials);
				const account: Account = {id: randomId(), ...credentials, displayName: user.displayName, addedAt: Date.now()};
				// Signing in again to the same account replaces the old entry and its app password.
				const existing = store.accounts.find(a => a.baseUrl === account.baseUrl && a.loginName === account.loginName);
				let next = existing ? removeAccountFromStore(store, existing.id) : store;
				next = addAccountToStore(next, account);
				if (existing && store.defaultAccountId === existing.id) next = setDefaultInStore(next, account.id);
				persist(next);
				installRepository(await createRepository(account));
				setActiveAccountId(account.id);
				if (existing) {
					revokeAppPassword(credentialsOf(existing)).catch((e) => console.warn('[useAccounts] could not revoke the replaced app password', e));
				}
				return {success: true};
			} catch (error) {
				console.error('[useAccounts] addAccount failed', error);
				return {success: false, errorMessage: makeAuthErrorMessage(error)};
			} finally {
				setIsValidating(false);
			}
		},
		[installRepository, persist, store],
	);

	// Removing an account signs it out: its app password is revoked on the server too.
	// Local data is cleared even if the server can't be reached.
	const removeAccount = useCallback(
		(id: string) => {
			const account = store.accounts.find(a => a.id === id);
			const next = removeAccountFromStore(store, id);
			persist(next);
			if (account) {
				revokeAppPassword(credentialsOf(account)).catch((e) => {
					if (!(e instanceof APIError)) console.warn('[useAccounts] revoke failed', e);
				});
			}
			if (id === activeAccountId) {
				void activate(next.lastActiveAccountId);
			}
		},
		[activate, activeAccountId, persist, store],
	);

	const switchTo = useCallback(
		(id: string) => {
			const next = setLastActiveInStore(store, id);
			persist(next);
			void activate(id);
		},
		[activate, persist, store],
	);

	const retryConnection = useCallback(() => {
		void activate(activeAccountId);
	}, [activate, activeAccountId]);

	const setAsDefault = useCallback(
		(id: string | null) => {
			persist(setDefaultInStore(store, id));
		},
		[persist, store],
	);

	const value = useMemo(
		() => ({
			accounts: store.accounts,
			activeAccountId,
			defaultAccountId: store.defaultAccountId,
			repository,
			isValidating,
			validationError,
			connectionError,
			addAccount,
			removeAccount,
			switchTo,
			retryConnection,
			setAsDefault,
		}),
		[
			store,
			activeAccountId,
			repository,
			isValidating,
			validationError,
			connectionError,
			addAccount,
			removeAccount,
			switchTo,
			retryConnection,
			setAsDefault,
		],
	);

	return value;
};
