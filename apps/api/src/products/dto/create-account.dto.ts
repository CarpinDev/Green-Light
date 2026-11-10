import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { IsIsoDate } from '../../common/validators';
import { ACCOUNT_TYPES, type AccountType } from '../account-type';
import type { CreateAccountInput } from '../accounts.service';

export class CreateAccountDto implements CreateAccountInput {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  bank!: string;

  @Matches(/^\d{4}$/)
  last4!: string;

  @IsIn(ACCOUNT_TYPES)
  accountType!: AccountType;

  /** Puede ser negativo (sobregiro): sin @Min(0). */
  @IsOptional()
  @IsInt()
  @Min(Number.MIN_SAFE_INTEGER)
  @Max(Number.MAX_SAFE_INTEGER)
  openingBalanceCents?: number;

  /** Fecha del saldo inicial; va junto con openingBalanceCents (lo revisa el service). */
  @IsOptional()
  @IsIsoDate()
  asOf?: string;
}
