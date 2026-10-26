import React from 'react';
import CollectionsPanel from './CollectionsPanel';
import {usePlaces} from '../hooks/usePlaces';
import type {Collection, TimelineScope} from '../domain/types';
import type {RoutePanelProps} from '../types/navigation';

const placeScope = (place: Collection): TimelineScope => ({placeId: place.id});

const PlacesPanel: React.FC<RoutePanelProps> = ({contentWidth}) => {
	const {data, isLoading, error} = usePlaces();
	return (
		<CollectionsPanel
			title="Places"
			kind="place"
			items={data}
			isLoading={isLoading}
			error={error}
			loadingText="Loading places…"
			emptyText="No places found. Places need location data in your photos and reverse geocoding set up in Memories."
			itemEmptyText="No photos found for this place."
			scopeOf={placeScope}
			contentWidth={contentWidth}
		/>
	);
};

export default PlacesPanel;
