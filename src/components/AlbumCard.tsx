import React, {useCallback, useMemo} from 'react';
import {useRepository} from '../domain/RepositoryContext';
import type {Album} from '../domain/types';
import {ThumbnailCard} from './ThumbnailCard';
import {formatCount} from '../utils/FormattingService';
import {spotlightSafe} from '../utils/spotlightId';

interface AlbumCardProps {
	album: Album;
	onSelect?: (albumId: string) => void;
}

// Album ids are '<owner>/<album name>', free text that Spotlight can't use as is.
export const albumCardSpotlightId = (albumId: string): string => `album-card-${spotlightSafe(albumId)}`;

export const AlbumCard: React.FC<AlbumCardProps> = React.memo(({album, onSelect}) => {
	const repository = useRepository();
	const thumbnailUrl = useMemo(
		() => (album.albumThumbnailAssetId ? repository.thumbnailUrl(album.albumThumbnailAssetId) : null),
		[repository, album.albumThumbnailAssetId]
	);

	const handleClick = useCallback(() => onSelect?.(album.id), [album.id, onSelect]);

	return (
		<ThumbnailCard
			thumbnailUrl={thumbnailUrl}
			title={album.albumName}
			secondaryLine={formatCount(album.assetCount, 'item')}
			onClick={handleClick}
			spotlightId={albumCardSpotlightId(album.id)}
		/>
	);
});

AlbumCard.displayName = 'AlbumCard';
