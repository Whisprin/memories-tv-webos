import React, {useCallback, useMemo, useState} from 'react';
import {CollectionCard, collectionCardSpotlightId} from '../components/CollectionCard';
import {CollectionGrid} from '../components/CollectionGrid/CollectionGrid';
import {QueryStateView} from '../components/QueryStateView';
import {AssetGridView} from '../components/AssetGridView';
import {useFocusOnReturn} from '../hooks/useFocusOnReturn';
import {useTimeline} from '../hooks/useTimeline';
import type {Collection, TimelineScope} from '../domain/types';
import type {RoutePanelProps} from '../types/navigation';
import {formatCount} from '../utils/FormattingService';

interface CollectionsPanelProps extends RoutePanelProps {
	title: string;
	// singular noun for the count, e.g. 'place'; also the Spotlight id prefix
	kind: string;
	items: Collection[] | undefined;
	isLoading: boolean;
	error: unknown;
	loadingText: string;
	emptyText: string;
	itemEmptyText: string;
	// timeline filter for one item; keep it a stable function
	scopeOf: (item: Collection) => TimelineScope;
}

interface CollectionViewProps extends RoutePanelProps {
	item: Collection;
	kind: string;
	emptyText: string;
	scopeOf: (item: Collection) => TimelineScope;
	onBack: () => void;
}

// One item's photos as a timeline, with a back header.
const CollectionView: React.FC<CollectionViewProps> = ({item, kind, emptyText, scopeOf, onBack, contentWidth}) => {
	// eslint-disable-next-line react-hooks/exhaustive-deps
	const scope = useMemo(() => scopeOf(item), [item.id, scopeOf]);
	const {timeline, isLoading, error} = useTimeline(scope);

	return (
		<AssetGridView
			title={item.name}
			subtitle={formatCount(item.assetCount, 'item')}
			timeline={timeline}
			isLoading={isLoading}
			error={error}
			isEmpty={timeline.allBuckets.length === 0}
			emptyText={emptyText}
			spotlightId={`${kind}-grid`}
			onBack={onBack}
			contentWidth={contentWidth}
		/>
	);
};

// A grid of covers (places, tags); choosing one opens its timeline, Back returns to the grid.
const CollectionsPanel: React.FC<CollectionsPanelProps> = ({
	title,
	kind,
	items,
	isLoading,
	error,
	loadingText,
	emptyText,
	itemEmptyText,
	scopeOf,
	contentWidth,
}) => {
	const [selected, setSelected] = useState<Collection | null>(null);
	const handleBack = useCallback(() => setSelected(null), []);
	const spotlightIdFor = useCallback((id: string) => collectionCardSpotlightId(kind, id), [kind]);
	useFocusOnReturn(selected?.id ?? null, spotlightIdFor);

	if (selected) {
		return <CollectionView item={selected} kind={kind} emptyText={itemEmptyText} scopeOf={scopeOf} onBack={handleBack} contentWidth={contentWidth} />;
	}

	return (
		<QueryStateView isLoading={isLoading} error={error} isEmpty={!items?.length} loadingText={loadingText} emptyText={emptyText}>
			<CollectionGrid title={title} subtitle={items ? formatCount(items.length, kind) : undefined}>
				{items?.map((item) => (
					<CollectionCard key={item.id} item={item} kind={kind} onSelect={setSelected} />
				))}
			</CollectionGrid>
		</QueryStateView>
	);
};

export default CollectionsPanel;
