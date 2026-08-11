import { Module } from '@nestjs/common';
import { Channel3Service } from './channel3.service';
import { CacheService } from '../cache/cache.service';

@Module({
  providers: [Channel3Service, CacheService],
  exports: [Channel3Service],
})
export class Channel3Module {}
