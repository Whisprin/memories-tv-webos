import React, {useCallback, useMemo} from 'react';
import {useRepository} from '../domain/RepositoryContext';
import type {Person} from '../domain/types';
import {ThumbnailCard} from './ThumbnailCard';
import {formatCount} from '../utils/FormattingService';
import {spotlightSafe} from '../utils/spotlightId';

interface PersonCardProps {
	person: Person;
	onSelect?: (person: Person) => void;
}

export const personCardSpotlightId = (personId: string): string => `person-card-${spotlightSafe(personId)}`;

export const PersonCard: React.FC<PersonCardProps> = React.memo(({person, onSelect}) => {
	const repository = useRepository();
	const faceUrl = useMemo(() => repository.faceUrl(person.id), [repository, person.id]);
	const handleClick = useCallback(() => onSelect?.(person), [person, onSelect]);

	return (
		<ThumbnailCard
			thumbnailUrl={faceUrl}
			title={person.name || 'Unnamed'}
			secondaryLine={formatCount(person.assetCount, 'item')}
			onClick={handleClick}
			spotlightId={personCardSpotlightId(person.id)}
		/>
	);
});

PersonCard.displayName = 'PersonCard';
