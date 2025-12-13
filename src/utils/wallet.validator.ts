import { isAddress, getAddress } from 'ethers'
import { decodeBase58 } from './base58.util'

export type WalletType = 'arweave' | 'evm' | 'solana'

export interface WalletValidationResult {
  valid: boolean
  type?: WalletType
  normalized?: string
  error?: string
}

/**
 * Validates and normalizes wallet addresses across multiple blockchain formats
 * - Arweave: 43 character base64url encoded address
 * - EVM: 0x-prefixed 40 hex character address (checksum validated)
 * - Solana: Base58 encoded 32-byte public key
 */
export class WalletValidator {
  // Arweave addresses are 43 characters of base64url (A-Za-z0-9_-)
  private static readonly ARWEAVE_REGEX = /^[A-Za-z0-9_-]{43}$/

  // EVM addresses are 0x followed by 40 hex characters
  private static readonly EVM_REGEX = /^0x[a-fA-F0-9]{40}$/

  // Solana uses base58 alphabet, typically 32-44 characters
  // Excludes: 0, O, I, l
  private static readonly SOLANA_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

  /**
   * Validates a wallet address and returns the validation result with type and normalized address
   */
  static validateAndNormalize(address: string): WalletValidationResult {
    if (!address || typeof address !== 'string') {
      return {
        valid: false,
        error: 'Wallet address must be a non-empty string'
      }
    }

    // Trim whitespace
    address = address.trim()

    // Check Arweave format
    if (this.ARWEAVE_REGEX.test(address)) {
      return {
        valid: true,
        type: 'arweave',
        normalized: address // Already normalized
      }
    }

    // Check EVM format
    if (this.EVM_REGEX.test(address)) {
      try {
        // Use ethers v6 to validate and get checksummed address
        if (!isAddress(address)) {
          return {
            valid: false,
            error: 'Invalid EVM address checksum'
          }
        }

        const checksummed = getAddress(address)
        return {
          valid: true,
          type: 'evm',
          normalized: checksummed
        }
      } catch (error) {
        const err = error as Error
        return {
          valid: false,
          error: `Invalid EVM address: ${err.message}`
        }
      }
    }

    // Check Solana format
    if (this.SOLANA_REGEX.test(address)) {
      try {
        // Decode base58 and verify it's exactly 32 bytes
        const decoded = decodeBase58(address)

        if (decoded.length !== 32) {
          return {
            valid: false,
            error: `Solana address must decode to 32 bytes, got ${decoded.length}`
          }
        }

        return {
          valid: true,
          type: 'solana',
          normalized: address // Solana addresses don't need normalization
        }
      } catch (error) {
        const err = error as Error
        return {
          valid: false,
          error: `Invalid Solana address: ${err.message}`
        }
      }
    }

    return {
      valid: false,
      error:
        'Address does not match any supported format (Arweave, EVM, Solana)'
    }
  }

  /**
   * Quick validation without normalization
   */
  static isValid(address: string): boolean {
    return this.validateAndNormalize(address).valid
  }
}
