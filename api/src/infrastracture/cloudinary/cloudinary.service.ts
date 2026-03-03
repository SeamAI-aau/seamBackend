import { Injectable } from '@nestjs/common';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'fs';

import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { Logger } from 'nestjs-pino';

@Injectable()
export class CloudinaryService {
  constructor(private readonly config: ConfigService, private readonly logger: Logger) {
    cloudinary.config({
      cloud_name: this.config.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.config.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.config.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  async uploadAudio(file: Express.Multer.File): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { resource_type: 'video' },
        (error, result) => {
          if (error || !result) {
            return reject(
              new AppException(
                ErrorCode.CLOUDINARY_UPLOAD_FAILED,
                'Failed to upload audio to Cloudinary',
                500,
              ),
            );
          }

          resolve(result);
        },
      );

      const streamErrorHandler = (error: Error) => {
        uploadStream.destroy();
        this.logger.log({ error }, 'Error streaming audio to Cloudinary');
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
        const fileStream = createReadStream(file.path);
        fileStream.on('error', streamErrorHandler);
        fileStream.pipe(uploadStream);
        return;
      }

      if (file.stream) {
        file.stream.on('error', streamErrorHandler);
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
