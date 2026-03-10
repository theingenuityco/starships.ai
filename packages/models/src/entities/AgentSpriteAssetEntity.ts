import type { AgentSpriteAssetModel, AgentSpriteAssetStatus } from '@starships/protocol';
import { Expose } from 'class-transformer';
import { IsISO8601, IsIn, IsOptional, IsString, Length } from 'class-validator';

export class AgentSpriteAssetEntity implements AgentSpriteAssetModel {
  @Expose()
  @IsString()
  @Length(1, 255)
  id!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  agentId!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  appearanceKey!: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  avatarAttachmentId?: string | null;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  spritesheetAttachmentId?: string | null;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  atlasAttachmentId?: string | null;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(0, 1000)
  staticBasePath?: string | null;

  @Expose()
  @IsString()
  @IsIn(['draft', 'published', 'rejected'])
  status!: AgentSpriteAssetStatus;

  @Expose()
  @IsString()
  @Length(1, 128)
  styleId!: string;

  @Expose()
  @IsString()
  @Length(1, 128)
  modelVersion!: string;

  @Expose()
  @IsString()
  @Length(1, 128)
  generatorVersion!: string;

  @Expose()
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @IsISO8601()
  updatedAt!: string;
}

