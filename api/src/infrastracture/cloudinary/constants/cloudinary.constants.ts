/**
 * Cloudinary folder prefix for meeting audio assets.
 * Assets are stored under meeting-audio/ for organization and optional lifecycle rules.
 */
export const CLOUDINARY_MEETING_AUDIO_FOLDER = 'meeting-audio';

/**
 * Cloudinary resource_type for audio uploads.
 * Use 'video' so audio formats (mp3, wav, etc.) are accepted and streamable.
 */
export const CLOUDINARY_AUDIO_RESOURCE_TYPE = 'video' as const;
