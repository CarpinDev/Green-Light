/** Qué tasa dio el usuario: la otra se calculó. */
export const RATE_SOURCES = ['ea', 'mv', 'both'] as const;
export type RateSource = (typeof RATE_SOURCES)[number];
