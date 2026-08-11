import { Request } from 'express';

/** Extrae la IP real del cliente, considerando proxies (Vercel, etc.) */
export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip ?? req.socket?.remoteAddress ?? 'desconocida';
}
