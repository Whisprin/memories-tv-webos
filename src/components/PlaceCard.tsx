import React, {useCallback} from 'react';
import type {Place} from '../domain/types';
import {ThumbnailCard} from './ThumbnailCard';
import {formatCount} from '../utils/FormattingService';
import {spotlightSafe} from '../utils/spotlightId';

interface PlaceCardProps {
	place: Place;
	onSelect?: (place: Place) => void;
}

export const placeCardSpotlightId = (placeId: string): string => `place-card-${spotlightSafe(placeId)}`;

export const PlaceCard: React.FC<PlaceCardProps> = React.memo(({place, onSelect}) => {
	const handleClick = useCallback(() => onSelect?.(place), [place, onSelect]);

	return (
		<ThumbnailCard
			thumbnailUrl={place.coverUrl}
			title={place.name}
			secondaryLine={formatCount(place.assetCount, 'item')}
			onClick={handleClick}
			spotlightId={placeCardSpotlightId(place.id)}
		/>
	);
});

PlaceCard.displayName = 'PlaceCard';
