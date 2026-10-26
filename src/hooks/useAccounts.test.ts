import {act, renderHook, waitFor} from '@testing-library/react';
import {APIError} from '../api/client';
import type {Account} from '../utils/accountsStore';
import {useAccounts} from './useAccounts';

jest.mock('../api/nextcloudAuth', () => ({
	getUser: jest.fn(),
	revokeAppPassword: jest.fn(),
}));

import {getUser, revokeAppPassword} from '../api/nextcloudAuth';

const mockGetUser = getUser as jest.MockedFunction<typeof getUser>;
const mockRevoke = revokeAppPassword as jest.MockedFunction<typeof revokeAppPassword>;

const account = (id: string, addedAt: number): Account => ({
	id,
	baseUrl: `https://${id}.example`,
	loginName: `user-${id}`,
	appPassword: `pw-${id}`,
	addedAt,
});

const unauthorized = () => new APIError('API request failed: 401', 401);

beforeEach(() => {
	localStorage.clear();
	mockGetUser.mockReset();
	mockGetUser.mockImplementation(async (c) => ({id: c.loginName, displayName: `Name of ${c.loginName}`}));
	mockRevoke.mockReset();
	mockRevoke.mockResolvedValue(undefined);
});

const seed = (
	accounts: Account[],
	extra: Partial<{defaultAccountId: string; lastActiveAccountId: string}> = {},
) => {
	localStorage.setItem(
		'memoriestv_accounts',
		JSON.stringify({
			version: 1,
			accounts,
			defaultAccountId: extra.defaultAccountId ?? null,
			lastActiveAccountId: extra.lastActiveAccountId ?? accounts[0]?.id ?? null,
		}),
	);
};

describe('useAccounts initial state', () => {
	test('exposes empty list when no store', () => {
		const {result} = renderHook(() => useAccounts());
		expect(result.current.accounts).toEqual([]);
		expect(result.current.activeAccountId).toBeNull();
	});

	test('validates the active account on mount and stores its display name', async () => {
		seed([account('a', 1)]);
		const {result} = renderHook(() => useAccounts());
		await waitFor(() => expect(result.current.repository).not.toBeNull());
		expect(result.current.activeAccountId).toBe('a');
		expect(result.current.accounts[0]?.displayName).toBe('Name of user-a');
	});

	test('keeps activeAccountId set but repository null on 401', async () => {
		mockGetUser.mockRejectedValue(unauthorized());
		seed([account('a', 1)]);
		const {result} = renderHook(() => useAccounts());
		await waitFor(() => expect(result.current.isValidating).toBe(false));
		expect(result.current.repository).toBeNull();
		expect(result.current.activeAccountId).toBe('a');
		expect(result.current.validationError).toMatch(/sign in again/i);
	});
});

describe('addAccount', () => {
	test('stores the new account and activates it', async () => {
		const {result} = renderHook(() => useAccounts());
		let outcome: Awaited<ReturnType<typeof result.current.addAccount>> | undefined;
		await act(async () => {
			outcome = await result.current.addAccount({baseUrl: 'https://cloud.example', loginName: 'alice', appPassword: 'secret'});
		});
		expect(outcome).toEqual({success: true});
		expect(result.current.accounts).toHaveLength(1);
		expect(result.current.accounts[0]).toMatchObject({baseUrl: 'https://cloud.example', loginName: 'alice', appPassword: 'secret', displayName: 'Name of alice'});
		expect(result.current.activeAccountId).toBe(result.current.accounts[0]?.id);
		expect(result.current.repository).not.toBeNull();
	});

	test('signing in again to the same account replaces it and revokes the old app password', async () => {
		const old = {...account('a', 1), baseUrl: 'https://cloud.example', loginName: 'alice'};
		seed([old], {defaultAccountId: 'a'});
		const {result} = renderHook(() => useAccounts());
		await waitFor(() => expect(result.current.isValidating).toBe(false));
		await act(async () => {
			await result.current.addAccount({baseUrl: 'https://cloud.example', loginName: 'alice', appPassword: 'new-secret'});
		});
		expect(result.current.accounts).toHaveLength(1);
		expect(result.current.accounts[0]?.appPassword).toBe('new-secret');
		expect(result.current.defaultAccountId).toBe(result.current.accounts[0]?.id);
		expect(mockRevoke).toHaveBeenCalledWith({baseUrl: 'https://cloud.example', loginName: 'alice', appPassword: old.appPassword});
	});

	test('reports a rejected sign-in without storing anything', async () => {
		mockGetUser.mockRejectedValue(unauthorized());
		const {result} = renderHook(() => useAccounts());
		let outcome: Awaited<ReturnType<typeof result.current.addAccount>> | undefined;
		await act(async () => {
			outcome = await result.current.addAccount({baseUrl: 'https://cloud.example', loginName: 'alice', appPassword: 'bad'});
		});
		expect(outcome?.success).toBe(false);
		expect(result.current.accounts).toEqual([]);
	});
});

