import React, {useCallback} from 'react';
import type {Collection} from '../domain/types';
import {ThumbnailCard} from './ThumbnailCard';
import {formatCount} from '../utils/FormattingService';
import {spotlightSafe} from '../utils/spotlightId';

interface CollectionCardProps {
	item: Collection;
	// e.g. 'place' → Spotlight ids place-card-<id>
	kind: string;
	onSelect?: (item: Collection) => void;
}

export const collectionCardSpotlightId = (kind: string, id: string): string => `${kind}-card-${spotlightSafe(id)}`;

export const CollectionCard: React.FC<CollectionCardProps> = React.memo(({item, kind, onSelect}) => {
	const handleClick = useCallback(() => onSelect?.(item), [item, onSelect]);

	return (
		<ThumbnailCard
			thumbnailUrl={item.coverUrl}
			title={item.name}
			secondaryLine={formatCount(item.assetCount, 'item')}
			onClick={handleClick}
			spotlightId={collectionCardSpotlightId(kind, item.id)}
		/>
	);
});

CollectionCard.displayName = 'CollectionCard';
