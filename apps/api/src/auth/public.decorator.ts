import { SetMetadata } from '@nestjs/common';

/** La llave bajo la que se guarda la marca en los metadatos de la ruta. */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marca una ruta (o un controller entero) como abierta: el guard global la deja pasar sin token.
 *
 * Es un decorador de METADATA: no hace nada por sí solo, solo deja una etiqueta pegada a la clase o al método
 * (SetMetadata). Quien la lee es el guard, con Reflector, justo antes de ejecutar la ruta.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
