import React, {useEffect} from 'react';
import Spotlight from '@enact/spotlight';
import ri from '@enact/ui/resolution';
import {useWebOSKeys} from '../hooks/useWebOSKeys';
import {createSpotlightContainer} from '../utils/spotlight';
import {GRID_INSET_LEFT_PX} from '../utils/constants';
import {TimelineGrid, type TimelineGridTimeline} from './TimelineGrid/TimelineGrid';
import {QueryStateView} from './QueryStateView';
import type {DayGroup} from '../domain/types';
import css from './AssetGridView.module.less';

const Container = createSpotlightContainer({enterTo: 'last-focused'});
const GridContainer = createSpotlightContainer({enterTo: 'last-focused'});

interface AssetGridViewProps {
	title: string;
	subtitle: string;
	groups?: DayGroup[];
	timeline?: TimelineGridTimeline;
	isLoading: boolean;
	error: unknown;
	isEmpty: boolean;
	emptyText?: string;
	spotlightId: string;
	onBack: () => void;
	contentWidth: number;
}

/** Shared detail layout for an opened album, person, place, tag or folder: title header + day-grouped grid.
 * There is no on-screen back or slideshow button: the remote's Back key closes the view, and a
 * slideshow starts from the photo viewer. */
export const AssetGridView: React.FC<AssetGridViewProps> = ({
	title,
	subtitle,
	groups,
	timeline,
	isLoading,
	error,
	isEmpty,
	emptyText = '',
	spotlightId,
	onBack,
	contentWidth,
}) => {
	useWebOSKeys({onBack});
	// When assets finish loading, move focus into the photo grid so the user can start
	// navigating photos right away (its cards mount in the same commit as the data). Keyed on a
	// boolean so later month loads don't steal focus mid-scroll.
	const hasContent = timeline ? timeline.loadedMonths.size > 0 : !!groups?.length;
	useEffect(() => {
		if (hasContent) Spotlight.focus(spotlightId);
	}, [hasContent, spotlightId]);

	return (
		<Container className={css.view}>
			<div className={css.header} style={{paddingLeft: ri.scale(GRID_INSET_LEFT_PX)}}>
				<div className={css.heading}>
					<span className={css.title}>{title}</span>
					{subtitle && !isLoading && <span className={css.count}>{subtitle}</span>}
				</div>
			</div>
			<GridContainer spotlightId={spotlightId} className={css.listContainer}>
				<QueryStateView isLoading={isLoading} error={error} isEmpty={isEmpty} loadingText="Loading…" emptyText={emptyText}>
					<TimelineGrid groups={groups} timeline={timeline} contentWidth={contentWidth} />
				</QueryStateView>
			</GridContainer>
		</Container>
	);
};

AssetGridView.displayName = 'AssetGridView';
