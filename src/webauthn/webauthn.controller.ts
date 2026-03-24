import { Controller, Post, Body } from '@nestjs/common';
import { WebAuthnService } from './webauthn.service';
import {
  RegisterChallengeDto,
  RegisterVerifyDto,
  LoginChallengeDto,
  LoginVerifyDto,
} from './dto/webauthn.dto';

@Controller('webauthn')
export class WebAuthnController {
  constructor(private readonly webAuthnService: WebAuthnService) {}

  @Post('register-challenge')
  registerChallenge(@Body() dto: RegisterChallengeDto) {
    return this.webAuthnService.generateRegistrationChallenge(dto);
  }

  @Post('register-verify')
  registerVerify(@Body() dto: RegisterVerifyDto) {
    return this.webAuthnService.verifyRegistration(dto);
  }

  @Post('login-challenge')
  loginChallenge(@Body() dto: LoginChallengeDto) {
    return this.webAuthnService.generateLoginChallenge(dto);
  }

  @Post('login-verify')
  loginVerify(@Body() dto: LoginVerifyDto) {
    return this.webAuthnService.verifyLogin(dto);
  }
}
