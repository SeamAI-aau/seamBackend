/** Default max meeting audio upload (bytes). Align with ai-engine `MAX_AUDIO_UPLOAD_MB` when possible. */
const DEFAULT_MEETING_UPLOAD_MAX_MB = 500;

export function meetingUploadMaxBytes(maxMbRaw: string | undefined): number {
  const parsed = maxMbRaw ? Number.parseInt(maxMbRaw, 10) : NaN;
  const mb = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MEETING_UPLOAD_MAX_MB;
  return mb * 1024 * 1024;
}
