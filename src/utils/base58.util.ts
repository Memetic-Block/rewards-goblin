/**
 * Base58 alphabet used by Bitcoin, Solana, and other cryptocurrencies
 * Excludes: 0 (zero), O (capital o), I (capital i), l (lowercase L)
 */
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const BASE = BigInt(58)

/**
 * Decodes a base58 encoded string into a Uint8Array of bytes
 * @param input Base58 encoded string
 * @returns Decoded bytes as Uint8Array
 * @throws Error if input contains invalid base58 characters
 */
export function decodeBase58(input: string): Uint8Array {
  if (!input || input.length === 0) {
    throw new Error('Input cannot be empty')
  }

  // Count leading '1's (which represent leading zero bytes)
  let leadingZeros = 0
  for (let i = 0; i < input.length && input[i] === '1'; i++) {
    leadingZeros++
  }

  // Convert base58 string to a big integer
  let num = BigInt(0)
  for (let i = 0; i < input.length; i++) {
    const char = input[i]
    const digit = ALPHABET.indexOf(char)

    if (digit === -1) {
      throw new Error(`Invalid base58 character: "${char}" at position ${i}`)
    }

    num = num * BASE + BigInt(digit)
  }

  // Convert the big integer to bytes
  const bytes: number[] = []
  while (num > 0) {
    bytes.unshift(Number(num % BigInt(256)))
    num = num / BigInt(256)
  }

  // Add leading zero bytes
  for (let i = 0; i < leadingZeros; i++) {
    bytes.unshift(0)
  }

  return new Uint8Array(bytes)
}
