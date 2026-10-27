import LS2Request from '@enact/webos/LS2Request';

// The TV's own Media Player (webOS 6 and newer). Unlike this web app, which webOS draws at
// 1920x1080 on UHD panels, it shows photos at the panel's full resolution.
const MEDIA_PLAYER_ID = 'com.webos.app.mediadiscovery';
const CALL_TIMEOUT_MS = 8000;

export interface TvPhoto {
	url: string;
	fileName: string;
}

interface LunaReply {
	returnValue?: boolean;
	errorText?: string;
}

// The launch payload the player understands for media URLs (one entry per photo; it pages
// through them with its own arrow keys). Needs the application.launcher ACG.
const payloadItem = ({url, fileName}: TvPhoto) => ({
	fullPath: url,
	fileName,
	mediaType: 'IMAGE',
	deviceType: 'DMR',
	lastPlayPosition: -1,
	thumbnail: '',
	artist: '',
	album: '',
	subtitle: '',
	dlnaInfo: {flagVal: 4096, cleartextSize: '-1', contentLength: '-1', opVal: 1, protocolInfo: 'http-get:*:image/jpeg:*', duration: 0},
});

// Opens the photos in the TV's Media Player, starting with the first. Back in the player
// returns to this app.
export function openInTvPhotoViewer(photos: TvPhoto[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const fail = (text: string) => reject(new Error(text));
		new LS2Request().send({
			service: 'luna://com.webos.applicationManager',
			method: 'launch',
			parameters: {id: MEDIA_PLAYER_ID, params: {payload: photos.map(payloadItem)}},
			timeout: CALL_TIMEOUT_MS,
			onSuccess: (res: LunaReply) => (res.returnValue === false ? fail(res.errorText ?? 'launch failed') : resolve()),
			onFailure: (res: LunaReply) => fail(res.errorText ?? 'launch failed'),
			onTimeout: () => fail('The TV did not answer'),
		});
	});
}
