import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AppointmentsModule } from './modules/scheduling/appointments/appointments.module.js';
import { ClientsModule } from './modules/clients/clients.module.js';
import { AllExceptionsFilter } from './core/http/all-exceptions.filter.js';
import { loggerConfig } from './core/logger/logger.config.js';
import { createValidationPipe } from './core/http/validation.pipe.js';
import { Env, validateEnv } from './core/config/env.js';
import { HealthModule } from './core/health/health.module.js';
import { PrismaModule } from './core/prisma/prisma.module.js';
import { ServicesModule } from './modules/catalog/services/services.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        loggerConfig({
          NODE_ENV: config.get('NODE_ENV', { infer: true }),
          LOG_LEVEL: config.get('LOG_LEVEL', { infer: true }),
        }),
    }),
    PrismaModule,
    HealthModule,
    ServicesModule,
    ClientsModule,
    AppointmentsModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_PIPE, useFactory: createValidationPipe },
  ],
})
export class AppModule {}
