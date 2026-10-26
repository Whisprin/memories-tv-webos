export class APIError extends Error {
	public status?: number;

	constructor(message: string, status?: number) {
		super(message);
		this.name = 'APIError';
		this.status = status;
	}
}

// An account's connection to Nextcloud: the server's base URL (with any subfolder, no
// trailing slash) and an app password from Login Flow v2.
export interface NextcloudCredentials {
	baseUrl: string;
	loginName: string;
	appPassword: string;
}

const REQUEST_TIMEOUT_MS = 15000;
export const TIMEOUT_REASON = 'The server took too long to answer';

// "cloud.example.com/" → "https://cloud.example.com"
// "https://example.com/nextcloud/index.php/apps/memories/" → "https://example.com/nextcloud"
export function normalizeServerUrl(raw: string): string {
	let s = raw.trim();
	if (!s || /^https?:\/\/?$/i.test(s)) throw new Error('Enter your Nextcloud address.');
	if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
	let u: URL;
	try {
		u = new URL(s);
	} catch {
		throw new Error("That doesn't look like a web address.");
	}
	const path = u.pathname
		.replace(/\/+$/, '')
		.replace(/\/(index\.php\/)?apps\/memories(\/.*)?$/, '')
		.replace(/\/index\.php$/, '')
		.replace(/\/+$/, '');
	return u.origin + path;
}

// btoa only takes Latin-1; login names can be any UTF-8.
const base64 = (s: string): string => btoa(unescape(encodeURIComponent(s)));

// fetch with a timeout that also honours a caller's AbortSignal. Network, TLS and timeout
// failures become APIError without a status; HTTP errors become APIError with the status.
export async function request(url: string, options: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
	const controller = new AbortController();
	const outer = options.signal;
	const onOuterAbort = () => controller.abort();
	if (outer) {
		if (outer.aborted) controller.abort();
		else outer.addEventListener('abort', onOuterAbort);
	}
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(url, {...options, signal: controller.signal});
	} catch (error) {
		if (outer?.aborted) throw error; // caller cancelled: let it propagate as an abort
		const reason = controller.signal.aborted ? TIMEOUT_REASON : error instanceof Error ? error.message : 'Unknown error';
		throw new APIError(`Network error: ${reason}`);
	} finally {
		clearTimeout(timer);
		outer?.removeEventListener('abort', onOuterAbort);
	}
}

export class NextcloudClient {
	readonly credentials: NextcloudCredentials;

	constructor(credentials: NextcloudCredentials) {
		this.credentials = credentials;
	}

	get baseUrl(): string {
		return this.credentials.baseUrl;
	}

	// Basic auth with the app password plus OCS-APIRequest passes Nextcloud's CSRF check
	// on every route, without cookies.
	authHeaders(): Record<string, string> {
		const {loginName, appPassword} = this.credentials;
		return {
			Authorization: `Basic ${base64(`${loginName}:${appPassword}`)}`,
			'OCS-APIRequest': 'true',
			Accept: 'application/json',
		};
	}

	// path is relative to the server root, e.g. '/ocs/v2.php/cloud/user?format=json'.
	async fetch<T>(path: string, options: RequestInit = {}, timeoutMs?: number): Promise<T> {
		const url = `${this.baseUrl}${path}`;
		const headers: Record<string, string> = {...this.authHeaders()};
		if (options.body) headers['Content-Type'] = 'application/json';
		const response = await request(url, {...options, headers: {...headers, ...(options.headers as Record<string, string> | undefined)}}, timeoutMs);
		if (!response.ok) {
			console.error(`[API] ${options.method || 'GET'} ${url} failed with ${response.status}`);
			throw new APIError(`API request failed: ${response.status}`, response.status);
		}
		const text = await response.text();
		return text ? (JSON.parse(text) as T) : ({} as T);
	}

	// Memories API, e.g. memories('/days').
	memories<T>(path: string, options: RequestInit = {}, timeoutMs?: number): Promise<T> {
		return this.fetch<T>(`/index.php/apps/memories/api${path}`, options, timeoutMs);
	}
}
