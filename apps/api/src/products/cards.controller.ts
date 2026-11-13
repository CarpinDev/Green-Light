import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { type CardSummary, CardsService } from './cards.service';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';

@Controller()
export class CardsController {
  constructor(private readonly cards: CardsService) {}

  /** Responde 201 con solo el id: quien lo necesite consulta la tarjeta después. */
  @Post('cards')
  async create(@CurrentUser() userId: number, @Body() dto: CreateCardDto): Promise<{ id: number }> {
    const { id } = await this.cards.create(userId, dto);
    return { id };
  }

  /** Las tarjetas activas con su tasa vigente (ea y mv como texto). */
  @Get('cards')
  list(@CurrentUser() userId: number): Promise<CardSummary[]> {
    return this.cards.listActive(userId);
  }

  /** Edita lo que llega; 404 si no existe, no es tuya o no es una tarjeta. */
  @Patch('cards/:id')
  update(
    @CurrentUser() userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCardDto,
  ): Promise<{ id: number }> {
    return this.cards.update(userId, id, dto);
  }
}
