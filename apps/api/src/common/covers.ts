/** `true` si el arreglo A cubre todos los valores de la unión T. */
export type Covers<T, A extends readonly T[]> = [Exclude<T, A[number]>] extends [never] ? true : false;

/** Falla al compilar si T es `false`. */
export type MustBeTrue<T extends true> = T;
