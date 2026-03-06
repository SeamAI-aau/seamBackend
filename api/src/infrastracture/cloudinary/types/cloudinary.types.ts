/**
 * Normalized result returned by CloudinaryService upload methods.
 * Callers depend on this contract, not Cloudinary's raw API response.
 */
export interface CloudinaryUploadResult {
  /** Preferred URL for playback (HTTPS). */
  url: string;
  /** Public ID for future delete or management. */
  publicId: string;
}

/**
 * Options for meeting audio uploads (folder, resource type).
 */
export interface MeetingAudioUploadOptions {
  /** Optional subfolder or prefix; e.g. projectId for organization. */
  folderPrefix?: string;
}
