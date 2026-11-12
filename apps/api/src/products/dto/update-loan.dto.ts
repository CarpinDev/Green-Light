import { IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import type { UpdateLoanInput } from '../loans.service';

// El PATCH no acepta el capital, las cuotas ni la primera fecha (cambiarlas reescribe la historia de los abonos):
// con forbidNonWhitelisted, mandarlos es 400. La tasa se cambia con POST /products/:id/rates.
// `null` en la cuota o en el porcentaje significa "quitar": IsOptional deja pasar null y undefined.

export class UpdateLoanDto implements UpdateLoanInput {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  bank?: string;

  @IsOptional()
  @Matches(/^\d{4}$/)
  last4?: string;

  /** La cuota del banco sin seguro; null para que la calcule el motor. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  fixedPaymentCents?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  insuranceCents?: number;

  /** Seguro como porcentaje mensual del saldo ("0.2344"); null lo quita. */
  @IsOptional()
  @Matches(/^\d{1,2}(\.\d{1,4})?$/, { message: 'insuranceRatePct debe ser un porcentaje como 0.2344' })
  insuranceRatePct?: string | null;
}
