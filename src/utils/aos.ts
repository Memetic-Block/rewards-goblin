import { Logger } from '@nestjs/common'
import { connect as aoConnect, createDataItemSigner } from '@permaweb/aoconnect'

export const {
  message: aoMessage,
  result: aoResult,
  dryrun: aoDryRun
} = aoConnect({
  CU_URL: process.env.CU_URL,
  MU_URL: process.env.MU_URL,
  GATEWAY_URL: process.env.GATEWAY_URL,
  GRAPHQL_URL: process.env.GRAPHQL_URL,
  MODE: 'legacy'
})

export type SendAosBaseOptions = {
  processId: string
  data?: string
  tags?: { name: string; value: string }[]
}
export type SendAosDryRunOptions = SendAosBaseOptions
export type SendAosMessageOptions = SendAosBaseOptions & {
  signer: ReturnType<typeof createDataItemSigner>
}

export type AosSigningFunction = ({
  data,
  tags,
  target,
  anchor
}: {
  data: string | Uint8Array
  tags: any[]
  target?: string
  anchor?: string
}) => Promise<{
  id: string
  raw: Buffer
}>

export async function sendAosDryRun(
  { processId, data, tags }: SendAosDryRunOptions,
  retries = 3
) {
  const logger = new Logger('util/sendAosDryRun')
  let attempts = 0
  let lastError: Error | undefined

  while (attempts < retries) {
    try {
      logger.debug(`Sending AO DryRun to process ${processId}`)

      return {
        result: await aoDryRun({
          process: processId,
          tags,
          data
        })
      }
    } catch (error) {
      const err = error as Error
      logger.error(`Error sending AO DryRun to process ${processId}`, err)

      if (err.message.includes('500')) {
        logger.debug(
          `Retrying sending AO DryRun to process ${processId}`,
          JSON.stringify(
            { attempts, retries, error: err.message },
            undefined,
            2
          )
        )

        // NB: Sleep between each attempt with exponential backoff
        await new Promise((resolve) =>
          setTimeout(resolve, 2 ** attempts * 2000)
        )

        attempts++
        lastError = err
      } else {
        throw err
      }
    }
  }

  if (lastError) {
    throw lastError
  }
  throw new Error('Unknown error occurred')
}

export async function sendAosMessage(
  { processId, data, tags, signer }: SendAosMessageOptions,
  retries = 3
) {
  const logger = new Logger('util/sendAosMessage')
  let attempts = 0
  let lastError: Error | undefined

  while (attempts < retries) {
    try {
      logger.debug(`Sending AO Message to process ${processId}`)

      const messageId = await aoMessage({
        process: processId,
        tags,
        data,
        signer
      })

      logger.debug(
        `Fetching AO Message result ${messageId} from process ${processId}`
      )
      const result = await aoResult({
        message: messageId,
        process: processId
      })
      logger.debug(
        `Got AO Message result ${messageId} from process ${processId}`
      )

      return { messageId, result }
    } catch (error) {
      const err = error as Error
      logger.error(`Error sending AO Message to process ${processId}`, err)

      if (err.message.includes('500')) {
        logger.log(
          `Retrying sending AO Message to process ${processId}`,
          JSON.stringify(
            { attempts, retries, error: err.message },
            undefined,
            2
          )
        )

        // NB: Sleep between each attempt with exponential backoff
        await new Promise((resolve) =>
          setTimeout(resolve, 2 ** attempts * 2000)
        )

        attempts++
        lastError = err
      } else {
        throw err
      }
    }
  }

  if (lastError) {
    throw lastError
  }
  throw new Error('Unknown error occurred')
}
