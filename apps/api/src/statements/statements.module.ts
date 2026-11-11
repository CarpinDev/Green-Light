import { Module } from '@nestjs/common';
import { StatementChecksController } from './statement-checks.controller';
import { StatementChecksService } from './statement-checks.service';

@Module({
  controllers: [StatementChecksController],
  providers: [StatementChecksService],
})
export class StatementsModule {}
