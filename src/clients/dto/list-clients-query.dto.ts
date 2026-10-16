import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../common/dto/page-query.dto.js';

export class ListClientsQueryDto extends PageQueryDto {
  /**
   * Search words, separated by spaces. Every word must appear in the first
   * name, last name, phone or national id.
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
