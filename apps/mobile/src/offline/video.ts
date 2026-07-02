/**
 * Offline video download scaffold — Cloudflare Stream → encrypted local file →
 * react-native-video offline playback.
 *
 * SCOPE: this is the download/decrypt orchestration + local bookkeeping. It is
 * METADATA-ONLY at the DB layer: the VideoModel row holds the pointer + key ref,
 * never the bytes. The actual filesystem I/O and OS-keystore calls are behind
 * clearly-named seams (`fileSystem`, `secureKeyStore`) so this compiles and the
 * flow is fully documented before the native pieces (expo-file-system,
 * expo-secure-store / Keychain / Keystore) are wired in the dev client build.
 *
 * ============================== THE FLOW ==============================
 * 1. RESOLVE a short-lived, tenant-authorized MP4 download URL from Cloudflare
 *    Stream. Cloudflare Stream exposes a downloadable MP4 rendition per video
 *    (`.../<uid>/downloads/default.mp4`) gated by a signed token. The token is
 *    minted server-side (the `stream-signed-url` Supabase edge function) ONLY
 *    after it has read the `video_assets` row THROUGH the caller's JWT (so RLS
 *    confirms the caller's tenant owns it) — a device can never fetch another
 *    tenant's media. We never embed Cloudflare account secrets in the app; the
 *    app only ever receives the signed, expiring URL.
 *
 * 2. DOWNLOAD the MP4 to a temp path (resumable; survives backgrounding).
 *
 * 3. ENCRYPT AT REST. Generate a random per-file content key, encrypt the bytes,
 *    and store ONLY the key in the OS keystore (iOS Keychain / Android Keystore,
 *    hardware-backed where available). The DB row keeps `encryptionKeyRef` (the
 *    keystore alias) and `localUri` (the encrypted file path) — never the key,
 *    never plaintext. If the device is compromised, downloaded training video is
 *    not readable without the keystore-held key.
 *
 * 4. PLAY BACK offline via react-native-video, pointed at the decrypted stream.
 *    On play we fetch the key from the keystore and hand react-native-video a
 *    decrypting source (a local decrypt-on-read file provider). Playback works
 *    with zero network — this is the whole point for field workers with no
 *    connectivity.
 * =====================================================================
 *
 * All state transitions are recorded on the VideoModel row
 * (not-downloaded → downloading → ready / errored) so the UI can show progress
 * and so an interrupted download is retried, never left half-applied.
 */
import type { Database } from '@nozbe/watermelondb';
import { database as defaultDatabase } from '../db';
import { Tables } from '../db/schema';
import type { VideoModel, VideoDownloadStatus } from '../db/models';

// ---------------------------------------------------------------------------
// Native seams (wired in the dev client build; typed here so the flow compiles)
// ---------------------------------------------------------------------------

/** Filesystem seam — real impl backed by expo-file-system in the dev client. */
export interface FileSystem {
  /** Download `url` to `destPath`, reporting progress 0..1. Resolves to bytes written. */
  downloadResumable(url: string, destPath: string, onProgress?: (p: number) => void): Promise<number>;
  /** Encrypt `srcPath` → `destPath` with `key`; returns the encrypted file size. */
  encryptFile(srcPath: string, destPath: string, key: Uint8Array): Promise<number>;
  /** Delete a file if present (cleanup on error / eviction). */
  remove(path: string): Promise<void>;
  /** App-private directory for encrypted video (outside any shared/iCloud path). */
  offlineVideoDir(): string;
}

/** Secure key store seam — iOS Keychain / Android Keystore via expo-secure-store. */
export interface SecureKeyStore {
  /** Persist a content key under `ref`; hardware-backed where the OS supports it. */
  putKey(ref: string, key: Uint8Array): Promise<void>;
  /** Fetch a previously stored content key, or null if absent. */
  getKey(ref: string): Promise<Uint8Array | null>;
  /** Remove a content key (on video eviction / sign-out). */
  deleteKey(ref: string): Promise<void>;
}

/**
 * Resolves a signed, tenant-authorized Cloudflare Stream MP4 URL for a video.
 * The real impl calls the tenant-scoped `stream-signed-url` edge function, which
 * mints the signed URL only after RLS confirms the caller owns the asset. Returns null if the
 * caller is not authorized (which, given server-side tenant checks, means the
 * asset is not this tenant's — the download simply does not happen).
 */
export type DownloadUrlResolver = (videoId: string, tenantId: string) => Promise<string | null>;

/** 32 random bytes for a per-file content key (AES-256). Uses the crypto polyfill. */
function generateContentKey(): Uint8Array {
  const key = new Uint8Array(32);
  // globalThis.crypto is provided by react-native-get-random-values (see index.ts).
  const c = globalThis.crypto;
  if (!c || typeof c.getRandomValues !== 'function') {
    throw new Error('No secure RNG available to generate a video content key.');
  }
  c.getRandomValues(key);
  return key;
}

