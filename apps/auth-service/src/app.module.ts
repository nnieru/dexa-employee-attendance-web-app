import { Module } from '@nestjs/common';
import { HealthModule } from '@dexa/common';

@Module({ imports: [HealthModule] })
export class AppModule {}
