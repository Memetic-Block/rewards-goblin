import { Controller, Get } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'

@Controller()
export class AppController {
  constructor(
    @InjectQueue('rewards-events')
    private readonly rewardsQueue: Queue
  ) {}

  @Get()
  async getHealth() {
    const jobCounts = await this.rewardsQueue.getJobCounts(
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed'
    )

    return {
      status: 'ok',
      service: 'rewards-goblin',
      timestamp: new Date().toISOString(),
      queue: {
        name: 'rewards-events',
        counts: jobCounts
      }
    }
  }
}
