import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { CATEGORY_KINDS, type CategoryKind } from '../category-kind';

@Entity('category')
@Unique(['name', 'kind'])
export class Category {
  @PrimaryGeneratedColumn() id!: number;
  @Column() name!: string;
  @Column({ type: 'enum', enum: CATEGORY_KINDS, enumName: 'category_kind' })
  kind!: CategoryKind;
}
