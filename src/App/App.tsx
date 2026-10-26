import ThemeDecorator from '@enact/sandstone/ThemeDecorator';
import Panels from '@enact/sandstone/Panels';
import {QueryCache, QueryClient, QueryClientProvider} from '@tanstack/react-query';
import React, {useCallback, useMemo, useState} from 'react';

import {useAccounts} from '../hooks/useAccounts';
import {RepositoryProvider} from '../domain/RepositoryContext';
import {APIError} from '../api/client';
import AppLayout from '../views/AppLayout';
import {AccountPanel} from '../views/AccountPanel/AccountPanel';
import {ConnectionErrorScreen} from '../views/ConnectionErrorScreen';
import {deriveInitial, pickGradient} from '../utils/accountVisual';
import type {AuthFormPayload, AuthSubmitResult} from '../components/AuthForm/AuthForm';

import './attachErrorHandler';
import '../styles/tokens.less';

import css from './App.module.less';

const AppBase: React.FC = () => {
	const {
		accounts,
		activeAccountId,
		defaultAccountId,
		repository,
		isValidating,
		validationError,
		connectionError,
		addAccount,
		removeAccount,
		switchTo,
		retryConnection,
		setAsDefault,
	} = useAccounts();

	const [overlayOpen, setOverlayOpen] = useState(false);

	const openOverlay = useCallback(() => setOverlayOpen(true), []);
	const closeOverlay = useCallback(() => setOverlayOpen(false), []);

	const activeAccount = accounts.find(a => a.id === activeAccountId) ?? null;

	const accountLetter = activeAccount ? deriveInitial(activeAccount) : '?';
	const accountGradient = activeAccount ? pickGradient(activeAccount.id) : '#3a3e46';

	const handleSwitch = useCallback(
		(id: string) => {
			switchTo(id);
			closeOverlay();
		},
		[switchTo, closeOverlay],
	);

	const handleAddAccount = useCallback(
		async (payload: AuthFormPayload): Promise<AuthSubmitResult> => {
			const result = await addAccount(payload);
			if (result.success) closeOverlay();
			return result;
		},
		[addAccount, closeOverlay],
	);

	const makeQueryClient = useCallback(
		() =>
			new QueryClient({
				queryCache: new QueryCache({
					onError: (error) => {
						if (error instanceof APIError && error.status === 401) openOverlay();
					},
				}),
			}),
		// Re-create only when activeAccountId changes (cache reset on account switch).
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[activeAccountId],
	);

	const queryClient = useMemo(makeQueryClient, [makeQueryClient]);

	// Branch 1: no accounts at all → first-launch flow
	if (accounts.length === 0) {
		return (
			<div className={css.app}>
				<Panels>
					<AccountPanel
						mode="first-launch"
						accounts={accounts}
						activeAccountId={activeAccountId}
						defaultAccountId={defaultAccountId}
						onSwitch={handleSwitch}
						onSetDefault={setAsDefault}
						onRemove={removeAccount}
						onAddAccount={handleAddAccount}
					/>
				</Panels>
			</div>
		);
	}

	// Branch 2: accounts exist but no repository yet
	if (isValidating && !repository && !overlayOpen) {
		return (
			<div className={css.boot}>Connecting to Nextcloud…</div>
		);
	}

	// The server or the network is down: offer to try again rather than sending the user to Accounts.
	if (!repository && connectionError && activeAccount && !overlayOpen) {
		return (
			<ConnectionErrorScreen server={activeAccount.baseUrl} message={connectionError} onRetry={retryConnection} onOpenAccounts={openOverlay} />
		);
	}

	if (!repository) {
		// 401 on boot — force account switch/re-auth. Also Accounts opened from the connection error screen.
		return (
			<div className={css.app}>
				{validationError && (
					<div className={css.toast}>{validationError}</div>
				)}
				<Panels>
					<AccountPanel
						mode="overlay"
						accounts={accounts}
						activeAccountId={activeAccountId}
						defaultAccountId={defaultAccountId}
						onSwitch={handleSwitch}
						onSetDefault={setAsDefault}
						onRemove={removeAccount}
						onAddAccount={handleAddAccount}
						onCloseOverlay={connectionError ? closeOverlay : undefined}
					/>
				</Panels>
			</div>
		);
	}

	// Branch 3: repository ready
	return (
		<QueryClientProvider client={queryClient}>
			<RepositoryProvider key={activeAccountId ?? undefined} repository={repository}>
				<div className={css.app}>
					{validationError && (
						<div className={css.toast}>{validationError}</div>
					)}
					<AppLayout
						onOpenAccount={openOverlay}
						accountLetter={accountLetter}
						accountGradient={accountGradient}
					/>
					{overlayOpen && (
						<AccountPanel
							mode="overlay"
							accounts={accounts}
							activeAccountId={activeAccountId}
							defaultAccountId={defaultAccountId}
							onSwitch={handleSwitch}
							onSetDefault={setAsDefault}
							onRemove={removeAccount}
							onAddAccount={handleAddAccount}
							onCloseOverlay={closeOverlay}
						/>
					)}
				</div>
			</RepositoryProvider>
		</QueryClientProvider>
	);
};

export default ThemeDecorator(AppBase);
