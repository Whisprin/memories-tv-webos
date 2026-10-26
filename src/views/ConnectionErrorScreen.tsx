import React, {useEffect} from 'react';
import Button from '@enact/sandstone/Button';
import css from './ConnectionErrorScreen.module.less';

interface ConnectionErrorScreenProps {
	server: string;
	message: string;
	onRetry: () => void;
	onOpenAccounts: () => void;
}

// Shown at startup when the active account can't reach its server. Tries again by itself
// when the TV comes back online.
export const ConnectionErrorScreen: React.FC<ConnectionErrorScreenProps> = ({server, message, onRetry, onOpenAccounts}) => {
	useEffect(() => {
		window.addEventListener('online', onRetry);
		return () => window.removeEventListener('online', onRetry);
	}, [onRetry]);

	return (
		<div className={css.screen}>
			<h1 className={css.title}>Can&apos;t connect to Nextcloud</h1>
			<p className={css.server}>{server.replace(/^https?:\/\//, '')}</p>
			<p className={css.message}>{message}</p>
			<div className={css.actions}>
				<Button autoFocus onClick={onRetry}>
					Try again
				</Button>
				<Button onClick={onOpenAccounts}>Accounts</Button>
			</div>
		</div>
	);
};

ConnectionErrorScreen.displayName = 'ConnectionErrorScreen';
