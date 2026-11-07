import React, {useEffect, useRef} from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Spotlight from '@enact/spotlight';
import ri from '@enact/ui/resolution';
import {SpottableDiv} from '../../utils/spotlight';
import {HOLD_DELAY_MS, holdOffset, MAX_LAT, MAX_ZOOM, MIN_ZOOM, tapOffset, type PanDirection} from '../../utils/mapGeometry';
import type {MapBounds, MapCluster, MapPosition, MapTileSource} from '../../domain/types';
import css from './MapView.module.less';

export interface MapViewState {
	bounds: MapBounds;
	zoom: number;
	center: MapPosition;
}

interface MapViewProps {
	// DOM id of the focusable map, for Spotlight
	id: string;
	tiles: MapTileSource;
	dimmed: boolean;
	initialView: {lat: number; lon: number; zoom: number};
	clusters: MapCluster[];
	// the map has focus: show the crosshair
	focused: boolean;
	onViewChange: (state: MapViewState) => void;
	// OK pressed on the map
	onSelect: () => void;
}

const KEY_DIRECTIONS: Record<number, PanDirection> = {37: 'left', 38: 'up', 39: 'right', 40: 'down'};
const KEY_ENTER = 13;
// CH ▲ / CH ▼ on the remote; + and - for development in a desktop browser
const ZOOM_IN_KEYS = new Set([33, 107, 187]);
const ZOOM_OUT_KEYS = new Set([34, 109, 189]);
// A held key repeats; without repeats for this long the key counts as released (a lost keyup).
const RELEASE_TIMEOUT_MS = 600;
// 4K-space px, like the LESS (ri.scale halves them at FHD)
const MARKER_SIZE_PX = 168;

const escapeAttr = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const formatBadge = (count: number): string => (count >= 10000 ? `${Math.floor(count / 1000)}k` : count.toLocaleString());

function markerIcon(cluster: MapCluster): L.DivIcon {
	const size = ri.scale(MARKER_SIZE_PX);
	const img = cluster.previewUrl ? `<img class="${css.markerImage}" src="${escapeAttr(cluster.previewUrl)}" alt="">` : '';
	const badge = cluster.count > 1 ? `<span class="${css.badge}">${formatBadge(cluster.count)}</span>` : '';
	return L.divIcon({
		className: css.marker,
		html: img + badge,
		iconSize: [size, size],
		iconAnchor: [size / 2, size / 2],
	});
}

const stateOf = (map: L.Map): MapViewState => {
	const b = map.getBounds();
	const c = map.getCenter();
	return {
		bounds: [Math.max(-90, b.getSouth()), Math.min(90, b.getNorth()), Math.max(-180, b.getWest()), Math.min(180, b.getEast())],
		zoom: map.getZoom(),
		center: {lat: c.lat, lon: c.lng},
	};
};

/**
 * Leaflet map driven by the remote. While it has focus it takes the arrows itself (Spotlight
 * never sees them): a tap pans a quarter of the map, holding pans faster and faster. CH ▲/▼
 * zoom around the centre, OK calls onSelect. The Magic Remote pointer drags and zooms natively.
 */
