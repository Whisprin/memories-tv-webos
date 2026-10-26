import {APIError, NextcloudClient, request, type NextcloudCredentials} from './client';
import {hasHelperService, HelperServiceError, loginFlowInit as loginFlowInitViaService, type LoginFlowStart} from '../platform/helperService';

// Nextcloud Login Flow v2 (https://docs.nextcloud.com/server/latest/developer_manual/client_apis/LoginFlow/):
// the user signs in on their phone, so no password is ever typed on the TV and 2FA/SSO work.

export type {LoginFlowStart};

export interface MemoriesInfo {
	version: string;
	baseUrl?: string;
	loginFlowUrl?: string;
	uid?: string | null;
}

export interface LoginFlowResult {
	server: string;
	loginName: string;
	appPassword: string;
}

export interface NextcloudUser {
	id: string;
	displayName: string;
}

// Public. Confirms the server answers and that Memories is installed.
export async function describeMemories(baseUrl: string): Promise<MemoriesInfo> {
	const url = `${baseUrl}/index.php/apps/memories/api/describe`;
	const response = await request(url);
	if (!response.ok) throw new APIError(`Memories not found (${response.status})`, response.status);
	const info = (await response.json()) as MemoriesInfo;
	if (!info || !info.version) throw new APIError('Memories is not installed or not enabled on this server.');
	return info;
}

// Starts the flow. On the TV the helper service sends this request so it carries
// User-Agent "Memories TV", which Nextcloud uses as the app password's name. Without the
// service (desktop browser) or if it can't be reached, plain fetch is used instead.
export async function startLoginFlow(baseUrl: string): Promise<LoginFlowStart> {
	const viaFetch = async () => {
		const response = await request(`${baseUrl}/index.php/login/v2`, {method: 'POST'});
		if (!response.ok) throw new APIError(`Login flow failed (${response.status})`, response.status);
		return (await response.json()) as LoginFlowStart;
	};
	if (!hasHelperService()) return viaFetch();
	try {
		const reply = await loginFlowInitViaService(baseUrl);
		if (reply.status === 0) throw new APIError(`Network error: ${reply.error ?? 'server unreachable'}`);
		if (reply.status !== 200 || !reply.body) throw new APIError(`Login flow failed (${reply.status})`, reply.status);
		return reply.body;
	} catch (error) {
		if (!(error instanceof HelperServiceError)) throw error;
		console.warn('[nextcloudAuth] helper service unavailable, starting the login flow with fetch:', error.message);
		return viaFetch();
	}
}

// Resolves null while the user hasn't approved yet (404), then once with the credentials.
// Polls the address the TV already reached instead of poll.endpoint, which Nextcloud builds
// from overwrite.cli.url and may name a host the TV can't reach.
export async function pollLoginFlow(baseUrl: string, token: string, signal?: AbortSignal): Promise<LoginFlowResult | null> {
	const response = await request(`${baseUrl}/index.php/login/v2/poll`, {
		method: 'POST',
		headers: {'Content-Type': 'application/x-www-form-urlencoded'},
		body: `token=${encodeURIComponent(token)}`,
		signal,
	});
	if (response.status === 404) return null;
	if (!response.ok) throw new APIError(`Login poll failed (${response.status})`, response.status);
	return (await response.json()) as LoginFlowResult;
}

export async function getUser(credentials: NextcloudCredentials): Promise<NextcloudUser> {
	const data = await new NextcloudClient(credentials).fetch<{ocs: {data: {id: string; displayname?: string}}}>('/ocs/v2.php/cloud/user?format=json');
	return {id: data.ocs.data.id, displayName: data.ocs.data.displayname || data.ocs.data.id};
}

// Deletes the app password on the server. A 401 means it is already gone.
export async function revokeAppPassword(credentials: NextcloudCredentials): Promise<void> {
	try {
		await new NextcloudClient(credentials).fetch('/ocs/v2.php/core/apppassword', {method: 'DELETE'});
	} catch (error) {
		if (error instanceof APIError && error.status === 401) return;
		throw error;
	}
}
