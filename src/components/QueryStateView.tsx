import React, {useCallback, useState} from 'react';
import Button from '@enact/sandstone/Button';
import {useQueryClient} from '@tanstack/react-query';
import {APIError} from '../api/client';
import {presentError} from '../utils/presentError';
import css from './QueryStateView.module.less';

interface QueryStateViewProps {
	isLoading: boolean;
	error: unknown;
	isEmpty?: boolean;
	loadingText?: string;
	errorText?: string;
	emptyText?: string;
	className?: string;
	children: React.ReactNode;
}

// Refetches every failed query on screen.
const RetryButton: React.FC = () => {
	const queryClient = useQueryClient();
	const [busy, setBusy] = useState(false);
	const retry = useCallback(() => {
		setBusy(true);
		void queryClient.refetchQueries({type: 'active', predicate: (q) => q.state.status === 'error'}).finally(() => setBusy(false));
	}, [queryClient]);
	return (
		<Button size="small" onClick={retry} disabled={busy}>
			{busy ? 'Trying again…' : 'Try again'}
		</Button>
	);
};

export const QueryStateView: React.FC<QueryStateViewProps> = ({
	isLoading,
	error,
	isEmpty = false,
	loadingText = 'Loading…',
	errorText,
	emptyText = 'Nothing here yet.',
	className,
	children,
}) => {
	const stateClass = className ? `${css.state} ${className}` : css.state;
	if (isLoading) return <div className={stateClass}>{loadingText}</div>;
	if (error) {
		// A revoked sign-in opens Accounts instead (App's query cache); retrying can't help.
		const canRetry = !(error instanceof APIError && error.status === 401);
		return (
			<div className={stateClass}>
				<p className={css.message}>{errorText ?? presentError(error)}</p>
				{canRetry ? <RetryButton /> : null}
			</div>
		);
	}
	if (isEmpty) return <div className={stateClass}><p className={css.message}>{emptyText}</p></div>;
	return <>{children}</>;
};

QueryStateView.displayName = 'QueryStateView';
