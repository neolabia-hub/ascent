import { Global, Module } from '@nestjs/common';
import { MediaController } from './media.controller.js';
import { StorageService } from './storage.service.js';

/** Global: cualquier modulo que maneje archivos usa StorageService sin volver a importarlo. */
@Global()
@Module({
  controllers: [MediaController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
