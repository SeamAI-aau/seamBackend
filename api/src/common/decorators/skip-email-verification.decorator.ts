import { SetMetadata } from '@nestjs/common';

export const SKIP_EMAIL_VERIFICATION_KEY = 'skipEmailVerification';

/** Allow authenticated users who have not verified email yet (invite accept, profile, resend). */
export const SkipEmailVerification = () => SetMetadata(SKIP_EMAIL_VERIFICATION_KEY, true);
