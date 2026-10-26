import React from 'react';
import CollectionsPanel from './CollectionsPanel';
import {useTags} from '../hooks/useTags';
import type {Collection, TimelineScope} from '../domain/types';
import type {RoutePanelProps} from '../types/navigation';

const tagScope = (tag: Collection): TimelineScope => ({tagId: tag.id});

const TagsPanel: React.FC<RoutePanelProps> = ({contentWidth}) => {
	const {data, isLoading, error} = useTags();
	return (
		<CollectionsPanel
			title="Tags"
			kind="tag"
			items={data}
			isLoading={isLoading}
			error={error}
			loadingText="Loading tags…"
			emptyText="No tags found. Tags are Nextcloud's collaborative tags on your photos."
			itemEmptyText="No photos with this tag."
			scopeOf={tagScope}
			contentWidth={contentWidth}
		/>
	);
};

export default TagsPanel;
