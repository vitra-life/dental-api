import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller.js';
import { ReferenceController } from './reference.controller.js';
import { RolesController } from './roles.controller.js';
import { RolesService } from './roles.service.js';

@Module({
  controllers: [RolesController, ReferenceController, AuditController],
  providers: [RolesService],
})
export class AccessModule {}
