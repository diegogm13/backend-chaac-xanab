import { Controller, Delete, Post, Query, UseGuards } from '@nestjs/common';
import { ReindexadoService } from './reindexado.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/busqueda')
export class ReindexadoController {
  constructor(private readonly reindexadoService: ReindexadoService) {}

  /**
   * Reconstruye el índice de Elasticsearch desde cero con el catálogo real.
   * ?demo=true además vuelve a agregar los 4 productos de ejemplo (apagado por defecto).
   */
  @Post('reindexar')
  reindexar(@Query('demo') demo?: string) {
    return this.reindexadoService.reindexarTodo(demo === 'true');
  }

  /** Quita del índice los productos de ejemplo. */
  @Delete('demo')
  quitarDemo() {
    return this.reindexadoService.quitarProductosDemo();
  }
}
