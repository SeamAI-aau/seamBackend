import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { Resend } from 'resend';
import { Logger } from 'nestjs-pino';

export interface SendMailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

/**
 * Email sender with SMTP primary and Resend HTTP fallback.
 * SMTP is tried first; if it times out or fails (e.g. port blocked on Render),
 * we immediately retry via Resend's HTTPS API (port 443, never blocked).
 */
@Injectable()
export class MailService {
  private transporter: Transporter | null = null;
  private resend: Resend | null = null;
  private httpFrom: string;

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

    // ── HTTP email fallback (Resend) ──
    const httpApiKey = this.config.get<string>('MAIL_HTTP_API_KEY')?.trim();
    this.httpFrom =
      this.config.get<string>('MAIL_HTTP_FROM')?.trim() || 'Seam AI <onboarding@resend.dev>';

    if (httpApiKey) {
      this.resend = new Resend(httpApiKey);
      this.logger.log('Mail service: HTTP email fallback configured');
    }
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
          'SMTP send failed — trying Resend fallback',
        );
      }
    }

    // ── Attempt 2: Resend HTTP API ──
    if (this.resend) {
      try {
        const { error } = await this.resend.emails.send({
          from: this.httpFrom,
          to: [options.to],
          subject: options.subject,
          text: options.text,
          html: htmlContent,
        });
        if (error) {
          this.logger.error({ error, to: options.to }, 'Resend API returned error');
          return false;
        }
        this.logger.log({ to: options.to, subject: options.subject }, 'Email sent via Resend');
        return true;
      } catch (err) {
        this.logger.error({ err, to: options.to }, 'Resend HTTP fallback failed');
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
    return this.transporter !== null || this.resend !== null;
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
