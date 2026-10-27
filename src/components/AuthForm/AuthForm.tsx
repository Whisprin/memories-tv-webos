import React, {useCallback, useEffect, useRef, useState} from 'react';
import Button from '@enact/sandstone/Button';
import {ErrorMessage} from '../ErrorMessage';
import {QrCode} from '../QrCode/QrCode';
import {UrlInput} from '../UrlInput/UrlInput';
import {normalizeServerUrl} from '../../api/client';
import {describeMemories, pollLoginFlow, startLoginFlow} from '../../api/nextcloudAuth';
import {makeAuthErrorMessage} from '../../hooks/_authHelpers';
import type {AuthSubmitResult, AuthFormPayload} from '../../api/types';
import css from './AuthForm.module.less';

// Canonical auth-attempt types live in api/types; re-exported here for the form's consumers.
export type {AuthSubmitResult, AuthFormPayload};

interface AuthFormProps {
	initialUrl: string;
	onSubmit: (payload: AuthFormPayload) => Promise<AuthSubmitResult>;
	onBack?: () => void;
}

// Login Flow v2 tokens expire after 20 minutes.
const FLOW_TIMEOUT_MS = 20 * 60 * 1000;
const POLL_INTERVAL_MS = 2000;

interface Flow {
	baseUrl: string;
	login: string;
	token: string;
	expiresAt: number;
}

const hostOf = (url: string): string => {
	try {
		return new URL(url).host;
	} catch {
		return '';
	}
};

const formatRemaining = (ms: number): string => {
	const total = Math.max(0, Math.round(ms / 1000));
	const s = total % 60;
	return `${Math.floor(total / 60)}:${s < 10 ? '0' : ''}${s}`;
};

const LabeledField: React.FC<{label: string; children: React.ReactNode}> = ({label, children}) => (
	<div className={css.field}>
		<label className={css.label}>{label}</label>
		{children}
	</div>
);

// Sign-in in two steps: the server address, then a QR code for Nextcloud Login Flow v2.
// The user approves on their phone, so no password is typed on the TV.
export const AuthForm: React.FC<AuthFormProps> = ({initialUrl, onSubmit, onBack}) => {
	const [url, setUrl] = useState(initialUrl || 'https://');
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);
	const [flow, setFlow] = useState<Flow | null>(null);
	const [expired, setExpired] = useState(false);
	const [remaining, setRemaining] = useState(FLOW_TIMEOUT_MS);
	const submittingRef = useRef(false);

	const start = useCallback(async (baseUrl: string) => {
		setError('');
		setBusy(true);
		setExpired(false);
		try {
			const started = await startLoginFlow(baseUrl);
			setFlow({baseUrl, login: started.login, token: started.poll.token, expiresAt: Date.now() + FLOW_TIMEOUT_MS});
			setRemaining(FLOW_TIMEOUT_MS);
		} catch (e) {
			console.error('[AuthForm] could not start the login flow', e);
			setError(makeAuthErrorMessage(e));
		} finally {
			setBusy(false);
		}
	}, []);

	const handleContinue = useCallback(async () => {
		let baseUrl: string;
		try {
			baseUrl = normalizeServerUrl(url);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
			return;
		}
		setUrl(baseUrl);
		setError('');
		setBusy(true);
		try {
			await describeMemories(baseUrl);
		} catch (e) {
			console.error('[AuthForm] server check failed', e);
			setError(makeAuthErrorMessage(e));
			setBusy(false);
			return;
		}
		await start(baseUrl);
	}, [url, start]);

	const handleCancel = useCallback(() => {
		setFlow(null);
		setExpired(false);
		setError('');
	}, []);

	const handleRestart = useCallback(() => {
		if (flow) void start(flow.baseUrl);
	}, [flow, start]);

	// Poll until the user approves, the code expires, or the form leaves the QR step.
	useEffect(() => {
		if (!flow || expired) return undefined;
		const controller = new AbortController();
		let timer: ReturnType<typeof setTimeout> | undefined;

		const poll = async () => {
			const left = flow.expiresAt - Date.now();
			setRemaining(left);
			if (left <= 0) {
				setExpired(true);
				return;
			}
			try {
				const result = await pollLoginFlow(flow.baseUrl, flow.token, controller.signal);
				if (controller.signal.aborted) return;
				if (result) {
					if (submittingRef.current) return;
					submittingRef.current = true;
					setBusy(true);
					try {
						const outcome = await onSubmit({baseUrl: flow.baseUrl, loginName: result.loginName, appPassword: result.appPassword});
						if (!outcome.success) {
							setError(outcome.errorMessage);
							setFlow(null);
						}
					} finally {
						submittingRef.current = false;
						setBusy(false);
					}
					return;
				}
			} catch (e) {
				if (controller.signal.aborted) return;
				// Keep polling through a dropped connection; show why it's waiting.
				setError(makeAuthErrorMessage(e));
			}
			timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
		};

		timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
		return () => {
			controller.abort();
			if (timer) clearTimeout(timer);
		};
	}, [flow, expired, onSubmit]);

	if (flow) {
		const loginHost = hostOf(flow.login);
		const serverHost = hostOf(flow.baseUrl);
		return (
			<div className={css.root}>
				<div className={css.qrLayout}>
					<div className={css.qrBox}>{expired ? null : <QrCode value={flow.login} className={css.qr} />}</div>
					<div className={css.qrSteps}>
						<h2 className={css.qrTitle}>Sign in with your phone</h2>
						<ol className={css.steps}>
							<li>Scan the code with your phone&apos;s camera.</li>
							<li>Sign in to Nextcloud and choose Grant access.</li>
							<li>This screen continues by itself.</li>
						</ol>
						{loginHost && loginHost !== serverHost ? (
							<p className={css.warning}>
								This link points to {loginHost}, not {serverHost}. If your phone can&apos;t open it, check
								overwrite.cli.url in Nextcloud&apos;s config.php.
							</p>
						) : null}
						<p className={css.status}>
							{busy
								? 'Signing in…'
								: expired
									? 'The code expired.'
									: `Waiting for approval on your phone (code expires in ${formatRemaining(remaining)})`}
						</p>
						<div className={css.actions}>
							{expired ? (
								<Button onClick={handleRestart} disabled={busy} backgroundOpacity="opaque" autoFocus>
									New code
								</Button>
							) : null}
							<Button onClick={handleCancel} disabled={busy} backgroundOpacity="opaque" autoFocus={!expired}>
								Cancel
							</Button>
						</div>
						<ErrorMessage message={error} className={css.error} />
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className={css.root}>
			{onBack ? (
				<Button className={css.backBtn} size="small" icon="arrowsmallleft" onClick={onBack}>
					Back
				</Button>
			) : null}

			<div className={css.form}>
				<div className={css.tabContent}>
					<h2 className={css.qrTitle}>Add a Nextcloud account</h2>
					<LabeledField label="Nextcloud address">
						<UrlInput value={url} onChange={setUrl} disabled={busy} placeholder="https://cloud.example.com" autoFocus />
					</LabeledField>
					<div className={css.actions}>
						<Button onClick={handleContinue} disabled={busy} backgroundOpacity="opaque">
							{busy ? 'Checking…' : 'Continue'}
						</Button>
					</div>
				</div>

				<ErrorMessage message={error} className={css.error} />
			</div>
		</div>
	);
};
