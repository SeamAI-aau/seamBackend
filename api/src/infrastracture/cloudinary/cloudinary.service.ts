import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { ConfigService } from '@nestjs/config';
import { AppException } from "../common/errors/app.exception";
import { ErrorCode } from "../common/errors/error-codes";

@Injectable()
export class CloudinaryService {
  constructor(private readonly config: ConfigService) {
    cloudinary.config({
      cloud_name: this.config.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.config.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.config.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  async uploadAudio(file: Express.Multer.File): Promise<string> {
    const result = await cloudinary.uploader.upload_stream(
      { resource_type: 'video' },
      (error, result) => {
        if (error || !result) {
          throw new AppException(ErrorCode.CLOUDINARY_UPLOAD_FAILED, 'Failed to upload audio to Cloudinary', 500);
        }
        return result;
      },
    );

    return result.secure_url;
  }

}
