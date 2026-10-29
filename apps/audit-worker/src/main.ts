import 'reflect-metadata';
import { bootstrapService } from '@dexa/common';
import { AppModule } from './app.module.js';

await bootstrapService({ module: AppModule, defaultPort: 3005 });
