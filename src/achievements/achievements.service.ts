import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createDataItemSigner } from '@permaweb/aoconnect'
import { DryRunResult } from '@permaweb/aoconnect/dist/lib/dryrun'
import { JWKInterface } from 'arweave/node/lib/wallet'
import Arweave from 'arweave'
import { readFileSync } from 'fs'
import { sendAosMessage, sendAosDryRun } from '../utils/aos'

interface CheeseMint {
  id: string
  name: string
  created_at: number
  updated_at?: number
  created_by: string
  description: string
  points: number
  icon: string
  category: string
}

interface CheeseMintAward {
  awarded_by: string
  awarded_at: number
  message_id: string
}

interface CheeseMintsById {
  [cheeseMintId: string]: CheeseMint
}

interface CheeseMintsByAddress {
  [address: string]: {
    [cheeseMintId: string]: CheeseMintAward
  }
}

interface CheeseMintCollectionACLState {
  roles: { [role: string]: { [address: string]: boolean } }
}

interface CheeseMintCollectionState {
  owner: string
  acl: CheeseMintCollectionACLState
  cheese_mints_by_id: CheeseMintsById
  cheese_mints_by_address: CheeseMintsByAddress
}

export const ACHIEVEMENT_WUZZY_SEARCHER = 'Wuzzy Searcher'
export const ACHIEVEMENT_WUZZY_VIDEO_SEARCHER = 'Wuzzy Video Searcher'
export const ACHIEVEMENT_WUZZY_IMAGE_SEARCHER = 'Wuzzy Image Searcher'
export const ACHIEVEMENT_WUZZY_ARNS_SEARCHER = 'Wuzzy ArNS Searcher'
export const ACHIEVEMENT_WUZZY_AUDIO_SEARCHER = 'Wuzzy Audio Searcher'
const REQUIRED_ACHIEVEMENTS = [
  ACHIEVEMENT_WUZZY_SEARCHER,
  ACHIEVEMENT_WUZZY_VIDEO_SEARCHER,
  ACHIEVEMENT_WUZZY_IMAGE_SEARCHER,
  ACHIEVEMENT_WUZZY_ARNS_SEARCHER,
  ACHIEVEMENT_WUZZY_AUDIO_SEARCHER
]

@Injectable()
export class AchievementsService implements OnModuleInit {
  private readonly logger = new Logger(AchievementsService.name)
  private signer: ReturnType<typeof createDataItemSigner>
  private readonly processId: string
  private walletAddress: string
  private achievementIdsByName: Map<string, string> = new Map()
  private jwk: JWKInterface

  // State cache with TTL
  private stateCache: CheeseMintCollectionState | null = null
  private stateCacheTimestamp: number = 0
  private readonly stateCacheTtlMs: number

  constructor(private readonly configService: ConfigService) {
    this.processId = this.configService.get<string>(
      'AO_CHEESE_MINT_PROCESS_ID',
      { infer: true }
    ) as string

    // Default TTL of 5 minutes, configurable via env
    this.stateCacheTtlMs = parseInt(
      this.configService.get<string>('AO_STATE_CACHE_TTL_MS', {
        infer: true
      }) ?? '300000'
    )
  }

  async onModuleInit() {
    // Load wallet JWK and create signer
    const jwkPath = this.configService.get<string>('AO_WALLET_JWK_PATH', {
      infer: true
    }) as string

    if (!jwkPath) {
      throw new Error('AO_WALLET_JWK_PATH is required in environment config')
    }

    if (!this.processId) {
      throw new Error(
        'AO_CHEESE_MINT_PROCESS_ID is required in environment config'
      )
    }

    try {
      const jwkData = readFileSync(jwkPath, 'utf-8')
      this.jwk = JSON.parse(jwkData) as JWKInterface
      this.signer = createDataItemSigner(this.jwk)
      this.walletAddress = await this.getWalletAddressFromJwk()

      this.logger.log(`AO wallet loaded from ${jwkPath}`)
      this.logger.log(`Wallet address: ${this.walletAddress}`)
      this.logger.log(
        `Connected to cheese-mint-collection process: ${this.processId}`
      )

      // Verify permissions and load achievement IDs
      await this.verifyInitialization()
    } catch (error) {
      const err = error as Error
      this.logger.error(
        `Failed to initialize achievements service: ${err.message}`
      )
      throw err
    }
  }

  private async getWalletAddressFromJwk(): Promise<string> {
    return await Arweave.init({}).wallets.jwkToAddress(this.jwk)
  }

  /**
   * Verify that the wallet has proper ACL permissions and load achievement IDs
   */
  private async verifyInitialization(): Promise<void> {
    this.logger.log('Verifying AO process permissions and achievements...')

    try {
      const state = await this.getProcessState()
      this.verifyAclPermissions(state)
      this.loadAchievementIds(state)

      this.logger.log('AO process initialization verified successfully')
    } catch (error) {
      const err = error as Error
      this.logger.error(`Failed to verify initialization: ${err.message}`)
      throw err
    }
  }

  /**
   * Get process state with caching
   */
  private async getProcessState(
    forceRefresh = false
  ): Promise<CheeseMintCollectionState> {
    const now = Date.now()
    const cacheAge = now - this.stateCacheTimestamp

    // Return cached state if valid and not forcing refresh
    if (!forceRefresh && this.stateCache && cacheAge < this.stateCacheTtlMs) {
      this.logger.debug(
        `Using cached state (age: ${Math.round(cacheAge / 1000)}s)`
      )
      return this.stateCache
    }

    // Fetch fresh state
    this.logger.debug('Fetching fresh process state...')
    const dryRunResponse = await sendAosDryRun({
      processId: this.processId,
      tags: [{ name: 'Action', value: 'View-State' }]
    })

    const result = dryRunResponse.result
    const info = this.parseProcessInfo(result)

    // Update cache
    this.stateCache = info
    this.stateCacheTimestamp = now
    this.logger.debug('Process state cached')

    return info
  }

