import { Module } from '@nestjs/common';
import { DriveStorageService } from './drive-storage.service';
import { GoogleDriveCallbackController, GoogleDriveController } from './google-drive.controller';
import { GoogleDriveService } from './google-drive.service';

@Module({
  controllers: [GoogleDriveController, GoogleDriveCallbackController],
  providers: [GoogleDriveService, DriveStorageService],
  exports: [GoogleDriveService, DriveStorageService],
})
export class GoogleDriveModule {}
