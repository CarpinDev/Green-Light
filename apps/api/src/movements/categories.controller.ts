import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { type CategorySummary, CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { ListCategoriesQuery } from './dto/list-categories.query';

@Controller()
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  /** Las categorías de un tipo, por nombre: GET /categories?kind=expense. Un tipo inventado es 400. */
  @Get('categories')
  list(@Query() query: ListCategoriesQuery): Promise<CategorySummary[]> {
    return this.categories.list(query.kind);
  }

  /** Responde 201 con solo el id. 409 si ya existe ese nombre con ese tipo. */
  @Post('categories')
  async create(@Body() dto: CreateCategoryDto): Promise<{ id: number }> {
    const { id } = await this.categories.create(dto);
    return { id };
  }
}
