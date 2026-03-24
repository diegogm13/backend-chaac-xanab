import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';

@Injectable()
export class CloudinaryService {
  constructor(private readonly config: ConfigService) {
    cloudinary.config({
      cloud_name: this.config.getOrThrow('CLOUDINARY_CLOUD_NAME'),
      api_key:    this.config.getOrThrow('CLOUDINARY_API_KEY'),
      api_secret: this.config.getOrThrow('CLOUDINARY_API_SECRET'),
    });
  }

  /**
   * Sube un buffer en memoria a Cloudinary.
   * @param buffer  - Buffer del archivo (multer lo provee en memoria)
   * @param folder  - Carpeta destino en Cloudinary, ej. 'chaac-xanab/productos'
   * @returns URL segura (https) de la imagen subida
   */
  async uploadBuffer(buffer: Buffer, folder: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'image',
          transformation: [
            { quality: 'auto', fetch_format: 'auto' }, // optimización automática
          ],
        },
        (error: Error | undefined, result: UploadApiResponse | undefined) => {
          if (error || !result) {
            reject(new BadRequestException('Error al subir imagen a Cloudinary'));
            return;
          }
          resolve(result.secure_url);
        },
      );
      stream.end(buffer);
    });
  }

  /**
   * Elimina una imagen de Cloudinary por su public_id.
   * Extrae el public_id desde la URL si se pasa la URL completa.
   */
  async deleteByUrl(imageUrl: string): Promise<void> {
    try {
      // Extrae el public_id desde la URL de Cloudinary
      // Formato: https://res.cloudinary.com/<cloud>/image/upload/v123/<folder>/<name>.ext
      const parts = imageUrl.split('/');
      const uploadIdx = parts.indexOf('upload');
      if (uploadIdx === -1) return;
      // Salta la versión (vXXXX) si existe
      const afterUpload = parts.slice(uploadIdx + 1);
      const withoutVersion = afterUpload[0]?.startsWith('v') ? afterUpload.slice(1) : afterUpload;
      const publicIdWithExt = withoutVersion.join('/');
      const publicId = publicIdWithExt.replace(/\.[^/.]+$/, ''); // quita extensión
      await cloudinary.uploader.destroy(publicId);
    } catch {
      // Fallo silencioso en delete — no bloquea la operación principal
    }
  }
}
