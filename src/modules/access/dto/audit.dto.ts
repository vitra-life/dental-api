import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../../common/dto/page-query.dto.js';

export class ListAuditLogsQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  resource_type?: string;
}

export class AuditLogDto {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  actor_membership_id: string;
  /** Empty if the actor's user no longer exists. */
  actor_name: string;

  @ApiPropertyOptional({ type: Object })
  details: unknown;

  created_at: Date;
}

export class AuditLogPageDto {
  @ApiProperty({ type: [AuditLogDto] })
  items: AuditLogDto[];

  total: number;
  page: number;
  page_size: number;
}
