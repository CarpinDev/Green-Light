export const PRODUCT_KINDS = ['credit_card', 'loan', 'account'] as const;
export type ProductKind = (typeof PRODUCT_KINDS)[number];
