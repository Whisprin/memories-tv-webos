import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react';
import {MapStyleSetting} from './MapStyleSetting';
import {getMapStyle, saveMapStyle} from '../../utils/mapViewStore';

describe('MapStyleSetting', () => {
	beforeEach(() => localStorage.clear());

	test('shows the styles, OpenStreetMap chosen by default', () => {
		render(<MapStyleSetting />);
		expect(screen.getByRole('button', {name: /^OpenStreetMap$/}).getAttribute('aria-pressed')).toBe('true');
		expect(screen.getByRole('button', {name: /OpenTopoMap/}).getAttribute('aria-pressed')).toBe('false');
	});

	test('choosing a style saves it and marks it', () => {
		render(<MapStyleSetting />);
		fireEvent.click(screen.getByRole('button', {name: /OpenTopoMap/}));
		expect(getMapStyle()).toBe('topo');
		expect(screen.getByRole('button', {name: /OpenTopoMap/}).getAttribute('aria-pressed')).toBe('true');
	});

	test('follows a style saved elsewhere', () => {
		render(<MapStyleSetting />);
		React.act(() => saveMapStyle('osm-dimmed'));
		expect(screen.getByRole('button', {name: /dimmed/}).getAttribute('aria-pressed')).toBe('true');
	});
});
