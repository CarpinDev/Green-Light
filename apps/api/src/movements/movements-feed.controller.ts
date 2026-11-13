import { BadRequestException, Controller, DefaultValuePipe, Get, ParseIntPipe, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { DEFAULT_LIMIT, MAX_LIMIT, type MovementItem, MovementsFeedService } from './movements-feed.service';

@Controller('movements')
export class MovementsFeedController {
  constructor(private readonly feed: MovementsFeedService) {}

  /** Lo que ya pasó, del más reciente al más viejo. `limit` de 1 a 100 (20 por defecto); fuera de rango es 400. */
  @Get()
  list(
    @CurrentUser() userId: number,
    @Query('limit', new DefaultValuePipe(DEFAULT_LIMIT), ParseIntPipe) limit: number,
  ): Promise<MovementItem[]> {
    if (limit < 1 || limit > MAX_LIMIT) {
      throw new BadRequestException(`limit debe estar entre 1 y ${MAX_LIMIT}, llegó ${limit}`);
    }
    return this.feed.list(userId, limit);
  }
}
