import { Body, Controller, Post } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';

@Controller()
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  /** Responde 201 con solo el id. 409 si ya existe ese nombre con ese tipo. */
  @Post('categories')
  async create(@Body() dto: CreateCategoryDto): Promise<{ id: number }> {
    const { id } = await this.categories.create(dto);
    return { id };
  }
}
