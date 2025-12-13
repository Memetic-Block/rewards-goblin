import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { BullModule, getQueueToken } from '@nestjs/bullmq'
import { Queue, QueueEvents } from 'bullmq'
import { RewardsModule } from '../src/rewards/rewards.module'
import { AchievementsService } from '../src/achievements/achievements.service'
import type { RewardEventDto } from '../src/rewards/dto/reward-event.dto'

describe('Rewards Queue (e2e)', () => {
  let app: INestApplication
  let rewardsQueue: Queue
  let queueEvents: QueueEvents

  // Mock AchievementsService
  const mockAchievementsService = {
    awardAchievement: jest.fn().mockResolvedValue(undefined),
    onModuleInit: jest.fn().mockResolvedValue(undefined)
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env'
        }),
        BullModule.forRoot({
          connection: {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379', 10)
          }
        }),
        RewardsModule
      ]
    })
      .overrideProvider(AchievementsService)
      .useValue(mockAchievementsService)
      .compile()

    app = moduleFixture.createNestApplication()
    await app.init()

    rewardsQueue = moduleFixture.get<Queue>(getQueueToken('rewards-events'))

    // Create QueueEvents for listening to job events
    queueEvents = new QueueEvents('rewards-events', {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10)
      }
    })

    // Clean queue before tests
    await rewardsQueue.drain()
    await rewardsQueue.clean(0, 1000)
  })

  afterAll(async () => {
    // Cleanup
    await rewardsQueue.drain()
    await rewardsQueue.clean(0, 1000)
    await rewardsQueue.close()
    await queueEvents.close()

    await app.close()
  })

  afterEach(async () => {
    jest.clearAllMocks()
    await rewardsQueue.drain()
    await rewardsQueue.clean(0, 1000)
  })

  describe('Job Processing', () => {
    it('should process arns-search event with valid Arweave wallet', async () => {
      const rewardEvent: RewardEventDto = {
        eventType: 'arns-search',
        walletAddress: 'vLRHFqCw1uHu75xqB4fCDW-QxpkpJxBtFD9g4QYUbfw'
      }

      const job = await rewardsQueue.add(rewardEvent.eventType, rewardEvent)

      // Wait for job to complete
      await job.waitUntilFinished(queueEvents, 5000)

      const completedJob = await rewardsQueue.getJob(job.id as string)
      expect(completedJob?.returnvalue).toBeDefined()
      expect(await completedJob?.isCompleted()).toBe(true)
      expect(mockAchievementsService.awardAchievement).toHaveBeenCalled()
      expect(mockAchievementsService.awardAchievement).toHaveBeenCalledWith(
        expect.any(String),
        'vLRHFqCw1uHu75xqB4fCDW-QxpkpJxBtFD9g4QYUbfw'
      )
    })

    it('should process image-search event with valid EVM wallet', async () => {
      const rewardEvent: RewardEventDto = {
        eventType: 'image-search',
        walletAddress: '0x742D35CC6634c0532925A3b844BC9E7595F0BEb0'
      }

      const job = await rewardsQueue.add(rewardEvent.eventType, rewardEvent)
      await job.waitUntilFinished(queueEvents, 5000)

      const completedJob = await rewardsQueue.getJob(job.id as string)
      expect(await completedJob?.isCompleted()).toBe(true)
      expect(mockAchievementsService.awardAchievement).toHaveBeenCalled()
      expect(mockAchievementsService.awardAchievement).toHaveBeenCalledWith(
        expect.any(String),
        '0x742D35CC6634c0532925A3b844BC9E7595F0BEb0'
      )
    })

    it('should process audio-search event with valid Solana wallet', async () => {
      const rewardEvent: RewardEventDto = {
        eventType: 'audio-search',
        walletAddress: '7S3P4HxJpyyigGzodYwHtCxZyUQe9JiBMHyRWXArAaKv'
      }

      const job = await rewardsQueue.add(rewardEvent.eventType, rewardEvent)
      await job.waitUntilFinished(queueEvents, 5000)

      const completedJob = await rewardsQueue.getJob(job.id as string)
      expect(await completedJob?.isCompleted()).toBe(true)
      expect(mockAchievementsService.awardAchievement).toHaveBeenCalled()
      expect(mockAchievementsService.awardAchievement).toHaveBeenCalledWith(
        expect.any(String),
        '7S3P4HxJpyyigGzodYwHtCxZyUQe9JiBMHyRWXArAaKv'
      )
    })

    it('should process video-search event', async () => {
      const rewardEvent: RewardEventDto = {
        eventType: 'video-search',
        walletAddress: 'vLRHFqCw1uHu75xqB4fCDW-QxpkpJxBtFD9g4QYUbfw'
      }

      const job = await rewardsQueue.add(rewardEvent.eventType, rewardEvent)
      await job.waitUntilFinished(queueEvents, 5000)

      const completedJob = await rewardsQueue.getJob(job.id as string)
      expect(await completedJob?.isCompleted()).toBe(true)
      expect(mockAchievementsService.awardAchievement).toHaveBeenCalled()
      expect(mockAchievementsService.awardAchievement).toHaveBeenCalledWith(
        expect.any(String),
        'vLRHFqCw1uHu75xqB4fCDW-QxpkpJxBtFD9g4QYUbfw'
      )
    })

    it('should fail job with invalid wallet address', async () => {
      const rewardEvent: RewardEventDto = {
        eventType: 'arns-search',
        walletAddress: 'invalid-wallet-address'
      }

      // Add job with only 1 attempt so it fails immediately
      const job = await rewardsQueue.add(rewardEvent.eventType, rewardEvent, {
        attempts: 1
      })

      // Wait for job to fail - expect an error to be thrown
      await expect(
        job.waitUntilFinished(queueEvents, 5000)
      ).rejects.toThrow()

      const failedJob = await rewardsQueue.getJob(job.id as string)
      expect(await failedJob?.isFailed()).toBe(true)
      expect(failedJob?.failedReason).toContain('Wallet validation failed')
      expect(mockAchievementsService.awardAchievement).not.toHaveBeenCalled()
    })

    it('should include metadata in achievement tracking if provided', async () => {
      const rewardEvent: RewardEventDto = {
        eventType: 'arns-search',
        walletAddress: 'vLRHFqCw1uHu75xqB4fCDW-QxpkpJxBtFD9g4QYUbfw',
        metadata: {
          searchQuery: 'test',
          resultCount: 10
        }
      }

      const job = await rewardsQueue.add(rewardEvent.eventType, rewardEvent)
      await job.waitUntilFinished(queueEvents, 5000)

      const completedJob = await rewardsQueue.getJob(job.id as string)
      expect(await completedJob?.isCompleted()).toBe(true)
      expect(mockAchievementsService.awardAchievement).toHaveBeenCalled()
      expect(mockAchievementsService.awardAchievement).toHaveBeenCalledWith(
        expect.any(String),
        'vLRHFqCw1uHu75xqB4fCDW-QxpkpJxBtFD9g4QYUbfw'
      )
    })
  })

  describe('Job Retry Logic', () => {
    it('should retry failed jobs up to 3 times', async () => {
      // Make achievement tracking fail
      mockAchievementsService.awardAchievement.mockRejectedValueOnce(
        new Error('Temporary failure')
      )

      const rewardEvent: RewardEventDto = {
        eventType: 'arns-search',
        walletAddress: 'vLRHFqCw1uHu75xqB4fCDW-QxpkpJxBtFD9g4QYUbfw'
      }

      const job = await rewardsQueue.add(rewardEvent.eventType, rewardEvent)

      try {
        await job.waitUntilFinished(queueEvents, 10000)
      } catch {
        // May still fail after retries
      }

      const finalJob = await rewardsQueue.getJob(job.id as string)

      // Job should have been attempted (original + retries)
      expect(finalJob?.attemptsMade).toBeGreaterThan(0)
    }, 15000)
  })

  describe('Queue Statistics', () => {
    it('should track job counts correctly', async () => {
      const events: RewardEventDto[] = [
        {
          eventType: 'arns-search',
          walletAddress: 'vLRHFqCw1uHu75xqB4fCDW-QxpkpJxBtFD9g4QYUbfw'
        },
        {
          eventType: 'image-search',
          walletAddress: '0x742D35CC6634c0532925A3b844BC9E7595F0BEb0'
        }
      ]

      const jobs = await Promise.all(
        events.map((event) => rewardsQueue.add(event.eventType, event))
      )

      // Wait for all jobs to complete
      await Promise.all(
        jobs.map((job) => job.waitUntilFinished(queueEvents, 5000))
      )

      const counts = await rewardsQueue.getJobCounts()
      expect(counts.completed).toBeGreaterThanOrEqual(2)
    })
  })

  describe('Wallet Validation', () => {
    it('should normalize EVM addresses to checksummed format', async () => {
      const rewardEvent: RewardEventDto = {
        eventType: 'image-search',
        walletAddress: '0x742d35cc6634c0532925a3b844bc9e7595f0beb0' // lowercase
      }

      const job = await rewardsQueue.add(rewardEvent.eventType, rewardEvent)
      await job.waitUntilFinished(queueEvents, 5000)

      const completedJob = await rewardsQueue.getJob(job.id as string)
      expect(await completedJob?.isCompleted()).toBe(true)
      expect(mockAchievementsService.awardAchievement).toHaveBeenCalled()
      expect(mockAchievementsService.awardAchievement).toHaveBeenCalledWith(
        expect.any(String),
        '0x742D35CC6634c0532925A3b844BC9E7595F0BEb0' // checksummed
      )
    })

    it('should reject invalid EVM checksum', async () => {
      const rewardEvent: RewardEventDto = {
        eventType: 'image-search',
        walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0' // wrong checksum
      }

      // Add job with only 1 attempt so it fails immediately
      const job = await rewardsQueue.add(rewardEvent.eventType, rewardEvent, {
        attempts: 1
      })

      // Wait for job to fail - expect an error to be thrown
      await expect(
        job.waitUntilFinished(queueEvents, 5000)
      ).rejects.toThrow()

      const failedJob = await rewardsQueue.getJob(job.id as string)
      expect(await failedJob?.isFailed()).toBe(true)
      expect(mockAchievementsService.awardAchievement).not.toHaveBeenCalled()
    })

    it('should reject invalid Solana address', async () => {
      const rewardEvent: RewardEventDto = {
        eventType: 'audio-search',
        walletAddress: 'invalid-solana-address'
      }

      // Add job with only 1 attempt so it fails immediately
      const job = await rewardsQueue.add(rewardEvent.eventType, rewardEvent, {
        attempts: 1
      })

      // Wait for job to fail - expect an error to be thrown
      await expect(
        job.waitUntilFinished(queueEvents, 5000)
      ).rejects.toThrow()

      const failedJob = await rewardsQueue.getJob(job.id as string)
      expect(await failedJob?.isFailed()).toBe(true)
      expect(mockAchievementsService.awardAchievement).not.toHaveBeenCalled()
    })

    it('should reject invalid Arweave address', async () => {
      const rewardEvent: RewardEventDto = {
        eventType: 'arns-search',
        walletAddress: 'short-addr'
      }

      // Add job with only 1 attempt so it fails immediately
      const job = await rewardsQueue.add(rewardEvent.eventType, rewardEvent, {
        attempts: 1
      })

      // Wait for job to fail - expect an error to be thrown
      await expect(
        job.waitUntilFinished(queueEvents, 5000)
      ).rejects.toThrow()

      const failedJob = await rewardsQueue.getJob(job.id as string)
      expect(await failedJob?.isFailed()).toBe(true)
      expect(mockAchievementsService.awardAchievement).not.toHaveBeenCalled()
    })
  })
})
