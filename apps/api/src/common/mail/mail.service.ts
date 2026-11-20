import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import type { Transporter } from 'nodemailer';
import mailConfig from '../config/mail.config.js';

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Sends mail over SMTP (Gmail by default). One transporter per process, created on first use. */
@Injectable()
export class MailService {
  private transporter: Transporter | null = null;

  constructor(
    @Inject(mailConfig.KEY)
    private readonly config: ConfigType<typeof mailConfig>,
  ) {}

  get enabled(): boolean {
    return this.config.enabled;
  }

  async send(mail: OutgoingMail): Promise<void> {
    if (!this.config.enabled) throw new Error('Mail is not configured.');
    this.transporter ??= createTransport({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure,
      requireTLS: !this.config.secure,
      auth: { user: this.config.user, pass: this.config.password },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    await this.transporter.sendMail({ from: this.config.from, ...mail });
  }
}
