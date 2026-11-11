import { IsIn } from 'class-validator';
import { CATEGORY_KINDS, type CategoryKind } from '../category-kind';

/** Los parámetros de GET /categories: el tipo es obligatorio y un valor inventado es 400. */
export class ListCategoriesQuery {
  @IsIn(CATEGORY_KINDS)
  kind!: CategoryKind;
}
