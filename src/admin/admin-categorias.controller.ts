import {
  Controller, Post, Put, Delete, Param, Body,
  UseGuards, UseInterceptors, UploadedFile, ParseFilePipe,
  MaxFileSizeValidator, FileTypeValidator, Optional,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AdminCategoriasService } from './admin-categorias.service';
import { CreateCategoriaDto, UpdateCategoriaDto } from './dto/create-categoria.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

const imageValidators = [
  new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
  new FileTypeValidator({ fileType: /image\/(jpeg|png|webp)/ }),
];

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/categorias')
export class AdminCategoriasController {
  constructor(private readonly adminCategoriasService: AdminCategoriasService) {}

  @Post()
  @UseInterceptors(FileInterceptor('image', { storage: memoryStorage() }))
  create(
    @Body() dto: CreateCategoriaDto,
    @Optional() @UploadedFile(new ParseFilePipe({ validators: imageValidators, fileIsRequired: false }))
    file?: Express.Multer.File,
  ) {
    return this.adminCategoriasService.create(dto, file?.buffer);
  }

  @Put(':id')
  @UseInterceptors(FileInterceptor('image', { storage: memoryStorage() }))
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
