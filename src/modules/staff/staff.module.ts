import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import {
  DoctorsController,
  StaffController,
  WorkspacesController,
} from './staff.controller.js';
import { StaffService } from './staff.service.js';
import { WorkspacesService } from './workspaces.service.js';

@Module({
  imports: [AccessModule],
  controllers: [StaffController, WorkspacesController, DoctorsController],
  providers: [StaffService, WorkspacesService],
})
export class StaffModule {}
