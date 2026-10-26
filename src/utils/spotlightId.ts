// Spotlight only resolves string ids made of [A-Za-z0-9_-], and names are free text: every
// other character (underscore included, so the encoding stays reversible) becomes _ + 6 hex digits.
export const spotlightSafe = (text: string): string =>
	text.replace(/[^A-Za-z0-9-]/gu, (char) => '_' + char.codePointAt(0)!.toString(16).padStart(6, '0'));
