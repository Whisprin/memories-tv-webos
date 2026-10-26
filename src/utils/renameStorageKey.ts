// Moves a localStorage entry saved under an earlier key (the immich-tv names this app started
// with) to its current key, once. Storage errors are ignored: the default then applies.
export function renameStorageKey(oldKey: string, newKey: string): void {
	try {
		const old = localStorage.getItem(oldKey);
		if (old === null) return;
		if (localStorage.getItem(newKey) === null) localStorage.setItem(newKey, old);
		localStorage.removeItem(oldKey);
	} catch {
		// Storage unavailable.
	}
}
