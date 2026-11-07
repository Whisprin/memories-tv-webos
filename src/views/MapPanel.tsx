import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {MutableRefObject} from 'react';
import Spotlight from '@enact/spotlight';
import ri from '@enact/ui/resolution';
import {MapView, type MapViewState} from '../components/MapView/MapView';
import {QueryStateView} from '../components/QueryStateView';
import {TimelineGrid} from '../components/TimelineGrid/TimelineGrid';
import {useRepository} from '../domain/RepositoryContext';
import {useRepositoryQuery} from '../hooks/queryConfig';
import {useMapClusters} from '../hooks/useMapClusters';
import {timelineScopeKey, useTimeline} from '../hooks/useTimeline';
import {GRID_INSET_LEFT_PX, NAVIGATION_RAIL_ID} from '../utils/constants';
import {formatCount} from '../utils/FormattingService';
import {boundsKey, NEWEST_PHOTO_ZOOM, snapBounds, WORLD_VIEW} from '../utils/mapGeometry';
import {getSavedMapView, saveMapView, useMapStyle} from '../utils/mapViewStore';
import {createSpotlightContainer, forceFocus} from '../utils/spotlight';
import type {MapCluster, TimelineScope} from '../domain/types';
import type {RoutePanelProps} from '../types/navigation';
import css from './MapPanel.module.less';

// DOM id of the focusable map (a selector for Spotlight), and the Spotlight id of the timeline side.
const MAP_ID = 'map-canvas';
const TIMELINE_ID = 'map-timeline';
// Share of the content width the map takes; the timeline gets the rest.
const MAP_SHARE = 0.55;
// The timeline and markers follow the map this long after it stops moving.
const VIEW_SETTLE_MS = 400;
const NO_CLUSTERS: MapCluster[] = [];
// What the remote keys do, shown in the header for the side that has focus; none while focus is
// outside the map tab (e.g. on the rail).
const MAP_KEYS = [
	{key: 'OK', action: 'Go to photos'},
	{key: 'CH +/−', action: 'Zoom'},
	{key: 'Back', action: 'Leave map'},
];
const PHOTO_KEYS = [
	{key: 'OK', action: 'Open photo'},
	{key: 'Back', action: 'Back to map'},
];

const TimelineContainer = createSpotlightContainer({enterTo: 'last-focused'});

type FocusSide = 'map' | 'timeline' | 'other';

export interface MapPanelProps extends RoutePanelProps {
	accountId: string | null;
	// AppLayout calls this on Back before leaving the tab; true means it was handled here.
	backHandlerRef?: MutableRefObject<(() => boolean) | null>;
}

/**
 * Memories' map view: the map on the left, and on the right a timeline of the photos inside the
 * visible area, following the map. On the map the arrows pan and OK moves focus to the timeline;
 * Back on the timeline returns to the map, Back on the map goes to the rail.
 */
