import LS2Request from '@enact/webos/LS2Request';

// Client for the app's own JS service (service/service.js, com.wisp.memoriestv.service).
// It does two things the web app can't:
// - loginFlowInit: starts Nextcloud Login Flow v2 with User-Agent "Memories TV", which
//   Nextcloud uses as the app password's name (fetch() can't set User-Agent).
// - mediaProxy: HTTP servers on 127.0.0.1 that add the Authorization header, so plain
//   <img src> / <video src> can load Memories media. Previews requested within a few ms
//   are batched into one multipreview upstream; video passes Range through for seeking.

const SERVICE = 'luna://com.wisp.memoriestv.service';
const CALL_TIMEOUT_MS = 20000;

export const hasHelperService = (): boolean =>
	typeof (window as {WebOSServiceBridge?: unknown}).WebOSServiceBridge === 'function';

interface LunaReply {
	returnValue?: boolean;
	errorCode?: string | number;
	errorText?: string;
}

export class HelperServiceError extends Error {
	readonly code?: string | number;

	constructor(message: string, code?: string | number) {
		super(message);
		this.name = 'HelperServiceError';
		this.code = code;
	}
}

function call<T extends LunaReply>(method: string, parameters: Record<string, unknown>): Promise<T> {
	return new Promise((resolve, reject) => {
		new LS2Request().send({
			service: SERVICE,
			method,
			parameters,
			timeout: CALL_TIMEOUT_MS,
			onSuccess: (res: T) => resolve(res),
			onFailure: (res: LunaReply) => reject(new HelperServiceError(res.errorText || 'Helper service call failed', res.errorCode)),
			onTimeout: () => reject(new HelperServiceError('The helper service did not respond')),
		});
	});
}

// ---------- Login Flow v2 ----------

export interface LoginFlowStart {
	poll: {token: string; endpoint: string};
	login: string;
}

// status 0 means the server couldn't be reached from the TV (error has the reason).
export interface LoginFlowInitReply extends LunaReply {
	status: number;
	body?: LoginFlowStart | null;
	error?: string;
}

export const loginFlowInit = (server: string): Promise<LoginFlowInitReply> => call('loginFlowInit', {server});

// ---------- Media proxy ----------

export interface ProxyCredentials {
	server: string;
	loginName: string;
	appPassword: string;
}

interface MediaProxyReply extends LunaReply {
	port: number;
	ports?: number[];
	token: string;
}

export interface MediaProxy {
	readonly ports: number[];
	readonly token: string;
	// URL for a path under /index.php/apps/memories/ (e.g. 'api/stream/123').
	memoriesUrl(path: string, shard?: number): string;
	// Batched preview. a=0 crops to x × y, a=1 keeps the aspect ratio within x × y.
	previewUrl(fileid: number, x: number, y: number, a: 0 | 1): string;
	stop(): void;
}

// Starts the proxy and keeps it alive (through the subscription) until stop() is called.
// Each file always maps to the same port, so its URL stays stable for the browser cache;
// spreading files over ports avoids the browser's 6-connections-per-host:port limit.
export function startMediaProxy(credentials: ProxyCredentials): Promise<MediaProxy> {
	return new Promise((resolve, reject) => {
		let settled = false;
		const request = new LS2Request().send({
			service: SERVICE,
			method: 'mediaProxy',
			parameters: {...credentials},
			subscribe: true,
			timeout: CALL_TIMEOUT_MS,
			onSuccess: (res: MediaProxyReply) => {
				if (settled || !res.port) return;
				settled = true;
				const ports = res.ports && res.ports.length ? res.ports : [res.port];
				const base = (shard: number) => `http://127.0.0.1:${ports[shard % ports.length]}/${res.token}`;
				resolve({
					ports,
					token: res.token,
					memoriesUrl: (path, shard = 0) => `${base(shard)}/memories/${path.replace(/^\/+/, '')}`,
					previewUrl: (fileid, x, y, a) => `${base(fileid)}/batch/preview/${fileid}?x=${x}&y=${y}&a=${a}`,
					stop: () => request?.cancel(),
				});
			},
			onFailure: (res: LunaReply) => {
				if (settled) return;
				settled = true;
				reject(new HelperServiceError(res.errorText || 'Could not start the media proxy', res.errorCode));
			},
			onTimeout: () => {
				if (settled) return;
				settled = true;
				request?.cancel();
				reject(new HelperServiceError('The helper service did not respond'));
			},
		});
	});
}
