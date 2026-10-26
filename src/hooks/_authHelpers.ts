import {APIError} from '../api/client';
import {presentError} from '../utils/presentError';

const NETWORK_ERROR_MESSAGE =
	"Couldn't reach the server. Check the address, that the TV is online, and that the server uses a publicly trusted HTTPS certificate.";

// Messages while signing in, where a wrong address is the likeliest cause.
export function makeAuthErrorMessage(error: unknown): string {
	if (error instanceof APIError) {
		if (error.status === 401) return 'The server rejected the sign-in. Please sign in again.';
		if (error.status === 404) return 'Nextcloud Memories was not found at this address. Check the address, including any subfolder.';
		if (error.status) return presentError(error);
		if (!error.message.startsWith('Network error')) return error.message;
		if (typeof navigator !== 'undefined' && navigator.onLine === false) return presentError(error);
	}
	return NETWORK_ERROR_MESSAGE;
}

// Messages when a signed-in account can't connect at startup. The address worked before,
// so the server or the network is the likelier cause.
export function makeConnectErrorMessage(error: unknown): string {
	if (error instanceof APIError && error.status === 404) {
		return "Nextcloud wasn't found at this address any more. If the server moved, remove this account in Accounts and sign in again.";
	}
	return presentError(error);
}
