export const ACCOUNT_TYPES = ['savings', 'checking'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];
