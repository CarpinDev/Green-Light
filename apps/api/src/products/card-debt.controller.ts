import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import type { CardPlan } from './build-card-plan';
import { CardPlanService, DEFAULT_CUTS, MAX_CUTS } from './card-plan.service';
import { OpeningDebtDto } from './dto/opening-debt.dto';
import { type OpeningDebtGroup, OpeningDebtService } from './opening-debt.service';

/** La deuda que una tarjeta ya traía y el plan de sus próximos pagos. */
@Controller('cards/:id')
export class CardDebtController {
  constructor(
    private readonly debt: OpeningDebtService,
    private readonly plans: CardPlanService,
  ) {}

  /** Los grupos actuales de la deuda inicial, para precargar el formulario. */
  @Get('opening-debt')
  list(@Param('id', ParseIntPipe) id: number): Promise<OpeningDebtGroup[]> {
    return this.debt.list(id);
  }

  /** Reemplaza la deuda inicial (de 1 a 30 grupos). 201 con los ids; 409 si hay abonos ligados a la anterior. */
  @Post('opening-debt')
  replace(@Param('id', ParseIntPipe) id: number, @Body() dto: OpeningDebtDto): Promise<{ ids: number[] }> {
    return this.debt.replace(id, dto);
  }

  /** Los próximos cortes con su mínimo y su pago total. `cuts` de 1 a 24 (6 por defecto). */
  @Get('plan')
  plan(
    @Param('id', ParseIntPipe) id: number,
    @Query('cuts', new DefaultValuePipe(DEFAULT_CUTS), ParseIntPipe) cuts: number,
  ): Promise<CardPlan> {
    if (cuts < 1 || cuts > MAX_CUTS) {
      throw new BadRequestException(`cuts debe estar entre 1 y ${MAX_CUTS}, llegó ${cuts}`);
    }
    return this.plans.plan(id, cuts);
  }
}
