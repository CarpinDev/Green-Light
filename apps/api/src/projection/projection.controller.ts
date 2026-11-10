import { BadRequestException, Controller, DefaultValuePipe, Get, ParseIntPipe, Query } from '@nestjs/common';
import type { ProjectionResult } from './build-projection';
import { ProjectionService } from './projection.service';

const MIN_MONTHS = 1;
const MAX_MONTHS = 24;

@Controller('projection')
export class ProjectionController {
  constructor(private readonly projection: ProjectionService) {}

  /** ¿Llego a fin de mes? Proyecta el disponible mes a mes con su semáforo (3 meses por defecto). */
  @Get()
  get(@Query('months', new DefaultValuePipe(3), ParseIntPipe) months: number): Promise<ProjectionResult> {
    if (months < MIN_MONTHS || months > MAX_MONTHS) {
      throw new BadRequestException(`months debe estar entre ${MIN_MONTHS} y ${MAX_MONTHS}, llegó ${months}`);
    }
    return this.projection.project(months);
  }
}
