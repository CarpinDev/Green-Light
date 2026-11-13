import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './auth/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /** El health check: abierto, para que un monitor pueda llamarlo sin token. */
  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
