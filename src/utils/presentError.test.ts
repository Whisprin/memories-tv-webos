import {APIError, TIMEOUT_REASON} from '../api/client';
import {presentError} from './presentError';

describe('presentError', () => {
	const onLine = jest.spyOn(window.navigator, 'onLine', 'get');
	afterEach(() => onLine.mockReturnValue(true));

	test('tells an offline TV from an unreachable or slow server', () => {
		onLine.mockReturnValue(false);
		expect(presentError(new APIError('Network error: Failed to fetch'))).toMatch(/TV is offline/);
		onLine.mockReturnValue(true);
		expect(presentError(new APIError('Network error: Failed to fetch'))).toMatch(/Can't reach your Nextcloud server/);
		expect(presentError(new APIError(`Network error: ${TIMEOUT_REASON}`))).toMatch(/took too long/);
	});

	test('explains server answers', () => {
		expect(presentError(new APIError('', 503))).toMatch(/maintenance mode/);
		expect(presentError(new APIError('', 500))).toMatch(/had a problem \(error 500\)/);
		expect(presentError(new APIError('', 404))).toMatch(/moved or deleted/);
		expect(presentError(new APIError('', 401))).toMatch(/Sign in again/);
		expect(presentError(new Error('boom'))).toBe('Something went wrong. Try again.');
	});
});
