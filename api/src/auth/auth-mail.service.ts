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



  async sendEmailVerificationCode(to: string, name: string, code: string): Promise<boolean> {

    const appName = this.getAppName();

    const greeting = name?.trim() ? `Hi ${name.trim()},` : 'Hi,';



    return this.mail.send({

      to,

      subject: `${appName}: Your verification code is ${code}`,

      text: [

        greeting,

        '',

        `Your ${appName} verification code is: ${code}`,

        '',

        'Enter this code in the app to verify your email address. It expires in 10 minutes.',

        '',

        'If you did not create an account, you can ignore this email.',

        '',

        `— ${appName}`,

      ].join('\n'),

      html: buildBrandedEmailHtml({

        appName,

        logoUrl: this.getLogoUrl(),

        greeting,

        headline: 'Your verification code',

        body: 'Enter the following code in the app to verify your email address:',

        rawHtmlInsert: `<div style="margin: 24px 0; text-align: center;"><span style="display: inline-block; font-size: 32px; font-weight: 700; letter-spacing: 6px; padding: 16px 32px; background: #f0f4fa; border-radius: 8px; color: #1a2233;">${code}</span></div><p style="margin: 0; font-size: 14px; color: #6b7280;">This code expires in 10 minutes.</p>`,

        footerNote: 'If you did not create this account, ignore this email.',

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


