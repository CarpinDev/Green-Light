import { Body, Controller, Post } from '@nestjs/common';
import { CardsService } from './cards.service';
import { CreateCardDto } from './dto/create-card.dto';

@Controller()
export class CardsController {
  constructor(private readonly cards: CardsService) {}

  /** Responde 201 con solo el id: quien lo necesite consulta la tarjeta después. */
  @Post('cards')
  async create(@Body() dto: CreateCardDto): Promise<{ id: number }> {
    const { id } = await this.cards.create(dto);
    return { id };
  }
}
