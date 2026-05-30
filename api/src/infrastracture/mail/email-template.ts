/**
 * Branded HTML emails aligned with seam-ai-web-dashboard auth UI
 * (Plus Jakarta Sans, Seam blue #3a65bb, card on soft background).
 */

export type BrandedEmailOptions = {
  appName: string;
  /** Public logo URL (e.g. FRONTEND_URL/images/logo_landscape.png) */
  logoUrl?: string;
  greeting: string;
  headline?: string;
  body: string;
  /** Raw HTML inserted after body paragraphs (not escaped). Use for styled blocks like verification codes. */
  rawHtmlInsert?: string;
  /** Primary CTA — omit for text-only emails */
  action?: {
    label: string;
    href: string;
  };
  footerNote?: string;
};

/** Seam AI design tokens (light theme, matches index.css) */
const COLORS = {
  background: '#f4f6f9',
  card: '#ffffff',
  foreground: '#1a2233',
  muted: '#64748b',
  primary: '#3a65bb',
  primaryHover: '#2f5299',
  border: '#e2e8f0',
  accentGlow: 'rgba(58, 101, 187, 0.12)',
  cyanGlow: 'rgba(34, 211, 238, 0.08)',
} as const;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function bodyToHtmlParagraphs(body: string): string {
  return body
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n').map((l) => escapeHtml(l.trim()));
      return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${COLORS.foreground};">${lines.join('<br />')}</p>`;
    })
    .join('');
}

/**
 * Table-based layout for broad email client support.
 */
export function buildBrandedEmailHtml(options: BrandedEmailOptions): string {
  const appName = escapeHtml(options.appName);
  const greeting = escapeHtml(options.greeting);
  const headline = options.headline ? escapeHtml(options.headline) : '';
  const footerNote = options.footerNote
    ? escapeHtml(options.footerNote)
    : 'If you did not request this, you can safely ignore this email.';

  const logoBlock = options.logoUrl
    ? `<tr>
        <td align="center" style="padding:32px 32px 8px;">
          <img src="${escapeHtml(options.logoUrl)}" alt="${appName}" width="160" style="display:block;height:auto;max-width:160px;border:0;" />
        </td>
      </tr>`
    : `<tr>
        <td align="center" style="padding:32px 32px 8px;font-size:22px;font-weight:700;color:${COLORS.primary};letter-spacing:-0.02em;">
          ${appName}
        </td>
      </tr>`;

  const headlineBlock = headline
    ? `<tr>
        <td style="padding:8px 32px 0;text-align:center;">
          <h1 style="margin:0;font-size:22px;font-weight:700;line-height:1.3;color:${COLORS.foreground};letter-spacing:-0.02em;">${headline}</h1>
        </td>
      </tr>`
    : '';

  const actionBlock = options.action
    ? `<tr>
        <td align="center" style="padding:8px 32px 28px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td style="border-radius:10px;background:${COLORS.primary};">
                <a href="${escapeHtml(options.action.href)}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(options.action.label)}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : `<tr><td style="padding-bottom:28px;"></td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${appName}</title>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.background};font-family:'Plus Jakarta Sans',system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${COLORS.background};background-image:radial-gradient(ellipse 80% 50% at 50% -20%, ${COLORS.accentGlow}, transparent), radial-gradient(ellipse 60% 40% at 100% 50%, ${COLORS.cyanGlow}, transparent);">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:480px;background-color:${COLORS.card};border:1px solid ${COLORS.border};border-radius:16px;box-shadow:0 4px 24px rgba(26,34,51,0.06),0 1px 3px rgba(26,34,51,0.04);">
          ${logoBlock}
          ${headlineBlock}
          <tr>
            <td style="padding:16px 32px 0;">
              <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:${COLORS.muted};">${greeting}</p>
              ${bodyToHtmlParagraphs(options.body)}
              ${options.rawHtmlInsert ?? ''}
            </td>
          </tr>
          ${actionBlock}
          <tr>
            <td style="padding:0 32px 32px;border-top:1px solid ${COLORS.border};">
              <p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:${COLORS.muted};text-align:center;">${footerNote}</p>
              <p style="margin:12px 0 0;font-size:12px;color:${COLORS.muted};text-align:center;">— ${appName}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}
