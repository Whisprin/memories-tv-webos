import {keepPreviousData} from '@tanstack/react-query';
import {useRepositoryQuery} from './queryConfig';
import {boundsKey, padBounds, snapBounds} from '../utils/mapGeometry';
import type {MapBounds} from '../domain/types';

// Markers for the visible area plus a quarter on each side, as Memories loads them. The bounds
// are snapped to grid cells, so small pans come from the cache; while a new area loads, the
// previous markers stay on the map.
export const useMapClusters = (bounds: MapBounds | null, zoom: number) => {
	const area = bounds ? snapBounds(padBounds(bounds, 0.25), zoom) : null;
	const z = Math.round(zoom);
	return useRepositoryQuery(['map-clusters', area ? boundsKey(area) : '', z], (r) => r.getMapClusters(area!, z), {
		enabled: !!area,
		placeholderData: keepPreviousData,
		staleTime: 10 * 60 * 1000,
		gcTime: 10 * 60 * 1000,
	});
};
