import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** The body of every non-2xx response. */
export class ErrorResponseDto {
  @ApiProperty({ example: 400 })
  status_code: number;

  @ApiProperty({ example: 'Bad Request' })
  error: string;

  @ApiProperty({ example: 'Validation failed' })
  message: string;

  @ApiPropertyOptional({
    description:
      'Extra information. For validation errors, one entry per invalid field.',
    example: [{ field: 'name', errors: ['name should not be empty'] }],
  })
  details?: unknown;

  @ApiProperty({ example: '/api/v1/patients' })
  path: string;

  @ApiProperty({ description: 'Also sent as the x-request-id header.' })
  request_id: string;

  @ApiProperty({ example: '2026-10-03T08:00:00.000Z' })
  timestamp: string;
}
