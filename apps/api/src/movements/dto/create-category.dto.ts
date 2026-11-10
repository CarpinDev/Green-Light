import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { CATEGORY_KINDS, type CategoryKind } from '../category-kind';
import type { CreateCategoryInput } from '../categories.service';

export class CreateCategoryDto implements CreateCategoryInput {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsIn(CATEGORY_KINDS)
  kind!: CategoryKind;
}
