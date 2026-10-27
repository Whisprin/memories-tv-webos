import React from 'react';
import {act, fireEvent, render, screen} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
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
	default: ({onClick, icon, children}: {onClick?: () => void; icon?: string; children?: React.ReactNode}) => (
		<button aria-label={icon} onClick={onClick}>
			{children}
		</button>
	),
}));

jest.mock('../MediaInfo/MediaInfo', () => ({MediaInfo: () => <span>info</span>}));

const mockOpenInTv = jest.fn();
jest.mock('../../platform/tvPhotoViewer', () => ({openInTvPhotoViewer: (photos: unknown) => mockOpenInTv(photos)}));

const video: TimelineAsset = {id: '7', type: 'VIDEO', ratio: 16 / 9, localDateTime: '2026-03-01T12:00:00.000Z', durationSeconds: 30};
const photo: TimelineAsset = {...video, id: '8', type: 'IMAGE', durationSeconds: null};

const getAssetDetails = jest.fn();
const repository = {
	previewUrl: (id: string) => `preview:${id}`,
	videoPlaybackUrl: (id: string) => `video:${id}`,
	getAssetDetails,
	fullResolutionUrl: (a: TimelineAsset) => `full:${a.id}`,
} as unknown as PhotoRepository;

const renderViewer = (asset: TimelineAsset, onClose: () => void = () => {}) =>
	render(
		<QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
			<RepositoryProvider repository={repository}>
				<MediaViewer
					getAssetAt={() => asset}
					totalCount={1}
					currentIndex={0}
					position="1 / 1"
					onClose={onClose}
					onNavigate={() => {}}
					onStartSlideshow={() => {}}
				/>
			</RepositoryProvider>
		</QueryClientProvider>,
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

describe('MediaViewer info panel', () => {
	const details = {
		fileName: '20261027_120000.jpg',
		fileSize: 4_200_000,
		width: 4000,
		height: 3000,
		megapixels: 12,
		camera: 'samsung SM-S921B',
		lens: null,
		exposure: ['f/1.8', '1/120', '6.3mm', 'ISO 50'],
		place: 'Berlin, Germany',
		people: ['Anna'],
		unnamedPeople: 1,
		tags: ['Holiday'],
	};
	const infoButton = () => screen.getByRole('button', {name: 'info'});
	const pressBack = () => fireEvent.keyDown(window, {keyCode: 461});

	beforeEach(() => getAssetDetails.mockReset().mockResolvedValue(details));

	test('Info shows the photo\'s details, and Info again hides them', async () => {
		renderViewer(photo);
		expect(screen.queryByLabelText('Photo info')).toBeNull();

		fireEvent.click(infoButton());
		expect(await screen.findByText('Berlin, Germany')).toBeTruthy();
		expect(getAssetDetails).toHaveBeenCalledWith('8');
		expect(screen.getByText('Anna, 1 unnamed person')).toBeTruthy();
		expect(screen.getByText('Holiday')).toBeTruthy();
		expect(screen.getByText('samsung SM-S921B')).toBeTruthy();
		expect(screen.getByText('12.0 MP · 4000 × 3000 · 4.2 MB')).toBeTruthy();

		fireEvent.click(infoButton());
		expect(screen.queryByLabelText('Photo info')).toBeNull();
	});

	test('Back closes the panel first, then the viewer', async () => {
		const onClose = jest.fn();
		renderViewer(photo, onClose);
		fireEvent.click(infoButton());
		await screen.findByText('Berlin, Germany');

		pressBack();
		expect(screen.queryByLabelText('Photo info')).toBeNull();
		expect(onClose).not.toHaveBeenCalled();

		pressBack();
		expect(onClose).toHaveBeenCalled();
	});
});

describe('MediaViewer Show in 4K', () => {
	const assets: TimelineAsset[] = [
		{...photo, id: '1', fileName: 'IMG_1.jpg'},
		{...video, id: '2'},
		{...photo, id: '3', fileName: 'IMG_3.dng'},
		{...photo, id: '4'},
	];

	test('hands this photo and the following ones, without videos, to the TV photo viewer', () => {
		mockOpenInTv.mockReset().mockResolvedValue(undefined);
		render(
			<QueryClientProvider client={new QueryClient()}>
				<RepositoryProvider repository={repository}>
					<MediaViewer
						getAssetAt={(i) => assets[i] ?? null}
						totalCount={assets.length}
						currentIndex={0}
						position="1 / 4"
						onClose={() => {}}
						onNavigate={() => {}}
						onStartSlideshow={() => {}}
					/>
				</RepositoryProvider>
			</QueryClientProvider>,
		);
		fireEvent.click(screen.getByRole('button', {name: '4K'}));
		expect(mockOpenInTv).toHaveBeenCalledWith([
			{url: 'full:1', fileName: 'IMG_1.jpg'},
			{url: 'full:3', fileName: 'IMG_3.dng'},
			{url: 'full:4', fileName: '4.jpg'},
		]);
	});
});
