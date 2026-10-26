import React from 'react';
import FilteredTimelinePanel from './FilteredTimelinePanel';
import type {TimelineScope} from '../domain/types';
import type {RoutePanelProps} from '../types/navigation';

const ARCHIVE: TimelineScope = {archive: true};

// Archived photos and videos, which Memories hides from the main timeline (archive filter).
const ArchivePanel: React.FC<RoutePanelProps> = ({contentWidth}) => (
	<FilteredTimelinePanel
		scope={ARCHIVE}
		contentWidth={contentWidth}
		loadingText="Loading the archive…"
		emptyText="The archive is empty. Photos you archive in Memories are hidden from the timeline and appear here."
	/>
);

export default ArchivePanel;