export interface VideoDownloadDeps {
  db?: Database;
  fileSystem: FileSystem;
  secureKeyStore: SecureKeyStore;
  resolveDownloadUrl: DownloadUrlResolver;
}

/**
 * Orchestrates downloading + encrypting a single video for offline use, updating
 * the VideoModel row through each state. Tenant-scoped: the caller passes the
 * verified tenantId (token claim) and the URL resolver enforces ownership
 * server-side — a device cannot cache a video its tenant does not own.
 */
export class VideoDownloader {
  private readonly db: Database;
  private readonly fs: FileSystem;
  private readonly keys: SecureKeyStore;
  private readonly resolveUrl: DownloadUrlResolver;

  constructor(deps: VideoDownloadDeps) {
    this.db = deps.db ?? defaultDatabase;
    this.fs = deps.fileSystem;
    this.keys = deps.secureKeyStore;
    this.resolveUrl = deps.resolveDownloadUrl;
  }

  private collection() {
    return this.db.get<VideoModel>(Tables.videos);
  }

  private async setStatus(
    row: VideoModel,
    status: VideoDownloadStatus,
    patch?: (r: VideoModel) => void,
  ): Promise<void> {
    await this.db.write(async () => {
      await row.update((r) => {
        r.downloadStatus = status;
        patch?.(r);
      });
    });
  }

  /**
   * Download + encrypt a video for offline playback. Idempotent-ish: if the row
   * is already `ready` with a local file, it is a no-op. On any failure the row
   * is marked `errored` and temp files are cleaned — never left half-downloaded.
   */
  async download(row: VideoModel, tenantId: string): Promise<void> {
    if (row.isPlayableOffline) return; // already downloaded

    // 1. Resolve a signed, tenant-authorized URL (server enforces ownership).
    const url = await this.resolveUrl(row.serverId, tenantId);
    if (!url) {
      await this.setStatus(row, 'errored');
      throw new Error(`No authorized download URL for video ${row.serverId} in tenant ${tenantId}.`);
    }

    await this.setStatus(row, 'downloading');

    const dir = this.fs.offlineVideoDir();
    const tmpPath = `${dir}/${row.serverId}.tmp.mp4`;
    const encPath = `${dir}/${row.serverId}.enc.mp4`;
    const keyRef = `video-key:${tenantId}:${row.serverId}`;

    try {
      // 2. Download the MP4 rendition.
      await this.fs.downloadResumable(url, tmpPath);

      // 3. Encrypt at rest; store ONLY the key in the OS keystore.
      const key = generateContentKey();
      const size = await this.fs.encryptFile(tmpPath, encPath, key);
      await this.keys.putKey(keyRef, key);
      await this.fs.remove(tmpPath); // drop the plaintext copy immediately

      // 4. Record the pointer + key ref (never the key/bytes) on the row.
      await this.setStatus(row, 'ready', (r) => {
        r.localUri = encPath;
        r.encryptionKeyRef = keyRef;
        r.sizeBytes = size;
        r.downloadedAt = Date.now();
      });
    } catch (err) {
      await this.fs.remove(tmpPath).catch(() => {});
      await this.fs.remove(encPath).catch(() => {});
      await this.setStatus(row, 'errored');
      throw err;
    }
  }

  /**
   * Evict a downloaded video: delete the encrypted file and its keystore key,
   * and reset the row to `not-downloaded`. Used for storage management / sign-out.
   */
  async evict(row: VideoModel): Promise<void> {
    if (row.localUri) await this.fs.remove(row.localUri).catch(() => {});
    if (row.encryptionKeyRef) await this.keys.deleteKey(row.encryptionKeyRef).catch(() => {});
    await this.setStatus(row, 'not-downloaded', (r) => {
      r.localUri = undefined;
      r.encryptionKeyRef = undefined;
      r.sizeBytes = undefined;
      r.downloadedAt = undefined;
    });
  }

  /**
   * Produce a react-native-video source for offline playback. Fetches the content
   * key from the keystore and returns a descriptor the player uses to decrypt on
   * read. Returns null if the video is not downloaded/ready. NO network required.
   */
  async getOfflinePlaybackSource(
    row: VideoModel,
  ): Promise<{ uri: string; key: Uint8Array } | null> {
    if (!row.isPlayableOffline || !row.encryptionKeyRef || !row.localUri) return null;
    const key = await this.keys.getKey(row.encryptionKeyRef);
    if (!key) return null; // key evicted → treat as not playable
    return { uri: row.localUri, key };
  }
}
