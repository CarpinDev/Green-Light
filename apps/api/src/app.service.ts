import { Injectable } from '@nestjs/common';
import { formatCop, pesos } from '@greenlight/engine';

@Injectable()
export class AppService {
  getHello(): string {
    // Prueba de que la API consume el motor
    return `GreenLight: ${formatCop(pesos(1_234_567))}`;
  }
}