export const MapView: React.FC<MapViewProps> = ({id, tiles, dimmed, initialView, clusters, focused, onViewChange, onSelect}) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const mapRef = useRef<L.Map | null>(null);
	const markersRef = useRef(new Map<number, {marker: L.Marker; count: number; previewUrl: string | null}>());
	// Latest callbacks, so the map and key listeners are set up once.
	const callbacks = useRef({onViewChange, onSelect});
	callbacks.current = {onViewChange, onSelect};

	// The map itself, once.
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return undefined;
		const map = L.map(container, {
			zoomControl: false,
			keyboard: false,
			minZoom: MIN_ZOOM,
			maxZoom: MAX_ZOOM,
			zoomSnap: 1,
			maxBounds: [[-MAX_LAT, -180], [MAX_LAT, 180]],
			maxBoundsViscosity: 1,
			worldCopyJump: false,
		});
		map.attributionControl.setPrefix(false);
		map.setView([initialView.lat, initialView.lon], initialView.zoom);
		const emit = () => callbacks.current.onViewChange(stateOf(map));
		map.on('moveend', emit);
		mapRef.current = map;
		emit();
		const markers = markersRef.current;
		return () => {
			map.remove();
			mapRef.current = null;
			markers.clear();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- the initial view only applies on creation
	}, []);

	// Tiles, replaced when the style changes.
	useEffect(() => {
		const map = mapRef.current;
		if (!map) return undefined;
		const layer = L.tileLayer(tiles.url, {
			subdomains: tiles.subdomains.length ? tiles.subdomains : 'abc',
			maxNativeZoom: tiles.maxZoom,
			maxZoom: MAX_ZOOM,
			attribution: tiles.attribution,
			// OSM's tile policy: no loading beyond what is shown
			keepBuffer: 1,
			updateWhenIdle: true,
		});
		layer.addTo(map);
		return () => {
			layer.remove();
		};
	}, [tiles]);

	// Markers, diffed by cluster id.
	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;
		const current = markersRef.current;
		const seen = new Set<number>();
		for (const cluster of clusters) {
			seen.add(cluster.id);
			const existing = current.get(cluster.id);
			if (existing && existing.count === cluster.count && existing.previewUrl === cluster.previewUrl) {
				existing.marker.setLatLng([cluster.lat, cluster.lon]);
				continue;
			}
			existing?.marker.remove();
			const marker = L.marker([cluster.lat, cluster.lon], {icon: markerIcon(cluster), keyboard: false});
			// Pointer: like Memories, clicking a marker zooms two levels in towards it.
			marker.on('click', () => map.setView(marker.getLatLng(), Math.min(MAX_ZOOM, map.getZoom() + 2)));
			marker.addTo(map);
			current.set(cluster.id, {marker, count: cluster.count, previewUrl: cluster.previewUrl});
		}
		for (const [clusterId, entry] of current) {
			if (!seen.has(clusterId)) {
				entry.marker.remove();
				current.delete(clusterId);
			}
		}
	}, [clusters]);

	// Remote keys while the map has focus.
	useEffect(() => {
		const held = new Map<PanDirection, number>();
		let lastRepeat = 0;
		let frame = 0;
		let lastFrame = 0;

		const loop = (now: number) => {
			const map = mapRef.current;
			if (!map || held.size === 0) {
				frame = 0;
				return;
			}
			if (performance.now() - lastRepeat > RELEASE_TIMEOUT_MS) {
				held.clear();
				frame = 0;
				return;
			}
			const [dx, dy] = holdOffset(held, now, Math.min(50, now - lastFrame));
			lastFrame = now;
			if (dx || dy) map.panBy([dx, dy], {animate: false});
			frame = requestAnimationFrame(loop);
		};

		const consume = (event: KeyboardEvent) => {
			event.preventDefault();
			event.stopImmediatePropagation();
		};

		const handleKeyDown = (event: KeyboardEvent) => {
			const map = mapRef.current;
			// the focusable wrapper Spotlight puts focus on
			const wrapper = containerRef.current?.parentElement;
			if (!map || !wrapper || document.activeElement !== wrapper) return;
			const dir = KEY_DIRECTIONS[event.keyCode];
			if (dir) {
				consume(event);
				Spotlight.setPointerMode(false);
				const now = performance.now();
				lastRepeat = now;
				if (held.has(dir)) return;
				const size = map.getSize();
				map.panBy(tapOffset(dir, size.x, size.y), {animate: true, duration: 0.25});
				held.set(dir, now);
				// The hold loop starts panning once HOLD_DELAY_MS has passed.
				if (!frame) {
					lastFrame = now + HOLD_DELAY_MS;
					frame = requestAnimationFrame(loop);
				}
				return;
			}
			if (event.keyCode === KEY_ENTER) {
				consume(event);
				callbacks.current.onSelect();
			} else if (ZOOM_IN_KEYS.has(event.keyCode)) {
				consume(event);
				map.setZoom(Math.min(MAX_ZOOM, map.getZoom() + 1));
			} else if (ZOOM_OUT_KEYS.has(event.keyCode)) {
				consume(event);
				map.setZoom(Math.max(MIN_ZOOM, map.getZoom() - 1));
			}
		};

		const handleKeyUp = (event: KeyboardEvent) => {
			const dir = KEY_DIRECTIONS[event.keyCode];
			if (dir) held.delete(dir);
		};

		window.addEventListener('keydown', handleKeyDown, {capture: true});
		window.addEventListener('keyup', handleKeyUp, {capture: true});
		return () => {
			window.removeEventListener('keydown', handleKeyDown, {capture: true});
			window.removeEventListener('keyup', handleKeyUp, {capture: true});
			if (frame) cancelAnimationFrame(frame);
		};
	}, []);

	// The map's size follows the layout (window resize, split changes).
	useEffect(() => {
		const container = containerRef.current;
		if (!container || typeof ResizeObserver === 'undefined') return undefined;
		const observer = new ResizeObserver(() => mapRef.current?.invalidateSize());
		observer.observe(container);
		return () => observer.disconnect();
	}, []);

	return (
		<SpottableDiv id={id} className={[css.mapView, dimmed ? css.dimmed : '', focused ? css.focused : ''].filter(Boolean).join(' ')}>
			<div ref={containerRef} className={css.leaflet} />
			{focused && <div className={css.crosshair} />}
		</SpottableDiv>
	);
};

MapView.displayName = 'MapView';
