import React from 'react';
import {QueryStateView} from '../components/QueryStateView';
import {TimelineGrid} from '../components/TimelineGrid/TimelineGrid';
import {useTimeline} from '../hooks/useTimeline';
import type {TimelineScope} from '../domain/types';
import type {RoutePanelProps} from '../types/navigation';

interface FilteredTimelinePanelProps extends RoutePanelProps {
	// keep the object stable (a module constant), it keys the timeline cache
	scope: TimelineScope;
	loadingText: string;
	emptyText: string;
}

// The timeline limited by a Memories filter, as its own tab (Favourites, Archive).
const FilteredTimelinePanel: React.FC<FilteredTimelinePanelProps> = ({scope, loadingText, emptyText, contentWidth}) => {
	const {timeline, isLoading, isError, error} = useTimeline(scope);

	return (
		<QueryStateView
			isLoading={isLoading}
			error={isError ? error : null}
			isEmpty={timeline.allBuckets.length === 0}
			loadingText={loadingText}
			emptyText={emptyText}
		>
			<TimelineGrid contentWidth={contentWidth} timeline={timeline} />
		</QueryStateView>
	);
};

export default FilteredTimelinePanel;
