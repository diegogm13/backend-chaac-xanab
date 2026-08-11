import { Body, Controller, Get, Put, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto, ChangePasswordDto } from './dto/update-profile.dto';
import { DireccionDto } from './dto/direccion.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtPayload } from './strategies/jwt.strategy';
import { getClientIp } from '../common/get-client-ip';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Get('verify-email')
  verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Post('verify-email-token')
  verifyEmailByToken(@Body('accessToken') accessToken: string) {
    return this.authService.verifyEmailByToken(accessToken);
  }

  @Post('resend-verification')
  resendVerification(@Body('email') email: string) {
    return this.authService.resendVerification(email);
  }

  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, this.metaFrom(req));
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.authService.logout(user.sub, user.email, this.metaFrom(req));
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@CurrentUser() user: JwtPayload) {
    return this.authService.getMe(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Put('me')
  updateMe(@CurrentUser() user: JwtPayload, @Body() dto: UpdateProfileDto) {
    return this.authService.updateMe(user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Put('me/password')
  changePassword(@CurrentUser() user: JwtPayload, @Body() dto: ChangePasswordDto, @Req() req: Request) {
    return this.authService.changePassword(user.sub, dto, this.metaFrom(req));
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/direccion')
  getDireccion(@CurrentUser() user: JwtPayload) {
    return this.authService.getDireccion(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Put('me/direccion')
  upsertDireccion(@CurrentUser() user: JwtPayload, @Body() dto: DireccionDto) {
    return this.authService.upsertDireccion(user.sub, dto);
  }

  private metaFrom(req: Request) {
    return { ip: getClientIp(req), userAgent: req.headers['user-agent'] };
  }
}
