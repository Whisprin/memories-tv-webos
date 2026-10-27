import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useWebOSKeys} from '../../hooks/useWebOSKeys';
import {useAutoHideControls} from '../../hooks/useAutoHideControls';
import {useAssetRotation} from '../../hooks/useAssetRotation';
import {useRepository} from '../../domain/RepositoryContext';
import {createSpotlightContainer, forceFocus, SpottableDiv} from '../../utils/spotlight';
import type {TimelineAsset} from '../../domain/types';
import {MediaControls, ACTION_BAR_SPOTLIGHT_ID} from './MediaControls';
import {InfoPanel} from './InfoPanel';
import {openInTvPhotoViewer, type TvPhoto} from '../../platform/tvPhotoViewer';
import {VideoPlayer, VideoPlayerApi} from './VideoPlayer';
import css from './MediaViewer.module.less';

interface MediaViewerProps {
	getAssetAt: (index: number) => TimelineAsset | null;
	totalCount: number;
	currentIndex: number;
	position: string;
	onClose: () => void;
	onNavigate: (direction: 'prev' | 'next') => void;
	onStartSlideshow: () => void;
}

const VIEWER_SPOTLIGHT_ID = 'media-viewer';
const STAGE_SPOTLIGHT_ID = 'media-viewer-stage';
// Trap Spotlight inside the viewer so D-pad can't reach the underlying rail/grid (which would
// trigger NavigationRail's focus-based expand and other surprises).
const ViewerContainer = createSpotlightContainer({enterTo: 'last-focused'});

// useWebOSKeys preventDefaults + stops propagation before calling the handler, so a no-op
// is enough to fully swallow a key (Spotlight never sees it → focus can't leak).
const swallowKey = () => {};
const focusStage = () => forceFocus(STAGE_SPOTLIGHT_ID);
const focusActionBar = () => forceFocus(ACTION_BAR_SPOTLIGHT_ID);
// How long a video's overlay (date, position, arrows, close) stays up when it opens; the same
// delay photos use before their controls fade.
const VIDEO_OVERLAY_INTRO_MS = 4000;
// Show in 4K hands over at most this many photos, so the player starts quickly.
const TV_VIEWER_MAX_PHOTOS = 50;
const TV_VIEWER_ERROR_MS = 4000;

