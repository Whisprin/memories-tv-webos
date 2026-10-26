import React, {useMemo} from 'react';
import {useTimeline} from '../hooks/useTimeline';
import {AssetGridView} from '../components/AssetGridView';
import type {Person, TimelineScope} from '../domain/types';
import {formatCount} from '../utils/FormattingService';

interface PersonViewProps {
	person: Person;
	onBack: () => void;
	contentWidth: number;
}

const PersonView: React.FC<PersonViewProps> = ({person, onBack, contentWidth}) => {
	const scope = useMemo<TimelineScope>(() => ({personId: person.id}), [person.id]);
	const {timeline, isLoading, error} = useTimeline(scope);

	return (
		<AssetGridView
			title={person.name || 'Unnamed'}
			subtitle={formatCount(person.assetCount, 'item')}
			timeline={timeline}
			isLoading={isLoading}
			error={error}
			isEmpty={timeline.allBuckets.length === 0}
			emptyText="No photos of this person."
			spotlightId="person-grid"
			onBack={onBack}
			contentWidth={contentWidth}
		/>
	);
};

export default PersonView;
