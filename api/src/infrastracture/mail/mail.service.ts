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
 * Email sender with SMTP primary and Brevo HTTP fallback.
 * SMTP is tried first; if it times out or fails (e.g. port blocked on Render),
 * we immediately retry via Brevo's HTTPS API (port 443, never blocked).
 */
@Injectable()
export class MailService {
  private transporter: Transporter | null = null;
  private brevoApiKey: string | null = null;
  private httpFrom: { name: string; email: string };

  constructor(private readonly config: ConfigService, private readonly logger: Logger) {
    // ── SMTP (primary) ──
    const host = this.config.get<string>('SMTP_HOST')?.trim();
    const user = this.config.get<string>('SMTP_USER')?.trim();
    const pass = this.normalizeSecret(this.config.get<string>('SMTP_PASS'));

    if (host && user && pass) {
      const port = Number(this.config.get<string>('SMTP_PORT') ?? 587);
      const secure =
        this.config.get<string>('SMTP_SECURE') === 'true' ||
        this.config.get<boolean>('SMTP_SECURE') === true ||
        port === 465;

      const timeoutMs = Number(this.config.get<string>('SMTP_TIMEOUT_MS') ?? 7000);

      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
        connectionTimeout: timeoutMs,
        greetingTimeout: timeoutMs,
        socketTimeout: timeoutMs + 3000,
      });
      this.logger.log(`Mail service: SMTP configured (${host}:${port}, timeout ${timeoutMs}ms)`);
    } else {
      this.logger.warn('Mail service: SMTP not configured');
    }

    // ── HTTP email fallback (Brevo) ──
    const brevoKey = this.config.get<string>('MAIL_HTTP_API_KEY')?.trim();
    if (brevoKey) {
      this.brevoApiKey = brevoKey;
      this.logger.log('Mail service: Brevo HTTP fallback configured');
    }

    const appName = this.config.get<string>('APP_NAME') ?? 'Seam AI';
    const fromEmail =
      this.config.get<string>('MAIL_FROM') ??
      this.config.get<string>('SMTP_USER') ??
      'noreply@seam.local';
    this.httpFrom = { name: appName, email: fromEmail };
  }

  async send(options: SendMailOptions): Promise<boolean> {
    const from = this.getFrom();
    const htmlContent = options.html ?? this.textToHtml(options.text);

    // ── Attempt 1: SMTP ──
    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from,
          to: options.to,
          subject: options.subject,
          text: options.text,
          html: htmlContent,
          replyTo: options.replyTo,
        });
        this.logger.log({ to: options.to, subject: options.subject }, 'Email sent via SMTP');
        return true;
      } catch (err) {
        this.logger.warn(
          { err, to: options.to, subject: options.subject },
          'SMTP send failed — trying Brevo HTTP fallback',
        );
      }
    }

    // ── Attempt 2: Brevo HTTP API ──
    if (this.brevoApiKey) {
      try {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': this.brevoApiKey,
          },
          body: JSON.stringify({
            sender: this.httpFrom,
            to: [{ email: options.to }],
            subject: options.subject,
            textContent: options.text,
            htmlContent: htmlContent,
          }),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          this.logger.error(
            { status: response.status, body: errorBody, to: options.to },
            'Brevo API returned error',
          );
          return false;
        }

        this.logger.log({ to: options.to, subject: options.subject }, 'Email sent via Brevo');
        return true;
      } catch (err) {
        this.logger.error({ err, to: options.to }, 'Brevo HTTP fallback failed');
      }
    }

    // ── Both failed or neither configured ──
    this.logger.error(
      { to: options.to, subject: options.subject },
      'All email transports failed or none configured',
    );
    return false;
  }

  isConfigured(): boolean {
    return this.transporter !== null || this.brevoApiKey !== null;
  }

  private getFrom(): string {
    const from =
      this.config.get<string>('MAIL_FROM') ??
      this.config.get<string>('SMTP_USER') ??
      'noreply@seam.local';
    const appName = this.config.get<string>('APP_NAME') ?? 'Seam';
    return `"${appName}" <${from}>`;
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
