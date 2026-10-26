import React from 'react';
import FilteredTimelinePanel from './FilteredTimelinePanel';
import type {TimelineScope} from '../domain/types';
import type {RoutePanelProps} from '../types/navigation';

const ON_THIS_DAY: TimelineScope = {onThisDay: true};

// Photos and videos taken on today's date in past years, newest year first.
const OnThisDayPanel: React.FC<RoutePanelProps> = ({contentWidth}) => (
	<FilteredTimelinePanel
		scope={ON_THIS_DAY}
		contentWidth={contentWidth}
		loadingText="Looking back…"
		emptyText="Nothing from this day in past years. The range of days can be widened in Memories' settings."
	/>
);

export default OnThisDayPanel;
