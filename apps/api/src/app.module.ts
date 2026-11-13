import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { validateEnv } from './config/env.validation';
import { typeOrmConfig } from './database/typeorm.config';
import { ProductsModule } from './products/products.module';
import { MovementsModule } from './movements/movements.module';
import { IncomesModule } from './incomes/incomes.module';
import { SettingsModule } from './settings/settings.module';
import { ProjectionModule } from './projection/projection.module';
import { StatementsModule } from './statements/statements.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    // validate corre al arrancar: sin JWT_SECRET o INVITE_CODE válidos, la API no inicia
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ...typeOrmConfig((key) => config.get<string>(key)),
        autoLoadEntities: true,
      }),
    }),
    ProductsModule,
    MovementsModule,
    IncomesModule,
    SettingsModule,
    ProjectionModule,
    StatementsModule,
    UsersModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
