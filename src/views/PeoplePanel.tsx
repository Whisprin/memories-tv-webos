import React, {useCallback, useState} from 'react';
import {PersonCard, personCardSpotlightId} from '../components/PersonCard';
import {CollectionGrid} from '../components/CollectionGrid/CollectionGrid';
import {QueryStateView} from '../components/QueryStateView';
import PersonView from './PersonView';
import {usePeople} from '../hooks/usePeople';
import {useFocusOnReturn} from '../hooks/useFocusOnReturn';
import type {Person} from '../domain/types';
import type {RoutePanelProps} from '../types/navigation';
import {formatCount} from '../utils/FormattingService';

const PeoplePanel: React.FC<RoutePanelProps> = ({contentWidth}) => {
	const [selected, setSelected] = useState<Person | null>(null);
	const {data: people, isLoading, error} = usePeople();

	const handleBack = useCallback(() => setSelected(null), []);
	useFocusOnReturn(selected?.id ?? null, personCardSpotlightId);

	if (selected) {
		return <PersonView person={selected} onBack={handleBack} contentWidth={contentWidth} />;
	}

	return (
		<QueryStateView
			isLoading={isLoading}
			error={error}
			isEmpty={!people?.length}
			loadingText="Loading people…"
			emptyText="No people found. People appear once face recognition (the Recognize app) is set up in Nextcloud."
		>
			<CollectionGrid title="People" subtitle={people ? formatCount(people.length, 'person', 'people') : undefined}>
				{people?.map((person) => (
					<PersonCard key={person.id} person={person} onSelect={setSelected} />
				))}
			</CollectionGrid>
		</QueryStateView>
	);
};

export default PeoplePanel;
