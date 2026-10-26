import React, {useCallback, useState} from 'react';
import {PlaceCard, placeCardSpotlightId} from '../components/PlaceCard';
import {CollectionGrid} from '../components/CollectionGrid/CollectionGrid';
import {QueryStateView} from '../components/QueryStateView';
import PlaceView from './PlaceView';
import {usePlaces} from '../hooks/usePlaces';
import {useFocusOnReturn} from '../hooks/useFocusOnReturn';
import type {Place} from '../domain/types';
import type {RoutePanelProps} from '../types/navigation';
import {formatCount} from '../utils/FormattingService';

const PlacesPanel: React.FC<RoutePanelProps> = ({contentWidth}) => {
	const [selected, setSelected] = useState<Place | null>(null);
	const {data: places, isLoading, error} = usePlaces();

	const handleBack = useCallback(() => setSelected(null), []);
	useFocusOnReturn(selected?.id ?? null, placeCardSpotlightId);

	if (selected) {
		return <PlaceView place={selected} onBack={handleBack} contentWidth={contentWidth} />;
	}

	return (
		<QueryStateView
			isLoading={isLoading}
			error={error}
			isEmpty={!places?.length}
			loadingText="Loading places…"
			emptyText="No places found. Places need location data in your photos and reverse geocoding set up in Memories."
		>
			<CollectionGrid title="Places" subtitle={places ? formatCount(places.length, 'place') : undefined}>
				{places?.map((place) => (
					<PlaceCard key={place.id} place={place} onSelect={setSelected} />
				))}
			</CollectionGrid>
		</QueryStateView>
	);
};

export default PlacesPanel;
