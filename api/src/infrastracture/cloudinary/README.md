# Cloudinary Module

Storage for meeting audio and other media. Used by the meeting module for stand-up recordings.

## Usage

- **Upload meeting audio:** `uploadMeetingAudio(file, options?)`  
  Returns `{ url, publicId }`. Use `url` for playback and `publicId` for later deletion.  
  Optional `folderPrefix` (e.g. project ID) organizes assets under `meeting-audio/<prefix>/`.

- **Delete asset:** `deleteByPublicId(publicId)`  
  Use when removing a meeting and its audio (store `publicId` on the meeting if you need cleanup).

## Config

Requires `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (validated in app config).
