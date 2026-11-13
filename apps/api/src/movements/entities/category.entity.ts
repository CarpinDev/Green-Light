import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { CATEGORY_KINDS, type CategoryKind } from '../category-kind';
import { User } from '../../users/entities/user.entity';

@Entity('category')
@Index(['userId'])
// El nombre es único por persona: dos usuarias pueden tener cada una su "Mercado"
@Unique(['userId', 'name', 'kind'])
export class Category {
  @PrimaryGeneratedColumn() id!: number;

  /** Dueño de la fila: toda consulta filtra por él. */
  @Column() userId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;
  @Column() name!: string;
  @Column({ type: 'enum', enum: CATEGORY_KINDS, enumName: 'category_kind' })
  kind!: CategoryKind;
}
