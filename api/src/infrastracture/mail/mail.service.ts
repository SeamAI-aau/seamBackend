import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { Logger } from 'nestjs-pino';

export interface SendMailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

/**
 * Professional email sender using Nodemailer.
 * Supports SMTP (Gmail, SendGrid, AWS SES, etc.). Gracefully no-ops when SMTP is not configured.
 */
@Injectable()
export class MailService {
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService, private readonly logger: Logger) {
    const host = this.config.get<string>('SMTP_HOST')?.trim();
    const user = this.config.get<string>('SMTP_USER')?.trim();
    const pass = this.normalizeSecret(this.config.get<string>('SMTP_PASS'));
    if (host && user && pass) {
      const port = Number(this.config.get<string>('SMTP_PORT') ?? 587);
      const secure =
        this.config.get<string>('SMTP_SECURE') === 'true' ||
        this.config.get<boolean>('SMTP_SECURE') === true ||
        port === 465;
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
          user,
          pass,
        },
      });
      this.logger.log('Mail service initialized with SMTP');
    } else {
      this.logger.warn('SMTP not configured; emails will be logged only');
    }
  }

  async send(options: SendMailOptions): Promise<boolean> {
    const from =
      this.config.get<string>('MAIL_FROM') ??
      this.config.get<string>('SMTP_USER') ??
      'noreply@seam.local';
    const appName = this.config.get<string>('APP_NAME') ?? 'Seam';

    const mailOptions = {
      from: `"${appName}" <${from}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html ?? this.textToHtml(options.text),
      replyTo: options.replyTo,
    };

    if (!this.transporter) {
      this.logger.warn(
        { to: options.to, subject: options.subject },
        '[Mail] SKIPPED: SMTP not configured',
      );
      return false;
    }

    try {
      await this.transporter.sendMail(mailOptions);
      this.logger.log({ to: options.to, subject: options.subject }, 'Email sent successfully');
      return true;
    } catch (err) {
      this.logger.error({ err, to: options.to, subject: options.subject }, 'Failed to send email');
      return false;
    }
  }

  isConfigured(): boolean {
    return this.transporter !== null;
  }

  /** Strip wrapping quotes from .env values (e.g. Gmail app passwords with spaces). */
  private normalizeSecret(value: string | undefined): string | undefined {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  }

  private textToHtml(text: string): string {
    return text
      .split('\n')
      .map((line) => line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
      .join('<br>');
  }
}