export const MediaViewer: React.FC<MediaViewerProps> = React.memo(({getAssetAt, totalCount, currentIndex, position, onClose, onNavigate, onStartSlideshow}) => {
	const repository = useRepository();
	const asset = getAssetAt(currentIndex);

	const handlePrev = useCallback(() => {
		if (currentIndex > 0) onNavigate('prev');
	}, [onNavigate, currentIndex]);

	const handleNext = useCallback(() => {
		if (currentIndex < totalCount - 1) onNavigate('next');
	}, [onNavigate, currentIndex, totalCount]);

	const isVideo = asset?.type === 'VIDEO';

	const [actionBarFocused, setActionBarFocused] = useState(false);
	// The Info panel stays open while paging through photos (it follows the current one).
	const [infoOpen, setInfoOpen] = useState(false);
	const toggleInfo = useCallback(() => setInfoOpen((open) => !open), []);
	const showInfo = infoOpen && !isVideo;

	// Show in 4K: this photo and the ones after it go to the TV's Media Player, which pages
	// through them itself. Videos are left out.
	const [tvViewerFailed, setTvViewerFailed] = useState(false);
	const showIn4K = useCallback(() => {
		const photos: TvPhoto[] = [];
		for (let i = currentIndex; i < totalCount && photos.length < TV_VIEWER_MAX_PHOTOS; i++) {
			const item = getAssetAt(i);
			if (!item) break; // not loaded yet
			if (item.type === 'VIDEO') continue;
			photos.push({url: repository.fullResolutionUrl(item), fileName: item.fileName ?? `${item.id}.jpg`});
		}
		if (photos.length === 0) return;
		openInTvPhotoViewer(photos).catch((error: unknown) => {
			console.warn('[MediaViewer] could not open the TV photo viewer', error);
			setTvViewerFailed(true);
		});
	}, [currentIndex, totalCount, getAssetAt, repository]);
	useEffect(() => {
		if (!tvViewerFailed) return undefined;
		const timer = window.setTimeout(() => setTvViewerFailed(false), TV_VIEWER_ERROR_MS);
		return () => window.clearTimeout(timer);
	}, [tvViewerFailed]);
	const [rotation, rotate] = useAssetRotation(isVideo ? undefined : asset?.id);
	const controlsRef = useRef<HTMLDivElement>(null);

	// Auto-hide here is for still images. Videos can't use it: while hidden it swallows OK, which
	// Sandstone VideoPlayer needs for play/pause and its transport bar. A video's overlay instead
	// follows that bar (see videoOverlayVisible below).
	const {visible: controlsVisible, show: showControls, hide: hideControls} = useAutoHideControls({enabled: !isVideo, controlsRef});
	const inActionBar = !isVideo && controlsVisible && actionBarFocused;

	// The bar faded out under an idle focus: hand it back to the stage rather than leave it on
	// a hidden button.
	useEffect(() => {
		if (!controlsVisible && actionBarFocused) focusStage();
	}, [controlsVisible, actionBarFocused]);

	// Sandstone transport-bar visibility (video) drives arrow-key semantics: hidden →
	// left/right page between media; visible → Sandstone seeks.
	const playerApiRef = useRef<VideoPlayerApi | null>(null);
	const [videoControlsVisible, setVideoControlsVisible] = useState(false);
	// Sandstone bug: forwardCustom drops the documented {available} payload, so read the
	// current state through the imperative API instead (fires post-update, value is fresh).
	const handleVideoControlsAvailable = useCallback(({available}: {available?: boolean}) => {
		setVideoControlsVisible(available ?? playerApiRef.current?.areControlsVisible() ?? false);
	}, []);

	// Reset on media change: Sandstone doesn't notify when the player unmounts (video →
	// photo), which would leave the state stuck on "visible". State adjustment during
	// render, not in an effect (`react-hooks/set-state-in-effect`, Enact CI strict).
	const [prevAssetId, setPrevAssetId] = useState(asset?.id);
	const [videoIntro, setVideoIntro] = useState(true);
	if (asset?.id !== prevAssetId) {
		setPrevAssetId(asset?.id);
		setVideoControlsVisible(false);
		setVideoIntro(true);
		// The bar may unmount (photo → video) without a blur reaching us.
		setActionBarFocused(false);
	}
	const videoControlsOpen = isVideo && videoControlsVisible;

	// A video's overlay shows briefly when it opens, then only while Sandstone's transport bar
	// is up (OK, Down or the pointer bring it back), so it hides during playback like photos do.
	useEffect(() => {
		if (!isVideo) return undefined;
		const timer = window.setTimeout(() => setVideoIntro(false), VIDEO_OVERLAY_INTRO_MS);
		return () => window.clearTimeout(timer);
	}, [isVideo, asset?.id]);
	const videoOverlayVisible = videoControlsOpen || videoIntro;

	// Back closes the transport bar if open, the viewer otherwise. Our Back bridge
	// (capture + stopImmediatePropagation) preempts Sandstone's Cancelable, so the
	// two-step behavior has to be restored here.
	const handleBack = useCallback(() => {
		if (showInfo) {
			setInfoOpen(false);
			return;
		}
		if (videoControlsOpen && playerApiRef.current) {
			playerApiRef.current.hideControls();
			return;
		}
		onClose();
	}, [showInfo, videoControlsOpen, onClose]);

	useWebOSKeys({
		onBack: handleBack,
		// Left/right page between media, except inside the action bar (Spotlight moves between
		// its buttons) and while the video transport bar is open (Sandstone seeks).
		onArrowLeft: videoControlsOpen || inActionBar ? undefined : handlePrev,
		onArrowRight: videoControlsOpen || inActionBar ? undefined : handleNext,
		// Up/down must never reach Spotlight unhandled, or it leaks focus to the grid behind the
		// overlay. Unassigned here, they are reveal keys (useAutoHideControls) or belong to the
		// Sandstone video bar.
		onArrowUp: isVideo ? (videoControlsOpen ? undefined : swallowKey) : inActionBar ? focusStage : controlsVisible ? swallowKey : undefined,
		onArrowDown: isVideo ? undefined : inActionBar ? swallowKey : controlsVisible ? focusActionBar : undefined,
	});

	// Photos rest focus on the stage; forcing it also pulls focus off the grid card behind the
	// overlay when the viewer was opened with the pointer.
	useEffect(() => {
		forceFocus(isVideo ? VIEWER_SPOTLIGHT_ID : STAGE_SPOTLIGHT_ID);
	}, [isVideo]);

	const handleStageClick = controlsVisible ? hideControls : showControls;

	useEffect(() => {
		const prefetch = (index: number) => {
			const neighbor = getAssetAt(index);
			if (!neighbor || neighbor.type === 'VIDEO') return;
			const img = new Image();
			img.src = repository.previewUrl(neighbor.id);
		};
		prefetch(currentIndex - 1);
		prefetch(currentIndex + 1);
	}, [currentIndex, getAssetAt, repository]);

	if (!asset) return null;

	const mediaUrl = isVideo ? repository.videoPlaybackUrl(asset.id) : repository.previewUrl(asset.id);

	return (
		<ViewerContainer spotlightId={VIEWER_SPOTLIGHT_ID} spotlightRestrict="self-only" className={css.viewerOverlay}>
			<div className={css.viewerContent}>
				{isVideo ? (
					<VideoPlayer src={mediaUrl} onControlsAvailable={handleVideoControlsAvailable} apiRef={playerApiRef} />
				) : (
					<img
						src={mediaUrl}
						alt=""
						className={rotation % 180 ? `${css.photo} ${css.quarterTurn}` : css.photo}
						style={rotation ? {transform: `rotate(${rotation}deg)`} : undefined}
					/>
				)}
			</div>
			{!isVideo && <SpottableDiv spotlightId={STAGE_SPOTLIGHT_ID} className={css.stage} onClick={handleStageClick} />}
			{showInfo && <InfoPanel asset={asset} />}
			{tvViewerFailed && (
				<div className={css.notice} role="status">
					Couldn&apos;t open the TV&apos;s photo viewer.
				</div>
			)}
			<MediaControls
				rootRef={controlsRef}
				asset={asset}
				position={position}
				isVideo={isVideo}
				controlsVisible={isVideo ? videoOverlayVisible : controlsVisible}
				canGoPrev={currentIndex > 0}
				canGoNext={currentIndex < totalCount - 1}
				onPrev={handlePrev}
				onNext={handleNext}
				onClose={onClose}
				onRotate={rotate}
				onStartSlideshow={onStartSlideshow}
				infoOpen={showInfo}
				onToggleInfo={toggleInfo}
				onShowIn4K={showIn4K}
				onActionBarFocusChange={setActionBarFocused}
			/>
		</ViewerContainer>
	);
});

MediaViewer.displayName = 'MediaViewer';
