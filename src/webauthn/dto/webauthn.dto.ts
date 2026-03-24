import { IsEmail, IsString, IsNotEmpty } from 'class-validator';

export class RegisterChallengeDto {
  @IsEmail()
  email: string;

  @IsString() @IsNotEmpty()
  displayName: string;
}

export class RegisterVerifyDto {
  @IsEmail()
  email: string;

  @IsString() @IsNotEmpty()
  credentialId: string;       // base64url

  @IsString() @IsNotEmpty()
  clientDataJSON: string;     // base64url

  @IsString() @IsNotEmpty()
  attestationObject: string;  // base64url
}

export class LoginChallengeDto {
  @IsEmail()
  email: string;
}

export class LoginVerifyDto {
  @IsEmail()
  email: string;

  @IsString() @IsNotEmpty()
  credentialId: string;       // base64url

  @IsString() @IsNotEmpty()
  clientDataJSON: string;     // base64url

  @IsString() @IsNotEmpty()
  authenticatorData: string;  // base64url

  @IsString() @IsNotEmpty()
  signature: string;          // base64url
}
