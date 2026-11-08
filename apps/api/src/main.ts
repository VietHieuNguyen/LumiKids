import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  DatabaseConfig,
  databaseConfig,
} from './common/config/database.config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get<DatabaseConfig>(databaseConfig.KEY);
  await app.listen(config.port);
}

void bootstrap();

