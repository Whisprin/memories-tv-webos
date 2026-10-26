import {APIError, TIMEOUT_REASON} from '../api/client';

const isOffline = (): boolean => typeof navigator !== 'undefined' && navigator.onLine === false;

// What to tell the user about a failed request to their Nextcloud server.
export function presentError(err: unknown): string {
	if (err instanceof APIError) {
		const {status} = err;
		if (!status) {
			if (isOffline()) return 'The TV is offline. Check its network connection.';
			if (err.message.includes(TIMEOUT_REASON)) return 'Your Nextcloud server took too long to answer. Try again in a moment.';
			return "Can't reach your Nextcloud server. Check that it's running and that the TV can reach it.";
		}
		if (status === 401) return 'Your sign-in is no longer valid. Sign in again from Accounts.';
		if (status === 403) return "Your Nextcloud account doesn't have access to this.";
		if (status === 404) return 'Not found. It may have been moved or deleted in Nextcloud.';
		if (status === 503) return 'Nextcloud is in maintenance mode or temporarily unavailable. Try again in a few minutes.';
		if (status >= 500) return `Your Nextcloud server had a problem (error ${status}). Try again later.`;
		return `Your Nextcloud server answered with error ${status}.`;
	}
	return 'Something went wrong. Try again.';
}
