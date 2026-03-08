import { Injectable } from '@nestjs/common';
import { createReadStream } from 'fs';
import { v2 as cloudinary } from 'cloudinary';
import type { UploadApiResponse } from 'cloudinary';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';

import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import type { CloudinaryUploadResult } from './types/cloudinary.types';
import type { MeetingAudioUploadOptions } from './types/cloudinary.types';
import {
  CLOUDINARY_MEETING_AUDIO_FOLDER,
  CLOUDINARY_VOICE_SAMPLE_FOLDER,
  CLOUDINARY_AUDIO_RESOURCE_TYPE,
} from './constants/cloudinary.constants';

@Injectable()
export class CloudinaryService {
  constructor(private readonly config: ConfigService, private readonly logger: Logger) {
    cloudinary.config({
      cloud_name: this.config.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.config.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.config.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  /**
   * Upload meeting audio to Cloudinary. Returns a stable URL and public ID.
   * Use the URL for playback and publicId for future deletion if needed.
   */
  async uploadMeetingAudio(
    file: Express.Multer.File,
    options: MeetingAudioUploadOptions = {},
  ): Promise<CloudinaryUploadResult> {
    const folder = this.buildMeetingAudioFolder(options.folderPrefix);
    const result = await this.uploadStream(
      file,
      {
        resource_type: CLOUDINARY_AUDIO_RESOURCE_TYPE,
        folder,
      },
    );
    return this.toUploadResult(result);
  }

  /**
   * Upload user voice sample for profile setup (transcription/speaker recognition).
   * Stored under voice-samples/{userId}/.
   */
  async uploadVoiceSample(
    file: Express.Multer.File,
    userId: string,
  ): Promise<CloudinaryUploadResult> {
    const folder = `${CLOUDINARY_VOICE_SAMPLE_FOLDER}/${userId}`;
    const result = await this.uploadStream(
      file,
      {
        resource_type: CLOUDINARY_AUDIO_RESOURCE_TYPE,
        folder,
      },
    );
    return this.toUploadResult(result);
  }

  /**
   * Delete an asset by public ID. Use for cleanup when a meeting (and its audio) is removed.
   */
  async deleteByPublicId(publicId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.destroy(
        publicId,
        { resource_type: CLOUDINARY_AUDIO_RESOURCE_TYPE },
        (error) => {
          if (error) {
            this.logger.warn({ publicId, err: error }, 'Cloudinary delete failed');
            reject(
              new AppException(
                ErrorCode.CLOUDINARY_UPLOAD_FAILED,
                'Failed to delete asset from Cloudinary',
                500,
              ),
            );
            return;
          }
          resolve();
        },
      );
    });
  }

  private buildMeetingAudioFolder(prefix?: string): string {
    if (prefix?.trim()) {
      return `${CLOUDINARY_MEETING_AUDIO_FOLDER}/${prefix.trim()}`;
    }
    return CLOUDINARY_MEETING_AUDIO_FOLDER;
  }

  private toUploadResult(result: UploadApiResponse): CloudinaryUploadResult {
    const url = result.secure_url ?? result.url;
    if (!url) {
      throw new AppException(
        ErrorCode.CLOUDINARY_UPLOAD_FAILED,
        'Cloudinary did not return an URL',
        500,
      );
    }
    return {
      url,
      publicId: result.public_id ?? '',
    };
  }

  private uploadStream(
    file: Express.Multer.File,
    options: { resource_type: string; folder: string },
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        options,
        (error, result) => {
          if (error || !result) {
            this.logger.warn({ err: error }, 'Cloudinary upload failed');
            reject(
              new AppException(
                ErrorCode.CLOUDINARY_UPLOAD_FAILED,
                'Failed to upload audio to Cloudinary',
                500,
              ),
            );
            return;
          }
          resolve(result);
        },
      );

      const onStreamError = (error: Error) => {
        uploadStream.destroy();
        this.logger.warn({ err: error }, 'Error streaming file to Cloudinary');
        reject(
          new AppException(
            ErrorCode.CLOUDINARY_UPLOAD_FAILED,
            'Failed to stream audio to Cloudinary',
            500,
          ),
        );
      };

      if (file.buffer) {
        uploadStream.end(file.buffer);
        return;
      }

      if (file.path) {
        const readStream = createReadStream(file.path);
        readStream.on('error', onStreamError);
        readStream.pipe(uploadStream);
        return;
      }

      if (file.stream) {
        file.stream.on('error', onStreamError);
        file.stream.pipe(uploadStream);
        return;
      }

      uploadStream.destroy();
      reject(
        new AppException(
          ErrorCode.CLOUDINARY_UPLOAD_FAILED,
          'No file data available for upload',
          400,
        ),
      );
    });
  }
}
