import {useCallback, useSyncExternalStore} from 'react';

// Whether the viewer plays a live or motion photo's video by itself when the photo opens, or
// only with its Live button. A viewing preference kept on this TV, like the map style.
const KEY = 'memoriestv_motion_autoplay';

const listeners = new Set<() => void>();

export function getMotionAutoplay(): boolean {
	try {
		return localStorage.getItem(KEY) !== 'off';
	} catch {
		return true;
	}
}

export function saveMotionAutoplay(on: boolean): void {
	try {
		localStorage.setItem(KEY, on ? 'on' : 'off');
	} catch {
		// ignore: the choice still applies until the app restarts
	}
	listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};

export function useMotionAutoplay(): [boolean, (on: boolean) => void] {
	const on = useSyncExternalStore(subscribe, getMotionAutoplay);
	const set = useCallback((next: boolean) => saveMotionAutoplay(next), []);
	return [on, set];
}
