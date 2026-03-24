import { Module } from '@nestjs/common';
import { LinksExternosService } from './links-externos.service';
import { LinksExternosController } from './links-externos.controller';

@Module({
  controllers: [LinksExternosController],
  providers: [LinksExternosService],
})
export class LinksExternosModule {}