  /**
   * Invalidate the state cache
   */
  private invalidateStateCache(): void {
    this.logger.debug('Invalidating state cache')
    this.stateCache = null
    this.stateCacheTimestamp = 0
  }

  /**
   * Parse process info from dry run result
   */
  private parseProcessInfo(result: DryRunResult): CheeseMintCollectionState {
    try {
      // Type guard for messages array
      if (
        !result.Messages ||
        !Array.isArray(result.Messages) ||
        result.Messages.length === 0
      ) {
        throw new Error('No messages in dry run result')
      }

      // Safe access with type assertion
      const messages = result.Messages as Array<{ Data?: string }>
      const firstMessageData = messages[0]?.Data

      if (!firstMessageData) {
        throw new Error('No message data in dry run result')
      }

      return JSON.parse(firstMessageData) as CheeseMintCollectionState
    } catch (err: unknown) {
      const error = err as Error
      this.logger.error(`Failed to parse process info: ${error.message}`)
      this.logger.debug(`Raw result: ${JSON.stringify(result)}`)
      throw new Error('Invalid process info format')
    }
  }

  /**
   * Verify that the wallet has Award-Cheese-Mint permission
   */
  private verifyAclPermissions(info: CheeseMintCollectionState): void {
    if (!info.acl || !info.acl.roles) {
      throw new Error('No ACL found in process info')
    }

    const awardPermissions = info.acl.roles['Award-Cheese-Mint']
    if (!awardPermissions || typeof awardPermissions !== 'object') {
      throw new Error('Award-Cheese-Mint permission not configured in ACL')
    }

    if (!awardPermissions[this.walletAddress]) {
      this.logger.error(
        `Wallet ${this.walletAddress} is not in Award-Cheese-Mint ACL`
      )
      const allowedAddresses = Object.keys(awardPermissions).filter(
        (addr) => awardPermissions[addr]
      )
      this.logger.error(`Allowed addresses: ${allowedAddresses.join(', ')}`)
      throw new Error(
        'Wallet does not have Award-Cheese-Mint permission in AO process'
      )
    }

    this.logger.log(
      `✓ Wallet ${this.walletAddress} has Award-Cheese-Mint permission`
    )
  }

  /**
   * Load achievement IDs from process info
   */
  private loadAchievementIds(info: CheeseMintCollectionState): void {
    if (!info.cheese_mints_by_id) {
      throw new Error('No cheese_mints_by_id found in process info')
    }

    const mintsById = info.cheese_mints_by_id

    // Build map of achievement names to IDs
    for (const [id, mint] of Object.entries(mintsById)) {
      this.achievementIdsByName.set(mint.name, id)
    }

    // Verify all required achievements exist
    const missingAchievements = REQUIRED_ACHIEVEMENTS.filter(
      (name) => !this.achievementIdsByName.has(name)
    )

    if (missingAchievements.length > 0) {
      this.logger.error(
        `Missing required achievements: ${missingAchievements.join(', ')}`
      )
      this.logger.error(
        `Available achievements: ${Array.from(this.achievementIdsByName.keys()).join(', ')}`
      )
      throw new Error(
        `Required achievements not found: ${missingAchievements.join(', ')}`
      )
    }

    this.logger.log(
      `✓ Loaded ${this.achievementIdsByName.size} achievements from process`
    )
    for (const name of REQUIRED_ACHIEVEMENTS) {
      const id = this.achievementIdsByName.get(name)
      this.logger.log(`  - ${name}: ${id}`)
    }
  }

  /**
   * Get achievement ID for an event type
   */
  public getAchievementId(achievementName: string): string | undefined {
    const achievementId = this.achievementIdsByName.get(achievementName)
    if (!achievementId) {
      this.logger.warn(`Achievement ID not found for: ${achievementName}`)
      return undefined
    }

    return achievementId
  }

  /**
   * Award achievement by sending message to AO process
   */
  async awardAchievement(
    achievementName: string,
    walletAddress: string
  ): Promise<void> {
    const achievementId = this.getAchievementId(achievementName)
    if (!achievementId) {
      this.logger.warn(`Achievement ID not found for: ${achievementName}`)
      return
    }

    const hasAchieved = await this.hasAchievement(walletAddress, achievementId)

    if (hasAchieved) {
      this.logger.debug(
        `Wallet ${walletAddress} already has achievement ${achievementId}, skipping`
      )
      return
    }

    this.logger.log(
      `Tracking achievement for ${walletAddress} (${achievementId})`
    )

    try {
      const { messageId, result } = await sendAosMessage({
        processId: this.processId,
        signer: this.signer,
        tags: [
          { name: 'Action', value: 'Award-Cheese-Mint' },
          { name: 'Cheese-Mint-Id', value: achievementId },
          { name: 'Award-To-Address', value: walletAddress }
        ]
      })

      // Invalidate cache after sending a message since state may have changed
      this.invalidateStateCache()

      this.logger.log(
        `Achievement tracked successfully. Message ID: ${messageId}`
      )
      this.logger.debug(`AO Process result: ${JSON.stringify(result)}`)
    } catch (error) {
      const err = error as Error
      this.logger.error(
        `Failed to track achievement: ${err.message}`,
        err.stack
      )

      throw err
    }
  }

  private async hasAchievement(
    walletAddress: string,
    achievementId: string
  ): Promise<boolean> {
    const state = await this.getProcessState()
    const awardsByAddress = state.cheese_mints_by_address[walletAddress]

    if (!awardsByAddress) {
      return false
    }

    return achievementId in awardsByAddress
  }
}
