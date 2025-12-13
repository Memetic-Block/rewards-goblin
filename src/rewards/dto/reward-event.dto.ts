import { IsEnum, IsNotEmpty, IsString } from 'class-validator'

export type RewardEventType =
  | 'arns-search'
  | 'image-search'
  | 'audio-search'
  | 'video-search'

export class RewardEventDto {
  @IsEnum(['arns-search', 'image-search', 'audio-search', 'video-search'])
  @IsNotEmpty()
  eventType: RewardEventType

  @IsString()
  @IsNotEmpty()
  walletAddress: string

  // Optional metadata that can be included with the event
  metadata?: Record<string, any>
}
