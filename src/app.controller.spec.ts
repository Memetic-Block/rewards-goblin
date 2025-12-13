import { Test, TestingModule } from '@nestjs/testing'
import { AppController } from './app.controller'
import { getQueueToken } from '@nestjs/bullmq'

describe('AppController', () => {
  let appController: AppController

  beforeEach(async () => {
    const mockQueue = {
      getJobCounts: jest.fn().mockResolvedValue({
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0
      })
    }

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: getQueueToken('rewards-events'),
          useValue: mockQueue
        }
      ]
    }).compile()

    appController = app.get<AppController>(AppController)
  })

  describe('root', () => {
    it('should return health check with queue status', async () => {
      const result = await appController.getHealth()
      expect(result).toHaveProperty('status', 'ok')
      expect(result).toHaveProperty('service', 'rewards-goblin')
      expect(result).toHaveProperty('queue')
    })
  })
})
