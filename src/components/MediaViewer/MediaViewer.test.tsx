import React from 'react';
import {act, render} from '@testing-library/react';
import {MediaViewer} from './MediaViewer';
import {RepositoryProvider} from '../../domain/RepositoryContext';
import type {PhotoRepository} from '../../domain/PhotoRepository';
import type {TimelineAsset} from '../../domain/types';

// Sandstone's VideoPlayer needs real media APIs; capture the callback it would fire when its
// transport bar shows or hides instead.
let reportControls: ((ev: {available?: boolean}) => void) | undefined;
jest.mock('./VideoPlayer', () => ({
	VideoPlayer: ({onControlsAvailable}: {onControlsAvailable?: (ev: {available?: boolean}) => void}) => {
		reportControls = onControlsAvailable;
		return <video />;
	},
}));

jest.mock('@enact/sandstone/Button', () => ({
	__esModule: true,
	default: ({onClick}: {onClick?: () => void}) => <button onClick={onClick} />,
}));

jest.mock('../MediaInfo/MediaInfo', () => ({MediaInfo: () => <span>info</span>}));

const video: TimelineAsset = {id: '7', type: 'VIDEO', ratio: 16 / 9, localDateTime: '2026-03-01T12:00:00.000Z', durationSeconds: 30};
const photo: TimelineAsset = {...video, id: '8', type: 'IMAGE', durationSeconds: null};

const repository = {
	previewUrl: (id: string) => `preview:${id}`,
	videoPlaybackUrl: (id: string) => `video:${id}`,
} as unknown as PhotoRepository;

const renderViewer = (asset: TimelineAsset) =>
	render(
		<RepositoryProvider repository={repository}>
			<MediaViewer
				getAssetAt={() => asset}
				totalCount={1}
				currentIndex={0}
				position="1 / 1"
				onClose={() => {}}
				onNavigate={() => {}}
				onStartSlideshow={() => {}}
			/>
		</RepositoryProvider>,
	);

// MediaControls' root: CSS modules map to their class names in tests (identity-obj-proxy).
const overlay = (container: HTMLElement) => container.querySelector('.chrome') as HTMLElement;
const isHidden = (container: HTMLElement) => overlay(container).classList.contains('hidden');

beforeEach(() => {
	jest.useFakeTimers();
	reportControls = undefined;
});

afterEach(() => {
	jest.useRealTimers();
});

describe('MediaViewer video overlay', () => {
	test('shows when a video opens, then hides during playback', () => {
		const {container} = renderViewer(video);
		expect(isHidden(container)).toBe(false);
		act(() => {
			jest.advanceTimersByTime(4100);
		});
		expect(isHidden(container)).toBe(true);
	});

	test('follows the video transport bar', () => {
		const {container} = renderViewer(video);
		act(() => {
			jest.advanceTimersByTime(4100);
		});
		expect(isHidden(container)).toBe(true);

		act(() => reportControls?.({available: true}));
		expect(isHidden(container)).toBe(false);

		act(() => reportControls?.({available: false}));
		expect(isHidden(container)).toBe(true);
	});

	test('photos keep their own auto-hide', () => {
		const {container} = renderViewer(photo);
		expect(isHidden(container)).toBe(false);
		act(() => {
			jest.advanceTimersByTime(4100);
		});
		expect(isHidden(container)).toBe(true);
	});
});
