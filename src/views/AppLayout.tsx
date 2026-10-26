import React, {useCallback, useEffect, useState} from 'react';
import {SIDEBAR_WIDTH} from '../utils/constants';
import {createSpotlightContainer} from '../utils/spotlight';
import {useWebOSKeys} from '../hooks/useWebOSKeys';
import {NavigationRail} from '../components/NavigationRail/NavigationRail';
import MainPanel from './MainPanel';
import FoldersPanel from './FoldersPanel';
import FavoritesPanel from './FavoritesPanel';
import AlbumsPanel from './AlbumsPanel';
import PeoplePanel from './PeoplePanel';
import ArchivePanel from './ArchivePanel';
import PlacesPanel from './PlacesPanel';
import TagsPanel from './TagsPanel';
import type {View} from '../types/navigation';
import css from './AppLayout.module.less';

interface AppLayoutProps {
	onOpenAccount: () => void;
	accountLetter: string;
	accountGradient: string;
}

const ViewContainer = createSpotlightContainer({enterTo: 'last-focused'});

const AppLayout: React.FC<AppLayoutProps> = ({onOpenAccount, accountLetter, accountGradient}) => {
	const [activeView, setActiveView] = useState<View>('photos');
	const [contentWidth, setContentWidth] = useState(window.innerWidth - SIDEBAR_WIDTH);

	// Back on another tab returns to the Timeline; Back on the Timeline (nothing open) exits the app,
	// see useWebOSKeys.
	const showPhotos = useCallback(() => setActiveView('photos'), []);
	useWebOSKeys({onBack: activeView === 'photos' ? undefined : showPhotos});

	useEffect(() => {
		const handleResize = () => setContentWidth(window.innerWidth - SIDEBAR_WIDTH);
		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	}, []);

	return (
		<div className={css.layout}>
			<NavigationRail
				activeView={activeView}
				onNavigate={setActiveView}
				onOpenAccount={onOpenAccount}
				accountLetter={accountLetter}
				accountGradient={accountGradient}
			/>
			{/*
				MainPanel reste mounté (CSS-hidden) pour préserver la position de scroll
				du timeline. Le cache TanStack survit déjà via QueryClientProvider en haut, donc l'unmount
				ne perdrait que la position scroll. Albums/Places réinitialisent leur navigation interne à
				chaque retour, ce qui est désiré côté UX.
			*/}
			<ViewContainer className={css.viewContainer}>
				<div className={activeView === 'photos' ? css.panelActive : css.panelHidden}>
					<MainPanel contentWidth={contentWidth} />
				</div>
				{activeView === 'folders' && (
					<div className={css.panelActive}>
						<FoldersPanel contentWidth={contentWidth} />
					</div>
				)}
				{activeView === 'favorites' && (
					<div className={css.panelActive}>
						<FavoritesPanel contentWidth={contentWidth} />
					</div>
				)}
				{activeView === 'albums' && (
					<div className={css.panelActive}>
						<AlbumsPanel contentWidth={contentWidth} />
					</div>
				)}
				{activeView === 'people' && (
					<div className={css.panelActive}>
						<PeoplePanel contentWidth={contentWidth} />
					</div>
				)}
				{activeView === 'archive' && (
					<div className={css.panelActive}>
						<ArchivePanel contentWidth={contentWidth} />
					</div>
				)}
				{activeView === 'places' && (
					<div className={css.panelActive}>
						<PlacesPanel contentWidth={contentWidth} />
					</div>
				)}
				{activeView === 'tags' && (
					<div className={css.panelActive}>
						<TagsPanel contentWidth={contentWidth} />
					</div>
				)}
			</ViewContainer>
		</div>
	);
};

export default AppLayout;
