import { Module } from '@nestjs/common';
import { WebAuthnService } from './webauthn.service';
import { WebAuthnController } from './webauthn.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule], // para JwtService
  controllers: [WebAuthnController],
  providers: [WebAuthnService],
})
export class WebAuthnModule {}
