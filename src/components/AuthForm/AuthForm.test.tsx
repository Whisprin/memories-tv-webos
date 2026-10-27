import React from 'react';
import {act, render, screen, fireEvent, waitFor} from '@testing-library/react';
import {APIError} from '../../api/client';
import {AuthForm} from './AuthForm';

// Sandstone primitives don't work in jsdom — mock them.
jest.mock('@enact/sandstone/Input', () => ({
	__esModule: true,
	default: ({value, onChange, placeholder, disabled, autoFocus, type}: any) => (
		<input
			value={value ?? ''}
			placeholder={placeholder}
			disabled={disabled}
			autoFocus={autoFocus}
			type={type}
			onChange={e => onChange?.({value: e.target.value})}
		/>
	),
}));

jest.mock('@enact/sandstone/Button', () => ({
	__esModule: true,
	default: ({children, onClick, disabled, 'aria-label': ariaLabel}: any) => (
		<button onClick={onClick} disabled={disabled} aria-label={ariaLabel}>
			{children}
		</button>
	),
}));

jest.mock('@enact/sandstone/BodyText', () => {
	const Comp = ({children, className}: any) => <span className={className}>{children}</span>;
	return {__esModule: true, default: Comp, BodyText: Comp};
});

jest.mock('@enact/sandstone/Icon', () => {
	const Comp = ({children}: any) => <span>{children}</span>;
	return {__esModule: true, default: Comp, Icon: Comp};
});

// Canvas isn't implemented in jsdom; the QR code's content is checked through its value.
jest.mock('../QrCode/QrCode', () => ({
	QrCode: ({value}: {value: string}) => <div data-testid="qr" data-value={value} />,
}));

jest.mock('../../api/nextcloudAuth', () => ({
	describeMemories: jest.fn(),
	startLoginFlow: jest.fn(),
	pollLoginFlow: jest.fn(),
}));

import {describeMemories, pollLoginFlow, startLoginFlow} from '../../api/nextcloudAuth';

const mockDescribe = describeMemories as jest.MockedFunction<typeof describeMemories>;
const mockStart = startLoginFlow as jest.MockedFunction<typeof startLoginFlow>;
const mockPoll = pollLoginFlow as jest.MockedFunction<typeof pollLoginFlow>;

const LOGIN_URL = 'https://cloud.example/login/v2/flow/abc';

beforeEach(() => {
	mockDescribe.mockReset().mockResolvedValue({version: '7.5.0'});
	mockStart.mockReset().mockResolvedValue({poll: {token: 'tok', endpoint: 'https://cloud.example/login/v2/poll'}, login: LOGIN_URL});
	mockPoll.mockReset().mockResolvedValue(null);
});

afterEach(() => {
	jest.useRealTimers();
});

const continueWith = (url: string) => {
	fireEvent.change(screen.getByPlaceholderText(/cloud\.example\.com/), {target: {value: url}});
	fireEvent.click(screen.getByRole('button', {name: /Continue/i}));
};

describe('AuthForm', () => {
	test('pre-fills URL from initialUrl prop, https:// otherwise', () => {
		const {unmount} = render(<AuthForm initialUrl="https://prefilled" onSubmit={async () => ({success: true})} />);
		expect(screen.getByDisplayValue('https://prefilled')).toBeTruthy();
		unmount();
		render(<AuthForm initialUrl="" onSubmit={async () => ({success: true})} />);
		expect(screen.getByDisplayValue('https://')).toBeTruthy();
	});

	test('rejects an empty address without calling the server', async () => {
		render(<AuthForm initialUrl="" onSubmit={async () => ({success: true})} />);
		fireEvent.click(screen.getByRole('button', {name: /Continue/i}));
		expect(await screen.findByText(/Enter your Nextcloud address/)).toBeTruthy();
		expect(mockDescribe).not.toHaveBeenCalled();
	});

	test('checks Memories on the normalized address, then shows the QR code', async () => {
		render(<AuthForm initialUrl="" onSubmit={async () => ({success: true})} />);
		continueWith('cloud.example/index.php/apps/memories/');
		expect(await screen.findByText('Sign in with your phone')).toBeTruthy();
		expect(mockDescribe).toHaveBeenCalledWith('https://cloud.example');
		expect(mockStart).toHaveBeenCalledWith('https://cloud.example');
		expect(screen.getByTestId('qr').getAttribute('data-value')).toBe(LOGIN_URL);
		// Only as the QR code: the link is too long to read or type from the TV.
		expect(screen.queryByText(LOGIN_URL)).toBeNull();
	});

	test('explains when Memories is not found', async () => {
		mockDescribe.mockRejectedValue(new APIError('Memories not found (404)', 404));
		render(<AuthForm initialUrl="" onSubmit={async () => ({success: true})} />);
		continueWith('https://cloud.example');
		expect(await screen.findByText(/Memories was not found/)).toBeTruthy();
		expect(mockStart).not.toHaveBeenCalled();
	});

	test('submits the app password once the user approves', async () => {
		jest.useFakeTimers();
		mockPoll.mockResolvedValueOnce(null).mockResolvedValue({server: 'https://cloud.example', loginName: 'alice', appPassword: 'secret'});
		const onSubmit = jest.fn().mockResolvedValue({success: true});
		render(<AuthForm initialUrl="" onSubmit={onSubmit} />);
		continueWith('https://cloud.example');
		await screen.findByText('Sign in with your phone');
		for (let i = 0; i < 3 && onSubmit.mock.calls.length === 0; i++) {
			await act(async () => {
				jest.advanceTimersByTime(2100);
			});
		}
		await waitFor(() =>
			expect(onSubmit).toHaveBeenCalledWith({baseUrl: 'https://cloud.example', loginName: 'alice', appPassword: 'secret'}),
		);
		expect(mockPoll).toHaveBeenCalledWith('https://cloud.example', 'tok', expect.anything());
	});

	test('Cancel returns to the address step', async () => {
		render(<AuthForm initialUrl="" onSubmit={async () => ({success: true})} />);
		continueWith('https://cloud.example');
		await screen.findByText('Sign in with your phone');
		fireEvent.click(screen.getByRole('button', {name: /Cancel/i}));
		expect(await screen.findByRole('button', {name: /Continue/i})).toBeTruthy();
	});

	test('Back button triggers onBack only when callback provided', () => {
		const onBack = jest.fn();
		const {rerender} = render(
			<AuthForm initialUrl="" onSubmit={async () => ({success: true})} onBack={onBack} />,
		);
		fireEvent.click(screen.getByRole('button', {name: /Back/i}));
		expect(onBack).toHaveBeenCalled();

		rerender(<AuthForm initialUrl="" onSubmit={async () => ({success: true})} />);
		expect(screen.queryByRole('button', {name: /Back/i})).toBeNull();
	});
});
