import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AffiliateModule } from '../affiliate/affiliate.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { MeController } from './me.controller';

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      useFactory: () => ({
        secret: process.env.JWT_SECRET,
        signOptions: { expiresIn: '30m' },
      }),
    }),
    AffiliateModule,
  ],
  controllers: [AuthController, MeController],
  providers: [AuthService, AuthGuard],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
