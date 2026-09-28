import { Injectable, Logger } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import { config } from '../config';

export interface Mail {
  to: string;
  subject: string;
  /** Plain paragraphs. The HTML version is built from these. */
  paragraphs: string[];
  /** A single link the message exists to deliver. */
  action?: { label: string; url: string };
  /** Stops a retried request from sending the same message twice. */
  idempotencyKey?: string;
}

export interface MailResult {
  sent: boolean;
  reason?: string;
}

// Addresses on these domains can never reach a person, so nothing is sent.
const RESERVED = /(^|\.)(test|example|invalid|localhost)$|^example\.(com|net|org)$/;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function render(mail: Mail) {
  const footer =
    'Faceless Angels is not an emergency service. If you are in immediate danger, call 911.';
  const text = [
    ...mail.paragraphs,
    ...(mail.action ? [`${mail.action.label}: ${mail.action.url}`] : []),
    footer,
  ].join('\n\n');
  const html = [
    '<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#14213d;max-width:34rem">',
    ...mail.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`),
    mail.action
      ? `<p><a href="${escapeHtml(mail.action.url)}" style="display:inline-block;background:#14213d;color:#ffffff;padding:12px 22px;border-radius:999px;text-decoration:none">${escapeHtml(mail.action.label)}</a></p>`
      : '',
    `<p style="font-size:13px;color:#55627d">${footer}</p>`,
    '</div>',
  ].join('');
  return { text, html };
}

@Injectable()
export class MailService {
  private readonly log = new Logger(MailService.name);

  private get from() {
    const { from } = config.mail;
    return from.includes('<') ? from : `Faceless Angels <${from}>`;
  }

  async send(mail: Mail): Promise<MailResult> {
    const domain = mail.to.split('@').pop()?.toLowerCase() ?? '';
    const { provider } = config.mail;
    const body = render(mail);

    if (RESERVED.test(domain) || provider === 'log') {
      // Links are printed only outside production, for local testing.
      this.log.log(
        `Not sent (${RESERVED.test(domain) ? 'reserved domain' : 'log provider'}): "${mail.subject}" to ${mail.to}` +
          (config.production ? '' : `\n${body.text}`),
      );
      return { sent: false, reason: 'not_deliverable_here' };
    }

    try {
      if (provider === 'relykit') return await this.viaRelyKit(mail, body);
      if (provider === 'smtp') return await this.viaSmtp(mail, body);
      this.log.error(`Unknown EMAIL_PROVIDER "${provider}".`);
      return { sent: false, reason: 'provider_not_configured' };
    } catch (err) {
      this.log.error(`Email to ${mail.to} failed: ${String(err)}`);
      return { sent: false, reason: 'provider_error' };
    }
  }

  private async viaRelyKit(
    mail: Mail,
    body: { text: string; html: string },
  ): Promise<MailResult> {
    const { relykitKey, relykitUrl } = config.mail;
    if (!relykitKey || !config.mail.from) {
      this.log.error('RELYKIT_API_KEY or MAIL_FROM is not set.');
      return { sent: false, reason: 'provider_not_configured' };
    }
    const res = await fetch(`${relykitUrl}/emails`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${relykitKey}`,
        'content-type': 'application/json',
        ...(mail.idempotencyKey
          ? { 'Idempotency-Key': mail.idempotencyKey }
          : {}),
      },
      body: JSON.stringify({
        from: this.from,
        to: [mail.to],
        subject: mail.subject,
        text: body.text,
        html: body.html,
        tags: { app: 'faceless-angels' },
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      status?: string;
      name?: string;
      message?: string;
      last_error?: string;
    };
    if (!res.ok) {
      this.log.error(
        `RelyKit refused the email to ${mail.to}: ${res.status} ${data.name ?? ''} ${data.message ?? ''}`,
      );
      return { sent: false, reason: data.name ?? 'provider_error' };
    }
    // A 201 with "cancelled" means every recipient is on the suppression list.
    if (data.status === 'cancelled') {
      this.log.warn(`RelyKit cancelled the email to ${mail.to}: ${data.last_error ?? ''}`);
      return { sent: false, reason: 'suppressed' };
    }
    return { sent: true };
  }

  private async viaSmtp(
    mail: Mail,
    body: { text: string; html: string },
  ): Promise<MailResult> {
    const { smtp } = config.mail;
    if (!smtp.host || !config.mail.from) {
      this.log.error('SMTP_HOST or MAIL_FROM is not set.');
      return { sent: false, reason: 'provider_not_configured' };
    }
    const transport = createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.user ? { user: smtp.user, pass: smtp.password } : undefined,
    });
    await transport.sendMail({
      from: this.from,
      to: mail.to,
      subject: mail.subject,
      text: body.text,
      html: body.html,
    });
    return { sent: true };
  }
}
