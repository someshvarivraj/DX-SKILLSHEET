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

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * The HTML part of an email: a short message, one big button for the link,
 * and the link itself written out underneath.
 *
 * Sent alongside the plain text (2026-10-01): plain text only meant the link
 * was clickable only if the reader's mail app happened to detect it, and
 * several did not — people were copying it into the browser by hand. Inline
 * styles and a table layout, because mail apps strip <style> and ignore most
 * modern CSS.
 */
function buildHtml(params: { paragraphs: string[]; button: string; link: string; footer: string[] }): string {
  const link = escapeHtml(params.link);
  const p = (text: string) =>
    `<p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#1e2530;">${escapeHtml(text)}</p>`;
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f7f8fa;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8fa;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e3e6ea;border-radius:0;">
<tr><td style="padding:28px 28px 8px;font-family:'Hiragino Sans','Hiragino Kaku Gothic ProN','Noto Sans JP',Meiryo,Arial,sans-serif;">
${params.paragraphs.map(p).join('\n')}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 24px;"><tr>
<td style="background:#c2410c;border-radius:0;">
<a href="${link}" target="_blank" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(params.button)}</a>
</td></tr></table>
<p style="margin:0 0 6px;font-size:12px;color:#5b6573;">ボタンが押せない場合は、こちらのリンクを開いてください / If the button doesn't work, open this link:</p>
<p style="margin:0 0 20px;font-size:12px;word-break:break-all;"><a href="${link}" target="_blank" style="color:#c2410c;">${link}</a></p>
${params.footer.map((f) => `<p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:#636d7a;">${escapeHtml(f)}</p>`).join('\n')}
</td></tr>
<tr><td style="padding:0 28px 24px;"></td></tr>
</table>
</td></tr></table>
</body></html>`;
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
      `${params.personName} has asked for their skill sheet (version ${params.versionNo}) to be reviewed.`,
      '',
      '内容を確認し、問題がなければ確定してください。',
      'Please check it and finalise it if everything is correct.',
      params.link,
      '',
      'このメールは、本人が「確認を依頼する」を実行したときに自動送信されています。',
    ].join('\n'),
    html: buildHtml({
      paragraphs: [
        `${params.personName}さんが、ご自身のスキルシート（第${params.versionNo}版）の確認を依頼しました。内容を確認し、問題がなければ確定してください。`,
        `${params.personName} has asked for their skill sheet (version ${params.versionNo}) to be reviewed. Please check it and finalise it if everything is correct.`,
      ],
      button: 'スキルシートを開く / Open the skill sheet',
      link: params.link,
      footer: ['このメールは、本人が「確認を依頼する」を実行したときに自動送信されています。'],
    }),
  };
}

export function buildLoginEmail(link: string, ttlMinutes: number): MailMessage {
  const env = getEnv();
  return {
    to: '',
    subject: `${env.APP_NAME} ログインリンク`,
    text: [
      `${env.APP_NAME}へのログインリンクです。`,
      `Here is your login link for the Skill Sheet Manager.`,
      '',
      link,
      '',
      `このリンクは${ttlMinutes}分間有効で、一度使用すると無効になります。`,
      `The link is valid for ${ttlMinutes} minutes and can be used only once.`,
      'このメールに心当たりがない場合は破棄してください。',
      "If you didn't request this, you can ignore this email.",
    ].join('\n'),
    html: buildHtml({
      paragraphs: [
        `${env.APP_NAME}へのログインリンクです。下のボタンを押すとログインできます。`,
        'Here is your login link for the Skill Sheet Manager. Press the button below to log in.',
      ],
      button: 'ログイン / Log in',
      link,
      footer: [
        `このリンクは${ttlMinutes}分間有効で、一度使用すると無効になります。 / Valid for ${ttlMinutes} minutes, one use only.`,
        "このメールに心当たりがない場合は破棄してください。 / If you didn't request this, ignore this email.",
      ],
    }),
  };
}
