import { describe, expect, it } from 'vitest';
import { buildLoginEmail, buildReviewRequestEmail } from '../src/lib/mail';

describe('emails carry a clickable link (HTML) as well as plain text', () => {
  const link = 'https://dx.morabu.com/skill-sheet-2/auth/verify?token=abc&x=1';

  it('login email: button and written-out link both point at the link', () => {
    const mail = buildLoginEmail(link, 15);
    expect(mail.text).toContain(link);
    const hrefs = mail.html?.match(/href="([^"]+)"/g) ?? [];
    expect(hrefs).toHaveLength(2);
    for (const h of hrefs) expect(h).toBe('href="https://dx.morabu.com/skill-sheet-2/auth/verify?token=abc&amp;x=1"');
    expect(mail.html).toContain('ログイン / Log in');
  });

  it('review request email: escapes the person name', () => {
    const mail = buildReviewRequestEmail({ personName: '<b>A</b>', versionNo: 2, link });
    expect(mail.html).toContain('&lt;b&gt;A&lt;/b&gt;');
    expect(mail.html).not.toContain('<b>A</b>');
  });
});
