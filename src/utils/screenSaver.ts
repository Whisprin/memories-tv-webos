import LS2Request from '@enact/webos/LS2Request';

const SERVICE = 'luna://com.webos.service.tvpower/power';
const CLIENT_NAME = 'com.wisp.memoriestv.slideshow';
const ignore = () => {};
// A refused call (for example denied by ACG enforcement, see appinfo.json requiredACG) used to
// pass silently; log it so it shows up in the Web Inspector.
const warn = (what: string) => (res: {errorCode?: unknown; errorText?: string}) =>
	console.warn(`[screenSaver] ${what} failed: ${res?.errorText ?? 'unknown error'} (${String(res?.errorCode ?? '')})`);

/**
 * Holds off the TV screen saver until the returned release function is called. webOS has no
 * public API for this: tvpower announces each upcoming activation (state 'Active') to
 * subscribers, and replying ack:false vetoes it. Undocumented, so a failure only logs a warning.
 */
export function holdScreenSaver(): () => void {
	if (typeof (window as {WebOSServiceBridge?: unknown}).WebOSServiceBridge !== 'function') return ignore;
	const subscription = new LS2Request().send({
		service: SERVICE,
		method: 'registerScreenSaverRequest',
		parameters: {clientName: CLIENT_NAME},
		subscribe: true,
		onSuccess: ({state, timestamp}: {state?: string; timestamp?: unknown}) => {
			if (state !== 'Active') return;
			new LS2Request().send({
				service: SERVICE,
				method: 'responseScreenSaverRequest',
				parameters: {clientName: CLIENT_NAME, ack: false, timestamp},
				onFailure: warn('responseScreenSaverRequest'),
			});
		},
		onFailure: warn('registerScreenSaverRequest'),
	});
	return () => subscription?.cancel();
}
