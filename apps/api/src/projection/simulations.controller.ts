import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SimulationOutcome } from './build-simulation';
import { SimulatePurchaseDto } from './dto/simulate-purchase.dto';
import { SimulationsService } from './simulations.service';

@Controller('simulations')
export class SimulationsController {
  constructor(private readonly simulations: SimulationsService) {}

  /** ¿Puedo comprar esto? No guarda nada: por eso responde 200, no 201. */
  @Post()
  @HttpCode(200)
  simulate(@CurrentUser() userId: number, @Body() dto: SimulatePurchaseDto): Promise<SimulationOutcome> {
    return this.simulations.simulate(userId, dto);
  }
}
