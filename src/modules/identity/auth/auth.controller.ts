import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
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
import {
  MeDto,
  TokensDto,
  WorkspaceSwitchDto,
} from './dto/auth-response.dto.js';
import {
  ChangePasswordDto,
  LoginDto,
  RefreshDto,
  SwitchWorkspaceDto,
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
  login(@Body() dto: LoginDto, @Req() request: Request) {
    // Read from the request rather than @Headers(), which Swagger would list as a required parameter.
    return this.auth.login(dto, request.headers['user-agent']);
  }

  /** Exchanges a refresh token for new tokens. Each refresh token works once. */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: TokensDto })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refresh_token);
  }

  /**
   * Chooses the workspace (and so the clinic) to work in; returns a new
   * access token. 403 if the workspace isn't the user's or isn't active.
   */
  @Post('switch-workspace')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOkResponse({ type: WorkspaceSwitchDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  switchWorkspace(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: SwitchWorkspaceDto,
  ) {
    return this.auth.switchWorkspace(auth, dto.workspace_id);
  }

  /** The signed-in user, their clinics and workspaces, and the active workspace's permissions. */
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
