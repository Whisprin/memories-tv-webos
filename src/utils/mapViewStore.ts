import {useCallback, useSyncExternalStore} from 'react';
import type {MapStyle} from '../domain/types';

// Viewing preferences only, kept on this TV: the last map view per account and the map style.
const VIEWS_KEY = 'memoriestv_map_views';
const STYLE_KEY = 'memoriestv_map_style';

export const MAP_STYLES: MapStyle[] = ['osm', 'osm-dimmed', 'topo'];

export const MAP_STYLE_LABELS: Record<MapStyle, string> = {
	osm: 'OpenStreetMap',
	'osm-dimmed': 'OpenStreetMap, dimmed',
	topo: 'OpenTopoMap',
};

export interface SavedMapView {
	lat: number;
	lon: number;
	zoom: number;
}

function readViews(): Record<string, SavedMapView> {
	try {
		const saved: unknown = JSON.parse(localStorage.getItem(VIEWS_KEY) ?? '{}');
		return saved && typeof saved === 'object' ? (saved as Record<string, SavedMapView>) : {};
	} catch {
		return {};
	}
}

export function getSavedMapView(accountId: string | null): SavedMapView | null {
	if (!accountId) return null;
	const v = readViews()[accountId];
	return v && Number.isFinite(v.lat) && Number.isFinite(v.lon) && Number.isFinite(v.zoom) ? v : null;
}

export function saveMapView(accountId: string | null, view: SavedMapView): void {
	if (!accountId) return;
	try {
		localStorage.setItem(VIEWS_KEY, JSON.stringify({...readViews(), [accountId]: view}));
	} catch {
		// storage full or unavailable: the map starts at the newest photo next time
	}
}

// The map style is set in Settings while the map may be open behind it, so it is a small store
// the map subscribes to.
const listeners = new Set<() => void>();

export function getMapStyle(): MapStyle {
	try {
		const style = localStorage.getItem(STYLE_KEY) as MapStyle | null;
		return style && MAP_STYLES.includes(style) ? style : 'osm';
	} catch {
		return 'osm';
	}
}

export function saveMapStyle(style: MapStyle): void {
	try {
		localStorage.setItem(STYLE_KEY, style);
	} catch {
		// ignore: the style still applies until the app restarts
	}
	listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};

export function useMapStyle(): [MapStyle, (style: MapStyle) => void] {
	const style = useSyncExternalStore(subscribe, getMapStyle);
	const setStyle = useCallback((next: MapStyle) => saveMapStyle(next), []);
	return [style, setStyle];
}
