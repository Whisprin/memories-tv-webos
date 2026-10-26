import React, {useMemo} from 'react';
import {useTimeline} from '../hooks/useTimeline';
import {AssetGridView} from '../components/AssetGridView';
import type {Place, TimelineScope} from '../domain/types';
import {formatCount} from '../utils/FormattingService';

interface PlaceViewProps {
	place: Place;
	onBack: () => void;
	contentWidth: number;
}

const PlaceView: React.FC<PlaceViewProps> = ({place, onBack, contentWidth}) => {
	const scope = useMemo<TimelineScope>(() => ({placeId: place.id}), [place.id]);
	const {timeline, isLoading, error} = useTimeline(scope);

	return (
		<AssetGridView
			title={place.name}
			subtitle={formatCount(place.assetCount, 'item')}
			timeline={timeline}
			isLoading={isLoading}
			error={error}
			isEmpty={timeline.allBuckets.length === 0}
			emptyText="No photos found for this place."
			spotlightId="place-grid"
			onBack={onBack}
			contentWidth={contentWidth}
		/>
	);
};

export default PlaceView;
