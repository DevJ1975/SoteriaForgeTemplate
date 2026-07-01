/**
 * VideoModel — downloaded VideoAsset METADATA plus local-file bookkeeping.
 *
 * NEVER holds video bytes. The encrypted MP4 lives on the device filesystem;
 * `localUri` points at it and `encryptionKeyRef` names the Keychain/Keystore
 * entry holding its content key (see offline/video.ts). This row is the metadata
 * + pointer only, mirroring the server's metadata-only VideoAssetRecord.
 */
import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';
import { Tables } from '../schema';

export type VideoDownloadStatus = 'not-downloaded' | 'downloading' | 'ready' | 'errored';

export class VideoModel extends Model {
  static table = Tables.videos;

  @text('server_id') serverId!: string;
  @text('tenant_id') tenantId!: string;
  @text('title') title!: string;
  @field('duration_seconds') durationSeconds?: number;
  @text('provider') provider?: string;
  @text('provider_video_id') providerVideoId?: string;
  @field('privacy_required') privacyRequired!: boolean;
  @text('download_status') downloadStatus!: VideoDownloadStatus;
  @text('local_uri') localUri?: string;
  @text('encryption_key_ref') encryptionKeyRef?: string;
  @field('size_bytes') sizeBytes?: number;
  @field('downloaded_at') downloadedAt?: number;

  get isPlayableOffline(): boolean {
    return this.downloadStatus === 'ready' && !!this.localUri;
  }
}
