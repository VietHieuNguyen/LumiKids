import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChildLoginDto {
  /** Format is checked by normalizeLoginCode (case, spaces and hyphens are tolerated). */
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  code!: string;
}
