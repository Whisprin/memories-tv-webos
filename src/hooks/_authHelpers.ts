import {APIError} from '../api/client';

const NETWORK_ERROR_MESSAGE =
	"Couldn't reach the server. Check the address, that the TV is online, and that the server uses a publicly trusted HTTPS certificate.";

export function makeAuthErrorMessage(error: unknown): string {
	if (error instanceof APIError) {
		if (error.status === 401) return 'The server rejected the sign-in. Please sign in again.';
		if (error.status === 404) return 'Nextcloud Memories was not found at this address. Check the address, including any subfolder.';
		if (error.status) return `Server returned ${error.status}`;
		if (!error.message.startsWith('Network error')) return error.message;
	}
	return NETWORK_ERROR_MESSAGE;
}
