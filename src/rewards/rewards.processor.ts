import { Logger } from '@nestjs/common'
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { WalletType, WalletValidator } from '../utils/wallet.validator'
import {
  ACHIEVEMENT_WUZZY_ARNS_SEARCHER,
  ACHIEVEMENT_WUZZY_AUDIO_SEARCHER,
  ACHIEVEMENT_WUZZY_IMAGE_SEARCHER,
  ACHIEVEMENT_WUZZY_SEARCHER,
  ACHIEVEMENT_WUZZY_VIDEO_SEARCHER,
  AchievementsService
} from '../achievements/achievements.service'
import type { RewardEventType } from './dto/reward-event.dto'

interface RewardEventData {
  eventType: RewardEventType
  walletAddress: string
  metadata?: Record<string, any>
}

@Processor('rewards-events')
export class RewardsProcessor extends WorkerHost {
  private readonly logger = new Logger(RewardsProcessor.name)

  constructor(private readonly achievementsService: AchievementsService) {
    super()
  }

  async process(job: Job<RewardEventData>): Promise<any> {
    this.logger.debug(
      `Processing job ${job.id} - ${job.name}, attempt ${job.attemptsMade + 1}/${job.opts.attempts}`
    )

    try {
      // Validate wallet address for all job types
      const validation = WalletValidator.validateAndNormalize(
        job.data.walletAddress
      )

      if (!validation.valid) {
        throw new Error(`Wallet validation failed: ${validation.error}`)
      }

      this.logger.debug(
        `Wallet validated: ${validation.type} - ${validation.normalized}`
      )

      // Ensure we have normalized wallet and type (should always be true if valid)
      if (!validation.normalized || !validation.type) {
        throw new Error('Validation succeeded but missing normalized data')
      }

      // Route to appropriate handler based on job name
      const result = await this.handleEvent(
        job,
        validation.normalized,
        validation.type
      )

      this.logger.log(`Job ${job.id} completed successfully`)
      return result
    } catch (error) {
      const err = error as Error
      this.logger.error(
        `Job ${job.id} failed on attempt ${job.attemptsMade + 1}: ${err.message}`,
        err.stack
      )
      throw error // Re-throw to trigger retry
    }
  }

  /**
   * Route to the appropriate handler based on job name
   */
  private async handleEvent(
    job: Job<RewardEventData>,
    normalizedWallet: string,
    walletType: WalletType
  ): Promise<Record<string, unknown>> {
    switch (job.name) {
      case 'arns-search':
        return this.handleArnsSearch(job, normalizedWallet, walletType)
      case 'image-search':
        return this.handleImageSearch(job, normalizedWallet, walletType)
      case 'audio-search':
        return this.handleAudioSearch(job, normalizedWallet, walletType)
      case 'video-search':
        return this.handleVideoSearch(job, normalizedWallet, walletType)
      default:
        throw new Error(`Unknown job type: ${job.name}`)
    }
  }

  /**
   * Handle ARNS search reward event
   */
  private async handleArnsSearch(
    job: Job<RewardEventData>,
    normalizedWallet: string,
    walletType: WalletType
  ): Promise<Record<string, unknown>> {
    this.logger.log(
      `Processing ARNS search for wallet ${normalizedWallet} (${walletType})`
    )

    await this.achievementsService.awardAchievement(
      ACHIEVEMENT_WUZZY_SEARCHER,
      normalizedWallet
    )
    await this.achievementsService.awardAchievement(
      ACHIEVEMENT_WUZZY_ARNS_SEARCHER,
      normalizedWallet
    )

    return Promise.resolve({
      success: true,
      eventType: 'arns-search',
      wallet: normalizedWallet,
      walletType,
      processedAt: new Date().toISOString(),
      metadata: job.data.metadata
    })
  }

  /**
   * Handle image search reward event
   */
  private async handleImageSearch(
    job: Job<RewardEventData>,
    normalizedWallet: string,
    walletType: string
  ): Promise<Record<string, unknown>> {
    this.logger.log(
      `Processing image search for wallet ${normalizedWallet} (${walletType})`
    )

    await this.achievementsService.awardAchievement(
      ACHIEVEMENT_WUZZY_SEARCHER,
      normalizedWallet
    )
    await this.achievementsService.awardAchievement(
      ACHIEVEMENT_WUZZY_IMAGE_SEARCHER,
      normalizedWallet
    )

    return Promise.resolve({
      success: true,
      eventType: 'image-search',
      wallet: normalizedWallet,
      walletType,
      processedAt: new Date().toISOString(),
      metadata: job.data.metadata
    })
  }

  /**
   * Handle audio search reward event
   */
  private async handleAudioSearch(
    job: Job<RewardEventData>,
    normalizedWallet: string,
    walletType: string
  ): Promise<Record<string, unknown>> {
    this.logger.log(
      `Processing audio search for wallet ${normalizedWallet} (${walletType})`
    )

    await this.achievementsService.awardAchievement(
      ACHIEVEMENT_WUZZY_SEARCHER,
      normalizedWallet
    )
    await this.achievementsService.awardAchievement(
      ACHIEVEMENT_WUZZY_AUDIO_SEARCHER,
      normalizedWallet
    )

    return Promise.resolve({
      success: true,
      eventType: 'audio-search',
      wallet: normalizedWallet,
      walletType,
      processedAt: new Date().toISOString(),
      metadata: job.data.metadata
    })
  }

  /**
   * Handle video search reward event
   */
  private async handleVideoSearch(
    job: Job<RewardEventData>,
    normalizedWallet: string,
    walletType: string
  ): Promise<Record<string, unknown>> {
    this.logger.log(
      `Processing video search for wallet ${normalizedWallet} (${walletType})`
    )

    await this.achievementsService.awardAchievement(
      ACHIEVEMENT_WUZZY_SEARCHER,
      normalizedWallet
    )
    await this.achievementsService.awardAchievement(
      ACHIEVEMENT_WUZZY_VIDEO_SEARCHER,
      normalizedWallet
    )

    return Promise.resolve({
      success: true,
      eventType: 'video-search',
      wallet: normalizedWallet,
      walletType,
      processedAt: new Date().toISOString(),
      metadata: job.data.metadata
    })
  }

  /**
   * Handle job completion event
   */
  @OnWorkerEvent('completed')
  onCompleted(job: Job<RewardEventData>, result: Record<string, unknown>) {
    this.logger.debug(
      `Job ${job.id} (${job.name}) completed. Result: ${JSON.stringify(result)}`
    )
  }

  /**
   * Handle job failure event
   */
  @OnWorkerEvent('failed')
  onFailed(job: Job<RewardEventData>, error: Error) {
    const maxAttempts = job.opts?.attempts || 1
    if (job.attemptsMade >= maxAttempts) {
      this.logger.error(
        `Job ${job.id} (${job.name}) exhausted all ${maxAttempts} retry attempts. Final error: ${error.message}`,
        error.stack
      )
      // TODO: Send to dead letter queue or alert system
    } else {
      this.logger.warn(
        `Job ${job.id} (${job.name}) failed, will retry. Attempt ${job.attemptsMade}/${maxAttempts}`
      )
    }
  }

  /**
   * Handle active job event
   */
  @OnWorkerEvent('active')
  onActive(job: Job<RewardEventData>) {
    this.logger.debug(`Job ${job.id} (${job.name}) is now active`)
  }
}
