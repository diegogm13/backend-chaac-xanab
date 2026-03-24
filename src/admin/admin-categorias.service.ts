import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { CacheService } from '../cache/cache.service';
import { CreateCategoriaDto, UpdateCategoriaDto } from './dto/create-categoria.dto';

@Injectable()
export class AdminCategoriasService {
  constructor(
    private readonly supabase:   SupabaseService,
    private readonly cloudinary: CloudinaryService,
    private readonly cache:      CacheService,
  ) {}

  async create(dto: CreateCategoriaDto, imageBuffer?: Buffer): Promise<unknown> {
    let image_url: string | undefined;
    if (imageBuffer) {
      image_url = await this.cloudinary.uploadBuffer(
        imageBuffer,
        'chaac-xanab/categorias',
      );
    }

    const { data, error } = await this.supabase.db
      .from('categorias')
      .insert({ ...dto, image_url })
      .select('*')
      .single();

    if (error) throw new BadRequestException(error.message);
    this.cache.delByPrefix('categorias:');
    return data;
  }

  async update(id: string, dto: UpdateCategoriaDto, imageBuffer?: Buffer): Promise<unknown> {
    const { data: existing } = await this.supabase.db
      .from('categorias')
      .select('id, image_url')
      .eq('id', id)
      .maybeSingle();

    if (!existing) throw new NotFoundException('Categoría no encontrada');

    const updates: Record<string, unknown> = { ...dto };

    if (imageBuffer) {
      updates['image_url'] = await this.cloudinary.uploadBuffer(
        imageBuffer,
        'chaac-xanab/categorias',
      );
      if (existing.image_url) {
        await this.cloudinary.deleteByUrl(existing.image_url);
      }
    }

    const { data, error } = await this.supabase.db
      .from('categorias')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw new BadRequestException(error.message);
    this.cache.delByPrefix('categorias:');
    return data;
  }

  async remove(id: string): Promise<{ message: string }> {
    const { data: existing } = await this.supabase.db
      .from('categorias')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (!existing) throw new NotFoundException('Categoría no encontrada');

    const { error } = await this.supabase.db
      .from('categorias')
      .delete()
      .eq('id', id);

    if (error) throw new BadRequestException(error.message);
    this.cache.delByPrefix('categorias:');
    return { message: 'Categoría eliminada correctamente' };
  }
}
