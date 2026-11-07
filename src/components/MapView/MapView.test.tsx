import React from 'react';
import {act, fireEvent, render} from '@testing-library/react';
import {MapView} from './MapView';
import type {MapTileSource} from '../../domain/types';

const tiles: MapTileSource = {url: 'https://tile.example/{z}/{x}/{y}.png', subdomains: [], maxZoom: 19, attribution: '© OSM'};

const renderMap = () => {
	const props = {onViewChange: jest.fn(), onSelect: jest.fn()};
	const utils = render(
		<MapView id="map-canvas" tiles={tiles} dimmed={false} initialView={{lat: 47, lon: 8, zoom: 11}} clusters={[]} focused {...props} />
	);
	// the focusable wrapper has no role or text to find it by
	// eslint-disable-next-line testing-library/no-node-access
	const wrapper = document.getElementById('map-canvas')!;
	return {...utils, ...props, wrapper};
};

describe('MapView', () => {
	test('reports the initial view', () => {
		const {onViewChange} = renderMap();
		expect(onViewChange).toHaveBeenCalled();
		expect(onViewChange.mock.calls[0][0].zoom).toBe(11);
	});

	test('OK calls onSelect and CH▲ zooms in, only while the map has focus', () => {
		const {wrapper, onSelect, onViewChange} = renderMap();
		fireEvent.keyDown(window, {keyCode: 13});
		expect(onSelect).not.toHaveBeenCalled();

		act(() => wrapper.focus());
		fireEvent.keyDown(window, {keyCode: 13});
		expect(onSelect).toHaveBeenCalledTimes(1);

		onViewChange.mockClear();
		fireEvent.keyDown(window, {keyCode: 33});
		expect(onViewChange.mock.calls[onViewChange.mock.calls.length - 1][0].zoom).toBe(12);
	});
});
