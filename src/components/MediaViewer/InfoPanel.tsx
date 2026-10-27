import React from 'react';
import {useAssetDetails} from '../../hooks/useAssetDetails';
import {formatAssetDateTime, formatFileSize} from '../../utils/FormattingService';
import {presentError} from '../../utils/presentError';
import type {TimelineAsset} from '../../domain/types';
import css from './InfoPanel.module.less';

const Row: React.FC<{label: string; children: React.ReactNode}> = ({label, children}) => (
	<div className={css.row}>
		<div className={css.label}>{label}</div>
		<div className={css.value}>{children}</div>
	</div>
);

// The viewer's Info panel: date, place, people, tags, camera and file of the current photo.
// Read-only and not focusable; Info or Back closes it.
export const InfoPanel: React.FC<{asset: TimelineAsset}> = ({asset}) => {
	const {data: details, isLoading, error} = useAssetDetails(asset.id);
	const {date, time} = formatAssetDateTime(asset.localDateTime);

	let body: React.ReactNode;
	if (isLoading) body = <p className={css.state}>Loading…</p>;
	else if (error || !details) body = <p className={css.state}>{presentError(error)}</p>;
	else {
		const people = [...details.people];
		if (details.unnamedPeople > 0) people.push(details.unnamedPeople === 1 ? '1 unnamed person' : `${details.unnamedPeople} unnamed people`);
		const size = [
			details.megapixels ? `${details.megapixels.toFixed(1)} MP` : null,
			details.width && details.height ? `${details.width} × ${details.height}` : null,
			details.fileSize ? formatFileSize(details.fileSize) : null,
		].filter(Boolean);
		body = (
			<>
				{details.place && <Row label="Place">{details.place}</Row>}
				{people.length > 0 && <Row label="People">{people.join(', ')}</Row>}
				{details.tags.length > 0 && <Row label="Tags">{details.tags.join(', ')}</Row>}
				{(details.camera || details.lens || details.exposure.length > 0) && (
					<Row label="Camera">
						{details.camera && <div>{details.camera}</div>}
						{details.lens && <div className={css.secondary}>{details.lens}</div>}
						{details.exposure.length > 0 && <div className={css.secondary}>{details.exposure.join(' · ')}</div>}
					</Row>
				)}
				{(details.fileName || size.length > 0) && (
					<Row label="File">
						{details.fileName && <div className={css.fileName}>{details.fileName}</div>}
						{size.length > 0 && <div className={css.secondary}>{size.join(' · ')}</div>}
					</Row>
				)}
			</>
		);
	}

	return (
		<aside className={css.panel} aria-label="Photo info">
			<Row label="Date">
				<div>{date}</div>
				<div className={css.secondary}>{time}</div>
			</Row>
			{body}
		</aside>
	);
};
