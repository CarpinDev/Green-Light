import { Module } from '@nestjs/common';
import { ProjectionController } from './projection.controller';
import { ProjectionService } from './projection.service';
import { SimulationsController } from './simulations.controller';
import { SimulationsService } from './simulations.service';

@Module({
  controllers: [ProjectionController, SimulationsController],
  providers: [ProjectionService, SimulationsService],
})
export class ProjectionModule {}
