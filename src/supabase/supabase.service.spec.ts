import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from './supabase.service';

describe('SupabaseService', () => {
  let service: SupabaseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupabaseService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              const map: Record<string, string> = {
                SUPABASE_URL: 'https://test.supabase.co',
                SUPABASE_SERVICE_ROLE_KEY: 'test-key',
              };
              if (!map[key]) throw new Error(`Missing env: ${key}`);
              return map[key];
            },
          },
        },
      ],
    }).compile();

    service = module.get<SupabaseService>(SupabaseService);
  });

  it('should initialize the Supabase client', () => {
    expect(service).toBeDefined();
    expect(service.db).toBeDefined();
  });

  it('should expose the db client with expected methods', () => {
    expect(typeof service.db.from).toBe('function');
  });
});
