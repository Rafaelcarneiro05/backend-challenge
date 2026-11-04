import { defineConfig } from '@mikro-orm/postgresql';

export default defineConfig({
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: Number(process.env.DATABASE_PORT ?? 5433),
  user: process.env.DATABASE_USER ?? 'wagering',
  password: process.env.DATABASE_PASSWORD ?? 'wagering',
  dbName: process.env.DATABASE_NAME ?? 'wagering',
  entities: ['src/infrastructure/persistence/entities/*.entity.ts'],
  migrations: {
    path: 'src/infrastructure/persistence/migrations',
    glob: '!(*.d).{js,ts}',
  },
});