describe('removeAccount', () => {
	const a = account('a', 1);
	const b = account('b', 2);

	test('drops the account from the list and revokes its app password', async () => {
		seed([a, b]);
		const {result} = renderHook(() => useAccounts());
		await waitFor(() => expect(result.current.isValidating).toBe(false));
		act(() => result.current.removeAccount('b'));
		expect(result.current.accounts.map(x => x.id)).toEqual(['a']);
		expect(mockRevoke).toHaveBeenCalledWith({baseUrl: b.baseUrl, loginName: b.loginName, appPassword: b.appPassword});
	});

	test('removing active account switches to next most recent', async () => {
		seed([a, b], {lastActiveAccountId: 'b'});
		const {result} = renderHook(() => useAccounts());
		await waitFor(() => expect(result.current.activeAccountId).toBe('b'));
		act(() => result.current.removeAccount('b'));
		await waitFor(() => expect(result.current.activeAccountId).toBe('a'));
	});

	test('removing the last account clears active', async () => {
		seed([a]);
		const {result} = renderHook(() => useAccounts());
		await waitFor(() => expect(result.current.activeAccountId).toBe('a'));
		act(() => result.current.removeAccount('a'));
		await waitFor(() => expect(result.current.activeAccountId).toBeNull());
		expect(result.current.repository).toBeNull();
	});
});

describe('switchTo', () => {
	const a = account('a', 1);
	const b = account('b', 2);

	test('changes activeAccountId and re-validates', async () => {
		seed([a, b], {lastActiveAccountId: 'a'});
		const {result} = renderHook(() => useAccounts());
		await waitFor(() => expect(result.current.activeAccountId).toBe('a'));
		act(() => result.current.switchTo('b'));
		await waitFor(() => expect(result.current.activeAccountId).toBe('b'));
		await waitFor(() => expect(result.current.repository).not.toBeNull());
	});

	test('on 401 keeps the new id but clears repository', async () => {
		seed([a, b], {lastActiveAccountId: 'a'});
		const {result} = renderHook(() => useAccounts());
		await waitFor(() => expect(result.current.activeAccountId).toBe('a'));
		mockGetUser.mockRejectedValueOnce(unauthorized());
		act(() => result.current.switchTo('b'));
		await waitFor(() => expect(result.current.isValidating).toBe(false));
		expect(result.current.activeAccountId).toBe('b');
		expect(result.current.repository).toBeNull();
	});
});

describe('setAsDefault', () => {
	const a = account('a', 1);
	const b = account('b', 2);

	test('updates defaultAccountId', async () => {
		seed([a, b]);
		const {result} = renderHook(() => useAccounts());
		await waitFor(() => expect(result.current.isValidating).toBe(false));
		act(() => result.current.setAsDefault('b'));
		expect(result.current.defaultAccountId).toBe('b');
	});

	test('clears defaultAccountId with null', async () => {
		seed([a], {defaultAccountId: 'a'});
		const {result} = renderHook(() => useAccounts());
		await waitFor(() => expect(result.current.defaultAccountId).toBe('a'));
		act(() => result.current.setAsDefault(null));
		expect(result.current.defaultAccountId).toBeNull();
	});
});