const MapPanel: React.FC<MapPanelProps> = ({contentWidth, accountId, backHandlerRef}) => {
	const repository = useRepository();
	const timelineSideRef = useRef<HTMLDivElement>(null);

	// Set in Settings.
	const [style] = useMapStyle();
	const tiles = useMemo(() => repository.mapTiles(style), [repository, style]);

	// Start at the last view, else at the newest photo with a location, else the whole world.
	const [savedView] = useState(() => getSavedMapView(accountId));
	const init = useRepositoryQuery(['map-init'], (r) => r.getMapInit(), {staleTime: Infinity, gcTime: Infinity});
	const newest = init.data ?? null;
	const initialView = savedView ?? (init.isPending ? null : newest ? {lat: newest.lat, lon: newest.lon, zoom: NEWEST_PHOTO_ZOOM} : WORLD_VIEW);

	// The view the timeline and markers follow, once the map has settled.
	const [view, setView] = useState<MapViewState | null>(null);
	const settleTimer = useRef(0);
	const handleViewChange = useCallback(
		(state: MapViewState) => {
			window.clearTimeout(settleTimer.current);
			settleTimer.current = window.setTimeout(() => {
				setView(state);
				saveMapView(accountId, {lat: state.center.lat, lon: state.center.lon, zoom: state.zoom});
			}, VIEW_SETTLE_MS);
		},
		[accountId]
	);
	useEffect(() => () => window.clearTimeout(settleTimer.current), []);

	const clusters = useMapClusters(view?.bounds ?? null, view?.zoom ?? 0).data ?? NO_CLUSTERS;

	// The timeline of the visible area (snapped to Memories' grid, so small pans keep it). The
	// previous area's timeline stays on screen until the new area's days have loaded, so the
	// right side never flashes empty.
	const area = view ? snapBounds(view.bounds, view.zoom) : null;
	const areaKey = area ? boundsKey(area) : '';
	// eslint-disable-next-line react-hooks/exhaustive-deps -- identity follows the area
	const pendingScope = useMemo<TimelineScope | null>(() => (area ? {mapBounds: area} : null), [areaKey]);
	const pendingKey = pendingScope ? timelineScopeKey(pendingScope) : '';
	const pending = useRepositoryQuery(['timeline-buckets', pendingKey], (r) => r.getBuckets(pendingScope!), {
		enabled: !!pendingScope,
		staleTime: 10 * 60 * 1000,
		gcTime: 30 * 60 * 1000,
	});
	const [shownScope, setShownScope] = useState<TimelineScope | null>(null);
	if (pendingScope && shownScope !== pendingScope && !pending.isFetching && (pending.isSuccess || pending.isError)) {
		setShownScope(pendingScope);
	}
	const shownKey = shownScope ? timelineScopeKey(shownScope) : '';
	const {timeline, isLoading, isError, error} = useTimeline(shownScope);
	const total = useMemo(() => timeline.allBuckets.reduce((sum, b) => sum + b.count, 0), [timeline.allBuckets]);

	// Which side has focus: the other side is dimmed.
	const [side, setSide] = useState<FocusSide>('other');
	useEffect(() => {
		const handleFocusIn = (event: FocusEvent) => {
			const target = event.target as Node | null;
			const map = document.getElementById(MAP_ID);
			setSide(map && target && map.contains(target) ? 'map' : timelineSideRef.current?.contains(target) ? 'timeline' : 'other');
		};
		window.addEventListener('focusin', handleFocusIn);
		return () => window.removeEventListener('focusin', handleFocusIn);
	}, []);

	const focusTimeline = useCallback(() => forceFocus(TIMELINE_ID), []);

	// Back: timeline → map → rail; anywhere else AppLayout goes back to the Timeline tab.
	useEffect(() => {
		if (!backHandlerRef) return undefined;
		backHandlerRef.current = () => {
			const focused = document.activeElement;
			const map = document.getElementById(MAP_ID);
			if (focused && timelineSideRef.current?.contains(focused)) {
				forceFocus(`#${MAP_ID}`);
				return true;
			}
			if (focused && map?.contains(focused)) {
				Spotlight.setPointerMode(false);
				Spotlight.focus(`#${NAVIGATION_RAIL_ID}`);
				return true;
			}
			return false;
		};
		return () => {
			backHandlerRef.current = null;
		};
	}, [backHandlerRef]);

	const mapWidth = Math.round(contentWidth * MAP_SHARE);
	const timelineWidth = contentWidth - mapWidth;

	if (init.isSuccess && newest === null) {
		return (
			<QueryStateView isLoading={false} error={null} isEmpty emptyText="No photos with a location yet.">
				{null}
			</QueryStateView>
		);
	}

	return (
		<div className={css.panel}>
			<div className={css.header} style={{paddingLeft: ri.scale(GRID_INSET_LEFT_PX)}}>
				<span className={css.title}>Map</span>
				{shownScope && !isLoading && <span className={css.count}>{formatCount(total, 'photo')} in this area</span>}
				{side !== 'other' && (
					<ul className={css.keys} aria-label="Remote keys">
						{(side === 'timeline' ? PHOTO_KEYS : MAP_KEYS).map(({key, action}) => (
							<li key={key} className={css.keyHelp}>
								<span className={css.keyCap}>{key}</span>
								{action}
							</li>
						))}
					</ul>
				)}
			</div>
			<div className={css.split}>
				<div className={[css.mapSide, side === 'timeline' ? css.dim : ''].filter(Boolean).join(' ')} style={{width: mapWidth, paddingLeft: ri.scale(GRID_INSET_LEFT_PX)}}>
					<QueryStateView isLoading={!initialView} error={!initialView && init.isError ? init.error : null} loadingText="Loading the map…">
						{initialView && (
							<MapView
								id={MAP_ID}
								tiles={tiles}
								dimmed={style === 'osm-dimmed'}
								initialView={initialView}
								clusters={clusters}
								focused={side === 'map'}
								onViewChange={handleViewChange}
								onSelect={focusTimeline}
							/>
						)}
					</QueryStateView>
				</div>
				<div ref={timelineSideRef} className={[css.timelineSide, side === 'map' ? css.dim : ''].filter(Boolean).join(' ')} style={{width: timelineWidth}}>
					<TimelineContainer spotlightId={TIMELINE_ID} className={css.timelineContainer}>
						<QueryStateView
							isLoading={!shownScope || isLoading}
							error={isError ? error : null}
							isEmpty={!!shownScope && timeline.allBuckets.length === 0}
							loadingText="Loading photos…"
							emptyText="No photos in this area. Move the map or zoom out."
						>
							<TimelineGrid key={shownKey} contentWidth={timelineWidth} timeline={timeline} leftEdgeSpotlightId={`#${MAP_ID}`} />
						</QueryStateView>
					</TimelineContainer>
				</div>
			</div>
		</div>
	);
};

export default MapPanel;
