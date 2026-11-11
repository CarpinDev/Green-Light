import { Injectable } from '@nestjs/common';
import { isoDateOf } from '../common/dates';
import { type SimulationCandidate, type SimulationOutcome, buildSimulation } from './build-simulation';
import { ProjectionService } from './projection.service';

/** Sin cuántos meses, se proyectan 6 (el valor por defecto del motor). */
export const DEFAULT_SIMULATION_MONTHS = 6;

export interface SimulationInput extends Omit<SimulationCandidate, 'date'> {
  /** Sin fecha, la compra es de hoy. */
  date?: string;
  months?: number;
}

/** Carga las filas y llama a buildSimulation: no escribe nada en la base. */
@Injectable()
export class SimulationsService {
  constructor(private readonly projection: ProjectionService) {}

  async simulate(input: SimulationInput): Promise<SimulationOutcome> {
    const today = isoDateOf();
    const { date = today, months = DEFAULT_SIMULATION_MONTHS, ...rest } = input;
    return buildSimulation(await this.projection.loadFacts(), { ...rest, date }, months, today);
  }
}
