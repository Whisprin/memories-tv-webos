import React from 'react';
import {QueryStateView} from '../components/QueryStateView';
import {TimelineGrid} from '../components/TimelineGrid/TimelineGrid';
import {useTimeline} from '../hooks/useTimeline';
import type {TimelineScope} from '../domain/types';
import type {RoutePanelProps} from '../types/navigation';

const FAVORITES: TimelineScope = {favorites: true};

// The timeline, limited to photos and videos marked as favourite (Memories' fav=1 filter).
const FavoritesPanel: React.FC<RoutePanelProps> = ({contentWidth}) => {
	const {timeline, isLoading, isError, error} = useTimeline(FAVORITES);

	return (
		<QueryStateView
			isLoading={isLoading}
			error={isError ? error : null}
			isEmpty={timeline.allBuckets.length === 0}
			loadingText="Loading favourites…"
			emptyText="No favourites yet. Photos and videos you star in Nextcloud or Memories appear here."
		>
			<TimelineGrid contentWidth={contentWidth} timeline={timeline} />
		</QueryStateView>
	);
};

export default FavoritesPanel;
