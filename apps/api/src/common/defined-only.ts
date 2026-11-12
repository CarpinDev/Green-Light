/** Quita los campos undefined: un campo que no llegó no se toca (null sí: es "quitar"). */
export function definedOnly<T extends object>(input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) as Partial<T>;
}
