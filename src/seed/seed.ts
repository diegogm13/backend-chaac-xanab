import * as dotenv from 'dotenv';
dotenv.config();

import * as bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

async function seed() {
  const url        = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email       = process.env.SEED_ADMIN_EMAIL;
  const password    = process.env.SEED_ADMIN_PASSWORD;

  if (!url || !serviceKey || !email || !password) {
    console.error('Faltan SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_ADMIN_EMAIL o SEED_ADMIN_PASSWORD en .env');
    process.exit(1);
  }

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: existing } = await db
    .from('usuarios')
    .select('id, role')
    .eq('email', email.toLowerCase())
    .maybeSingle();

  if (existing) {
    console.log(`El usuario ${email} ya existe (id: ${existing.id}, role: ${existing.role}). No se hizo nada.`);
    return;
  }

  const password_hash = await bcrypt.hash(password, 10);

  const { data, error } = await db
    .from('usuarios')
    .insert({
      name: 'Administrador',
      email: email.toLowerCase(),
      password_hash,
      role: 'admin',
      email_verified: true,
      activo: true,
    })
    .select('id, email, role')
    .single();

  if (error) {
    console.error('Error creando el usuario admin:', error.message);
    process.exit(1);
  }

  console.log('Usuario admin creado:', data);
}

seed();
