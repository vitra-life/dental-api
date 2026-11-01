import { Module } from '@nestjs/common';
import { StaffAssignmentsService } from './staff-assignments.service.js';
import {
  DoctorsController,
  StaffAssignmentsController,
  StaffController,
} from './staff.controller.js';
import { StaffService } from './staff.service.js';

@Module({
  controllers: [StaffController, StaffAssignmentsController, DoctorsController],
  providers: [StaffService, StaffAssignmentsService],
})
export class StaffModule {}
