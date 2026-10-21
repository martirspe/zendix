import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, Matches, IsIn, IsInt, IsOptional, IsString, Max, Min, MaxLength, ValidateNested } from 'class-validator';

class BlockStyleDto {
  @IsOptional() @IsIn(['left', 'center', 'right']) align?: string;
  @IsOptional() @IsInt() @Min(0) @Max(80) padding?: number;
  @IsOptional() @Matches(/^#[a-f\d]{6}$/i) color?: string;
  @IsOptional() @Matches(/^#[a-f\d]{6}$/i) background?: string;
  @IsOptional() @IsInt() @Min(12) @Max(64) fontSize?: number;
  @IsOptional() @IsIn(['Arial', 'Georgia', 'Verdana']) fontFamily?: string;
}

export class EmailBlockDto {
  @IsString() @MaxLength(100) id!: string;
  @IsIn(['heading', 'text', 'button', 'divider', 'spacer', 'image']) type!: string;
  @IsString() @MaxLength(50000) content!: string;
  @IsOptional() @IsString() @MaxLength(2048) url?: string;
  @IsOptional() @ValidateNested() @Type(() => BlockStyleDto) style?: BlockStyleDto;
}

export class EmailDocumentDto {
  @IsOptional() @IsString() @MaxLength(250000) html?: string;
  @IsArray() @ArrayMaxSize(200) @ValidateNested({each: true}) @Type(() => EmailBlockDto)
  blocks!: EmailBlockDto[];
}
