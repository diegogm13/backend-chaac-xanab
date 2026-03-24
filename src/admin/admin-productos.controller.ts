import {
  Controller, Get, Post, Put, Delete, Patch, Param, Body,
  UseGuards, UseInterceptors, UploadedFile, ParseFilePipe,
  MaxFileSizeValidator, FileTypeValidator, Optional,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AdminProductosService } from './admin-productos.service';
import { CreateProductoDto, UpdateProductoDto, AjusteStockDto } from './dto/create-producto.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

const imageValidators = [
  new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5 MB
  new FileTypeValidator({ fileType: /image\/(jpeg|png|webp)/ }),
];

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/productos')
export class AdminProductosController {
  constructor(private readonly adminProductosService: AdminProductosService) {}

  @Get()
  findAll() {
    return this.adminProductosService.findAll();
  }

  @Post()
  @UseInterceptors(FileInterceptor('image', { storage: memoryStorage() }))
  create(
    @Body() dto: CreateProductoDto,
    @Optional() @UploadedFile(new ParseFilePipe({ validators: imageValidators, fileIsRequired: false }))
    file?: Express.Multer.File,
  ) {
    return this.adminProductosService.create(dto, file?.buffer);
  }

  @Put(':id')
  @UseInterceptors(FileInterceptor('image', { storage: memoryStorage() }))
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductoDto,
    @Optional() @UploadedFile(new ParseFilePipe({ validators: imageValidators, fileIsRequired: false }))
    file?: Express.Multer.File,
  ) {
    return this.adminProductosService.update(id, dto, file?.buffer);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.adminProductosService.remove(id);
  }

  @Patch(':id/stock')
  ajustarStock(@Param('id') id: string, @Body() dto: AjusteStockDto) {
    return this.adminProductosService.ajustarStock(id, dto);
  }
}
