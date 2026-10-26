import React from 'react';
import {render, screen, fireEvent} from '@testing-library/react';
import type {Account} from '../../utils/accountsStore';
import {AccountCard} from './AccountCard';

const acc: Account = {
	id: 'a',
	baseUrl: 'https://cloud.home.local',
	loginName: 'me',
	appPassword: 'pw',
	displayName: 'Me Myself',
	addedAt: 1,
};

describe('AccountCard', () => {
	test('renders the derived label and baseUrl', () => {
		render(<AccountCard account={acc} isActive={false} isDefault={false} onSelect={() => {}} />);
		expect(screen.getByText('Me Myself')).toBeTruthy();
		expect(screen.getByText('cloud.home.local')).toBeTruthy();
	});

	test('shows the host once when it is already the label', () => {
		const nameless: Account = {id: 'b', baseUrl: 'https://cloud.home.local', loginName: '', appPassword: 'pw', addedAt: 1};
		render(<AccountCard account={nameless} isActive={false} isDefault={false} onSelect={() => {}} />);
		expect(screen.getAllByText('cloud.home.local')).toHaveLength(1);
	});

	test('shows DEFAULT badge when isDefault', () => {
		render(<AccountCard account={acc} isActive={false} isDefault onSelect={() => {}} />);
		expect(screen.getByText('DEFAULT')).toBeTruthy();
	});

	test('clicking the card calls onSelect', () => {
		const onSelect = jest.fn();
		render(<AccountCard account={acc} isActive={false} isDefault={false} onSelect={onSelect} />);
		fireEvent.click(screen.getByText('Me Myself').closest('[role="button"]')!);
		expect(onSelect).toHaveBeenCalledWith('a');
	});
});
