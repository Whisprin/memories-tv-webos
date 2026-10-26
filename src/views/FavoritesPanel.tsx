import React from 'react';
import FilteredTimelinePanel from './FilteredTimelinePanel';
import type {TimelineScope} from '../domain/types';
import type {RoutePanelProps} from '../types/navigation';

const FAVORITES: TimelineScope = {favorites: true};

// Photos and videos marked as favourite (Memories' fav=1 filter).
const FavoritesPanel: React.FC<RoutePanelProps> = ({contentWidth}) => (
	<FilteredTimelinePanel
		scope={FAVORITES}
		contentWidth={contentWidth}
		loadingText="Loading favourites…"
		emptyText="No favourites yet. Photos and videos you star in Nextcloud or Memories appear here."
	/>
);

export default FavoritesPanel;
