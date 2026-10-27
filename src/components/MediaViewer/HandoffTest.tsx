// TEST (feature/tv-photo-viewer): probe whether the TV's own photo viewer can show a photo
// at full 4K. Not for release: it lists which built-in viewer apps exist, launches them with
// several image sources and payload shapes, and logs every reply on screen.
import React, {useCallback, useEffect, useState} from 'react';
import Button from '@enact/sandstone/Button';
import LS2Request from '@enact/webos/LS2Request';
import {useRepository} from '../../domain/RepositoryContext';
import {useWebOSKeys} from '../../hooks/useWebOSKeys';
import {createSpotlightContainer, forceFocus} from '../../utils/spotlight';
import type {TimelineAsset} from '../../domain/types';
import css from './HandoffTest.module.less';

// Built-in media viewers by webOS version (mediadiscovery: webOS 6+, photovideo: 3–5,
// smartshare: 1–2); the others are guesses worth a check.
const CANDIDATE_APPS = [
	'com.webos.app.mediadiscovery',
	'com.webos.app.photovideo',
	'com.webos.app.photoviewer',
	'com.webos.app.imageviewer',
	'com.webos.app.smartshare',
];

const Container = createSpotlightContainer({enterTo: 'last-focused'});
const PANEL_ID = 'handoff-test';

type Shape = 'payload' | 'target';

interface LunaReply {
	returnValue?: boolean;
	errorCode?: number | string;
	errorText?: string;
	[key: string]: unknown;
}

const call = (service: string, method: string, parameters: object): Promise<LunaReply> =>
	new Promise((resolve) => {
		new LS2Request().send({
			service,
			method,
			parameters,
			timeout: 8000,
			onSuccess: (res: LunaReply) => resolve(res),
			onFailure: (res: LunaReply) => resolve(res),
			onTimeout: () => resolve({returnValue: false, errorText: 'timeout'}),
		});
	});

const fileName = (url: string) => decodeURIComponent(url.split('?')[0]!.split('/').pop() || 'image');

// The media player's known launch payload (seen for video), with mediaType IMAGE. 'target' is
// the shape some remote-control libraries use for media.viewer.
const launchParams = (shape: Shape, url: string, mime: string) =>
	shape === 'payload'
		? {
				payload: [
					{
						fullPath: url,
						fileName: fileName(url),
						mediaType: 'IMAGE',
						deviceType: 'DMR',
						lastPlayPosition: -1,
						thumbnail: '',
						artist: '',
						album: '',
						subtitle: '',
						dlnaInfo: {flagVal: 4096, cleartextSize: '-1', contentLength: '-1', opVal: 1, protocolInfo: `http-get:*:${mime}:*`, duration: 0},
					},
				],
			}
		: {target: url, mimeType: mime, title: fileName(url)};

const stamp = (line: string) => `${new Date().toLocaleTimeString('en-GB')}  ${line}`;

interface LaunchButtonProps {
	appId: string;
	source: {label: string; url: string; mime: string};
	onLaunch: (appId: string, url: string, mime: string, label: string) => void;
}

const LaunchButton: React.FC<LaunchButtonProps> = ({appId, source, onLaunch}) => {
	const handleClick = useCallback(() => onLaunch(appId, source.url, source.mime, source.label), [appId, source, onLaunch]);
	return (
		<Button size="small" className={css.launch} onClick={handleClick}>
			{appId.replace('com.webos.app.', '')}: {source.label}
		</Button>
	);
};

export const HandoffTest: React.FC<{asset: TimelineAsset; onClose: () => void}> = ({asset, onClose}) => {
	const repository = useRepository();
	const sources = repository.handoffSources?.(asset.id) ?? [];
	const pattern = sources.find((s) => s.url.startsWith('http') && s.label.startsWith('Pattern'));
	const [apps, setApps] = useState<Record<string, string>>({});
	const [shape, setShape] = useState<Shape>('payload');
	const [log, setLog] = useState<string[]>(() => [
		stamp(`screen ${window.screen.width}×${window.screen.height}, window ${window.innerWidth}×${window.innerHeight}, dpr ${window.devicePixelRatio}`),
	]);
	const [showPattern, setShowPattern] = useState(false);

	const addLog = useCallback((line: string) => {
		console.log('[handoff]', line);
		setLog((l) => [stamp(line), ...l].slice(0, 14));
	}, []);

	const openPattern = useCallback(() => setShowPattern(true), []);
	const closePattern = useCallback(() => setShowPattern(false), []);
	const toggleShape = useCallback(() => setShape((s) => (s === 'payload' ? 'target' : 'payload')), []);
	useWebOSKeys({onBack: showPattern ? closePattern : onClose});

	// Pull focus into the panel (and back into it after the pattern closes).
	useEffect(() => {
		if (!showPattern) forceFocus(PANEL_ID);
	}, [showPattern]);

	useEffect(() => {
		CANDIDATE_APPS.forEach((id) => {
			void call('luna://com.webos.applicationManager', 'getAppLoadStatus', {appId: id}).then((res) => {
				const status = res.returnValue === false ? `error: ${res.errorText ?? res.errorCode}` : res.exist ? 'installed' : 'not installed';
				setApps((a) => ({...a, [id]: status}));
			});
		});
	}, []);

	const launch = useCallback(
		(appId: string, url: string, mime: string, label: string) => {
			addLog(`launch ${appId.replace('com.webos.app.', '')} · ${label} · ${shape}`);
			void call('luna://com.webos.applicationManager', 'launch', {id: appId, params: launchParams(shape, url, mime)}).then((res) =>
				addLog(`  → ${JSON.stringify(res).slice(0, 160)}`)
			);
		},
		[addLog, shape]
	);

	const installed = CANDIDATE_APPS.filter((id) => apps[id] === 'installed');
	// If the query itself is refused, still offer the documented viewers.
	const targets = installed.length > 0 ? installed : CANDIDATE_APPS.slice(0, 2);

	if (showPattern && pattern) {
		return <img src={pattern.url} alt="" className={css.patternInApp} />;
	}

	return (
		<Container spotlightId={PANEL_ID} className={css.panel} spotlightRestrict="self-only" aria-modal="true">
			<h2 className={css.title}>TV photo viewer test</h2>
			<div className={css.columns}>
				<div className={css.column}>
					<div className={css.label}>Viewer apps</div>
					{CANDIDATE_APPS.map((id) => (
						<div key={id} className={css.mono}>
							{id.replace('com.webos.app.', '')}: {apps[id] ?? '…'}
						</div>
					))}
					<div className={css.label}>Payload shape</div>
					<Button size="small" onClick={toggleShape}>
						{shape === 'payload' ? 'payload [fullPath, IMAGE]' : 'target + mimeType'}
					</Button>
					<div className={css.label}>Compare</div>
					<Button size="small" disabled={!pattern} onClick={openPattern}>
						Pattern in this app
					</Button>
				</div>
				<div className={css.column}>
					<div className={css.label}>Launch</div>
					{targets.map((appId) =>
						sources.map((s) => <LaunchButton key={`${appId}${s.label}`} appId={appId} source={s} onLaunch={launch} />)
					)}
					{sources.length === 0 && <div className={css.mono}>No sources: the helper service is not running (desktop browser?).</div>}
				</div>
			</div>
			<div className={css.label}>Log</div>
			<div className={css.log}>
				{log.map((l, i) => (
					<div key={i}>{l}</div>
				))}
			</div>
		</Container>
	);
};
