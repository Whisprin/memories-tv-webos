import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react';
import {MotionPhotoSetting} from './MotionPhotoSetting';
import {getMotionAutoplay, saveMotionAutoplay} from '../../utils/motionPhotoStore';

describe('MotionPhotoSetting', () => {
	beforeEach(() => localStorage.clear());

	const onOpen = () => screen.getByRole('button', {name: /Play when opened/});
	const onButton = () => screen.getByRole('button', {name: /Live button only/});

	test('plays when opened by default', () => {
		render(<MotionPhotoSetting />);
		expect(onOpen().getAttribute('aria-pressed')).toBe('true');
		expect(onButton().getAttribute('aria-pressed')).toBe('false');
	});

	test('choosing the button only saves it and marks it', () => {
		render(<MotionPhotoSetting />);
		fireEvent.click(onButton());
		expect(getMotionAutoplay()).toBe(false);
		expect(onButton().getAttribute('aria-pressed')).toBe('true');
		fireEvent.click(onOpen());
		expect(getMotionAutoplay()).toBe(true);
	});

	test('follows a choice saved elsewhere', () => {
		render(<MotionPhotoSetting />);
		React.act(() => saveMotionAutoplay(false));
		expect(onButton().getAttribute('aria-pressed')).toBe('true');
	});
});
