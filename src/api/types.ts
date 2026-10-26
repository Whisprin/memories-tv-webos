// One shared result for every sign-in path; keep it single-source to avoid drift.
export type AuthSubmitResult = {success: true} | {success: false; errorMessage: string};

// What the sign-in form hands to useAccounts once Login Flow v2 has produced an app password.
export interface AuthFormPayload {
	baseUrl: string;
	loginName: string;
	appPassword: string;
}
