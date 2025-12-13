import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const logger = new Logger('Bootstrap')
  const port = process.env.PORT ?? 3000
  await app.listen(port)
  logger.log(`Rewards GOBLIN MODE ON @ port ${port}`)
}
bootstrap().catch((error) => {
  console.error('Error starting Rewards Goblin:', error)
  process.exit(1)
})
