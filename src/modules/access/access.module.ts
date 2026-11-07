import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller.js';
import { ReferenceController } from './reference.controller.js';
import { TemplatesController } from './templates.controller.js';
import { TemplatesService } from './templates.service.js';

@Module({
  controllers: [TemplatesController, ReferenceController, AuditController],
  providers: [TemplatesService],
  exports: [TemplatesService],
})
export class AccessModule {}
