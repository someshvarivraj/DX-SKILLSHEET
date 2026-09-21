/**
 * Outbound email.
 *
 * Local development uses MAIL_TRANSPORT=console, which prints the login link to
 * the server log so no mail server is needed. Production uses SMTP, which on
 * AWS means Amazon SES SMTP credentials (spec §3). Nothing else in the
 * application knows which is in use.
 */

import nodemailer, { type Transporter } from 'nodemailer';
import { getEnv } from './env';

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  const env = getEnv();
  if (env.MAIL_TRANSPORT === 'console') return null;
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 587,
    secure: env.SMTP_SECURE,
    auth:
      env.SMTP_USER && env.SMTP_PASSWORD
        ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
        : undefined,
  });
  return transporter;
}

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export async function sendMail(message: MailMessage): Promise<void> {
  const env = getEnv();
  const t = getTransporter();

  if (!t) {
    // eslint-disable-next-line no-console
    console.info(
      [
        '',
        '─────────────── MAIL (console transport) ───────────────',
        `To:      ${message.to}`,
        `Subject: ${message.subject}`,
        '',
        message.text,
        '────────────────────────────────────────────────────────',
        '',
      ].join('\n'),
    );
    return;
  }

  await t.sendMail({
    from: env.MAIL_FROM,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}

/**
 * Told to an administrator when someone submits their own sheet for review
 * (Sano-san's reply to D-2: "otherwise I have no way of knowing something was
 * updated"). The person's own email address is deliberately not included —
 * recruits answer from private addresses and those stay out of circulation.
 */
export function buildReviewRequestEmail(params: {
  personName: string;
  versionNo: number;
  link: string;
}): MailMessage {
  const env = getEnv();
  return {
    to: '',
    subject: `【${env.APP_NAME}】${params.personName}さんのスキルシートが確認待ちです`,
    text: [
      `${params.personName}さんが、ご自身のスキルシート（第${params.versionNo}版）の確認を依頼しました。`,
      '',
      '内容を確認し、問題がなければ確定してください。',
      params.link,
      '',
      'このメールは、本人が「確認を依頼する」を実行したときに自動送信されています。',
    ].join('\n'),
  };
}

export function buildLoginEmail(link: string, ttlMinutes: number): MailMessage {
  const env = getEnv();
  return {
    to: '',
    subject: `${env.APP_NAME} ログインリンク`,
    text: [
      `${env.APP_NAME}へのログインリンクです。`,
      '',
      link,
      '',
      `このリンクは${ttlMinutes}分間有効で、一度使用すると無効になります。`,
      'このメールに心当たりがない場合は破棄してください。',
    ].join('\n'),
  };
}
