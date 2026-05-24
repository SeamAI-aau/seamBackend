import { Injectable } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { MailService } from '../infrastracture/mail/mail.service';

import { buildBrandedEmailHtml } from '../infrastracture/mail/email-template';



@Injectable()

export class AuthMailService {

  constructor(

    private readonly mail: MailService,

    private readonly config: ConfigService,

  ) {}



  getFrontendBaseUrl(): string {

    const raw =

      this.config.get<string>('APP_URL') ??

      this.config.get<string>('FRONTEND_URL') ??

      'http://localhost:8080';

    return raw.replace(/\/+$/, '');

  }



  getApiBaseUrl(): string {

    const port = this.config.get<string>('PORT') ?? '3000';

    const explicit = this.config.get<string>('API_URL');

    if (explicit?.trim()) {

      return explicit.replace(/\/+$/, '');

    }

    return `http://localhost:${port}`;

  }



  private getAppName(): string {

    return this.config.get<string>('APP_NAME') ?? 'Seam AI';

  }



  private getLogoUrl(): string {

    return `${this.getFrontendBaseUrl()}/images/logo_landscape.png`;

  }



  async sendEmailVerification(to: string, name: string, rawToken: string): Promise<boolean> {

    const verifyUrl = `${this.getApiBaseUrl()}/auth/verify-email?token=${encodeURIComponent(rawToken)}`;

    const appName = this.getAppName();

    const greeting = name?.trim() ? `Hi ${name.trim()},` : 'Hi,';



    return this.mail.send({

      to,

      subject: `${appName}: Verify your email`,

      text: [

        greeting,

        '',

        `Welcome to ${appName}. Tap the link in this email to verify your address (expires in 24 hours).`,

        verifyUrl,

        '',

        'If you did not create an account, you can ignore this email.',

        '',

        `— ${appName}`,

      ].join('\n'),

      html: buildBrandedEmailHtml({

        appName,

        logoUrl: this.getLogoUrl(),

        greeting,

        headline: 'Verify your email',

        body: `Welcome to ${appName}. Confirm your email to secure your account and continue using the dashboard.`,

        action: {

          label: 'Verify email',

          href: verifyUrl,

        },

        footerNote: 'This link expires in 24 hours.',

      }),

    });

  }



  async sendPasswordReset(to: string, name: string, rawToken: string): Promise<boolean> {

    const resetUrl = `${this.getFrontendBaseUrl()}/reset-password?token=${encodeURIComponent(rawToken)}`;

    const appName = this.getAppName();

    const greeting = name?.trim() ? `Hi ${name.trim()},` : 'Hi,';



    return this.mail.send({

      to,

      subject: `${appName}: Reset your password`,

      text: [

        greeting,

        '',

        'We received a request to reset your password. Open the link below to choose a new password:',

        resetUrl,

        '',

        'This link expires in 1 hour. If you did not request a reset, you can ignore this email.',

        '',

        `— ${appName}`,

      ].join('\n'),

      html: buildBrandedEmailHtml({

        appName,

        logoUrl: this.getLogoUrl(),

        greeting,

        headline: 'Reset your password',

        body: 'We received a request to reset your password. Use the button below to choose a new one.',

        action: {

          label: 'Reset password',

          href: resetUrl,

        },

        footerNote: 'This link expires in 1 hour.',

      }),

    });

  }

}


