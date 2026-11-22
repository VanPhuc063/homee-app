import { Body, Controller, Post } from '@nestjs/common';
import { IsEmail, IsOptional, IsString, Length, Matches, MinLength } from 'class-validator';
import { AuthService } from './auth.service';

class RegisterDto {
  @IsString() @Length(1, 60) name: string;
  @IsEmail({}, { message: 'Email không hợp lệ' }) email: string;
  @IsString() @MinLength(6, { message: 'Mật khẩu tối thiểu 6 ký tự' }) password: string;
  @IsOptional() @IsString() referralCode?: string;
}

class LoginDto {
  @IsEmail({}, { message: 'Email không hợp lệ' }) email: string;
  @IsString() password: string;
}

class RequestOtpDto {
  @Matches(/^(0|\+84)\d{9,10}$/, { message: 'Số điện thoại không hợp lệ' })
  phone: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  referralCode?: string;
}

class VerifyOtpDto {
  @IsString()
  phone: string;

  @Length(6, 6)
  code: string;
}

class RefreshDto {
  @IsString()
  refreshToken: string;
}

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  // Luồng chính (mockup): Email + Mật khẩu. SĐT+OTP bên dưới vẫn còn nguyên làm lối vào thay thế.
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Post('otp/request')
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.auth.requestOtp(dto.phone, dto.name, dto.referralCode);
  }

  @Post('otp/verify')
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.auth.verifyOtp(dto.phone, dto.code);
  }

  @Post('refresh')
  async refresh(@Body() dto: RefreshDto) {
    const payload = await this.auth.verifyRefreshToken(dto.refreshToken);
    return this.auth.refresh(payload.sub, dto.refreshToken);
  }
}
