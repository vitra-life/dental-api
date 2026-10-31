import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthContext } from '../../../common/auth/auth-request.js';
import {
  AllowTemporaryPassword,
  CurrentAuth,
  Public,
} from '../../../common/auth/decorators.js';
import { ErrorResponseDto } from '../../../core/http/error-response.dto.js';
import { AuthService } from './auth.service.js';
import { AccessTokenDto, MeDto, TokensDto } from './dto/auth-response.dto.js';
import {
  ChangePasswordDto,
  LoginDto,
  RefreshDto,
  SwitchClinicDto,
} from './dto/auth.dto.js';

@ApiTags('auth')
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Signs in with mobile and password. Five wrong passwords in a row lock the account for 15 minutes. */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: TokensDto })
  login(@Body() dto: LoginDto, @Headers('user-agent') userAgent?: string) {
    return this.auth.login(dto, userAgent);
  }

  /** Exchanges a refresh token for new tokens. Each refresh token works once. */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: TokensDto })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refresh_token);
  }

  /** Chooses the clinic to work in; returns a new access token. */
  @Post('switch-clinic')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOkResponse({ type: AccessTokenDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  switchClinic(@CurrentAuth() auth: AuthContext, @Body() dto: SwitchClinicDto) {
    return this.auth.switchClinic(auth, dto.clinic_id);
  }

  /** The signed-in user, their clinics, and their permissions in the active clinic. */
  @AllowTemporaryPassword()
  @Get('me')
  @ApiBearerAuth()
  @ApiOkResponse({ type: MeDto })
  me(@CurrentAuth() auth: AuthContext) {
    return this.auth.me(auth);
  }

  /** Sets a new password and signs out the user's other devices. */
  @AllowTemporaryPassword()
  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiNoContentResponse()
  changePassword(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.auth.changePassword(auth, dto);
  }

  @AllowTemporaryPassword()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiNoContentResponse()
  logout(@CurrentAuth() auth: AuthContext) {
    return this.auth.logout(auth);
  }
}
