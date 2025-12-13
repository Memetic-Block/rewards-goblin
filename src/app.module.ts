import { Logger, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { BullModule } from '@nestjs/bullmq'
import type { ConnectionOptions } from 'bullmq'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { RewardsModule } from './rewards/rewards.module'
import { AchievementsModule } from './achievements/achievements.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (
        config: ConfigService<{
          REDIS_MODE: string
          REDIS_HOST: string
          REDIS_PORT: number
          REDIS_MASTER_NAME: string
          REDIS_SENTINEL_1_HOST: string
          REDIS_SENTINEL_1_PORT: number
          REDIS_SENTINEL_2_HOST: string
          REDIS_SENTINEL_2_PORT: number
          REDIS_SENTINEL_3_HOST: string
          REDIS_SENTINEL_3_PORT: number
        }>
      ) => {
        const logger = new Logger(AppModule.name)
        const redisMode =
          config.get('REDIS_MODE', { infer: true }) ?? 'standalone'

        let connection: ConnectionOptions = {
          host: config.get('REDIS_HOST', { infer: true }) as string,
          port: config.get('REDIS_PORT', { infer: true }) as number
        }

        if (redisMode === 'sentinel') {
          const name = config.get('REDIS_MASTER_NAME', {
            infer: true
          }) as string
          const sentinels = [
            {
              host: config.get('REDIS_SENTINEL_1_HOST', {
                infer: true
              }) as string,
              port: config.get('REDIS_SENTINEL_1_PORT', {
                infer: true
              }) as number
            },
            {
              host: config.get('REDIS_SENTINEL_2_HOST', {
                infer: true
              }) as string,
              port: config.get('REDIS_SENTINEL_2_PORT', {
                infer: true
              }) as number
            },
            {
              host: config.get('REDIS_SENTINEL_3_HOST', {
                infer: true
              }) as string,
              port: config.get('REDIS_SENTINEL_3_PORT', {
                infer: true
              }) as number
            }
          ]
          connection = { sentinels, name }
        }

        logger.log(`Connecting to Redis with mode ${redisMode}`)
        logger.log(`Connection: ${JSON.stringify(connection)}`)

        return { connection }
      }
    }),
    RewardsModule,
    AchievementsModule
  ],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}
