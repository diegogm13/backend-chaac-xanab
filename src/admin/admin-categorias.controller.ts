import {
  Controller, Post, Put, Delete, Param, Body,
  UseGuards, UseInterceptors, UploadedFile, ParseFilePipe,
  MaxFileSizeValidator, Optional, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AdminCategoriasService } from './admin-categorias.service';
import { CreateCategoriaDto, UpdateCategoriaDto } from './dto/create-categoria.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

const ALLOWED_MIME = /^image\/(jpeg|png|webp)$/;
const imageFilter = (_req: any, file: Express.Multer.File, cb: any) => {
  ALLOWED_MIME.test(file.mimetype) ? cb(null, true) : cb(new BadRequestException('Solo se permiten imágenes jpeg, png o webp'), false);
};
const imageValidators = [new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 })];

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/categorias')
export class AdminCategoriasController {
  constructor(private readonly adminCategoriasService: AdminCategoriasService) {}

  @Post()
  @UseInterceptors(FileInterceptor('image', { storage: memoryStorage(), fileFilter: imageFilter }))
  create(
    @Body() dto: CreateCategoriaDto,
    @Optional() @UploadedFile(new ParseFilePipe({ validators: imageValidators, fileIsRequired: false }))
    file?: Express.Multer.File,
  ) {
    return this.adminCategoriasService.create(dto, file?.buffer);
  }

  @Put(':id')
  @UseInterceptors(FileInterceptor('image', { storage: memoryStorage(), fileFilter: imageFilter }))
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCategoriaDto,
    @Optional() @UploadedFile(new ParseFilePipe({ validators: imageValidators, fileIsRequired: false }))
    file?: Express.Multer.File,
  ) {
    return this.adminCategoriasService.update(id, dto, file?.buffer);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.adminCategoriasService.remove(id);
  }
}
