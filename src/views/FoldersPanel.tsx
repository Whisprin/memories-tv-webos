import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {CollectionGrid} from '../components/CollectionGrid/CollectionGrid';
import {QueryStateView} from '../components/QueryStateView';
import {ThumbnailCard} from '../components/ThumbnailCard';
import {AssetGridView} from '../components/AssetGridView';
import {useFolderRoot, useSubfolders} from '../hooks/useFolders';
import {useFocusOnReturn} from '../hooks/useFocusOnReturn';
import {useTimeline} from '../hooks/useTimeline';
import {useWebOSKeys} from '../hooks/useWebOSKeys';
import type {Folder, TimelineScope} from '../domain/types';
import type {RoutePanelProps} from '../types/navigation';
import {forceFocus} from '../utils/spotlight';
import {spotlightSafe} from '../utils/spotlightId';

type PhotosChoice = 'here' | 'all';

const PHOTOS_HERE_ID = 'folder-photos-here';
const PHOTOS_ALL_ID = 'folder-photos-all';
const folderCardId = (path: string): string => `folder-card-${spotlightSafe(path)}`;
const photosCardId = (choice: string): string => (choice === 'all' ? PHOTOS_ALL_ID : PHOTOS_HERE_ID);
const folderName = (path: string): string => path.replace(/\/+$/, '').split('/').pop() || path;

interface FolderPhotosViewProps extends RoutePanelProps {
	path: string;
	recursive: boolean;
	onBack: () => void;
}

// A folder's photos as a timeline (Memories' folder filter, optionally with subfolders).
const FolderPhotosView: React.FC<FolderPhotosViewProps> = ({path, recursive, onBack, contentWidth}) => {
	const scope = useMemo<TimelineScope>(() => ({folder: path, recursive}), [path, recursive]);
	const {timeline, isLoading, error} = useTimeline(scope);

	return (
		<AssetGridView
			title={folderName(path)}
			subtitle={recursive ? 'Including subfolders' : 'This folder only'}
			timeline={timeline}
			isLoading={isLoading}
			error={error}
			isEmpty={timeline.allBuckets.length === 0}
			emptyText={recursive ? 'No photos in this folder or its subfolders.' : 'No photos directly in this folder. Try "All photos" to include subfolders.'}
			spotlightId="folder-grid"
			onBack={onBack}
			contentWidth={contentWidth}
		/>
	);
};

const FolderCard: React.FC<{folder: Folder; onOpen: (folder: Folder) => void}> = React.memo(({folder, onOpen}) => {
	const handleClick = useCallback(() => onOpen(folder), [folder, onOpen]);
	return (
		<ThumbnailCard
			thumbnailUrl={folder.coverUrl}
			title={folder.name}
			secondaryLine="Folder"
			onClick={handleClick}
			spotlightId={folderCardId(folder.path)}
			placeholderIcon="folder"
		/>
	);
});

FolderCard.displayName = 'FolderCard';

// Browses Memories' folders from its Folders root. Each level offers its own photos, all photos
// including subfolders, and its subfolders. Back goes up a level, and from the root to the Timeline.
const FoldersPanel: React.FC<RoutePanelProps> = ({contentWidth}) => {
	const {data: root, isLoading: isRootLoading, error: rootError} = useFolderRoot();
	const [stack, setStack] = useState<string[]>([]);
	const path = stack.length > 0 ? stack[stack.length - 1]! : (root ?? null);
	const {data: folders, isLoading, error} = useSubfolders(path);
	const [photos, setPhotos] = useState<PhotosChoice | null>(null);

	// Card to focus once the new level has rendered: the first card after going down, the
	// folder we came from after going up.
	const pendingFocusRef = useRef<string | null>(null);

	const openFolder = useCallback((folder: Folder) => {
		pendingFocusRef.current = PHOTOS_HERE_ID;
		setStack((s) => [...s, folder.path]);
	}, []);

	const goUp = useCallback(() => {
		setStack((s) => {
			const child = s[s.length - 1];
			if (child) pendingFocusRef.current = folderCardId(child);
			return s.slice(0, -1);
		});
	}, []);

	useWebOSKeys({onBack: stack.length > 0 && !photos ? goUp : undefined});

	useEffect(() => {
		if (!folders || photos || !pendingFocusRef.current) return;
		const id = pendingFocusRef.current;
		pendingFocusRef.current = null;
		forceFocus(id);
	}, [folders, path, photos]);

	const showHere = useCallback(() => setPhotos('here'), []);
	const showAll = useCallback(() => setPhotos('all'), []);
	const closePhotos = useCallback(() => setPhotos(null), []);
	useFocusOnReturn(photos, photosCardId);

	if (photos && path) {
		return <FolderPhotosView path={path} recursive={photos === 'all'} onBack={closePhotos} contentWidth={contentWidth} />;
	}

	const atRoot = stack.length === 0;
	return (
		<QueryStateView isLoading={isRootLoading || isLoading} error={rootError ?? error} loadingText="Loading folders…">
			<CollectionGrid title={atRoot || !path ? 'Folders' : folderName(path)} subtitle={path ?? undefined}>
				<ThumbnailCard thumbnailUrl={null} title="Photos here" secondaryLine="This folder only" onClick={showHere} spotlightId={PHOTOS_HERE_ID} />
				{folders && folders.length > 0 ? (
					<ThumbnailCard thumbnailUrl={null} title="All photos" secondaryLine="Including subfolders" onClick={showAll} spotlightId={PHOTOS_ALL_ID} />
				) : null}
				{folders?.map((folder) => (
					<FolderCard key={folder.path} folder={folder} onOpen={openFolder} />
				))}
			</CollectionGrid>
		</QueryStateView>
	);
};

export default FoldersPanel;
