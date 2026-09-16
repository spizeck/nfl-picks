/**
 * Resend transport wrapper. All provider-specific logic lives here so the
 * rest of the email pipeline deals only with `EmailTransport`.
 *
 * Required environment variables:
 * - RESEND_API_KEY: Resend API key (never logged).
 * - RESEND_EMAIL_DOMAIN: verified sending domain, e.g. mail.seasaba.com.
 */

import { Resend } from "resend";

export interface OutboundEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailTransport {
  send(email: OutboundEmail): Promise<{ id?: string }>;
}

export function getSenderAddress(): string {
  const domain = process.env.RESEND_EMAIL_DOMAIN;
  if (!domain) {
    throw new Error("RESEND_EMAIL_DOMAIN is not configured");
  }
  return `NFL Picks <picks@${domain}>`;
}

/**
 * Absolute URL used for email CTAs/deep links.
 */
export function getAppUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/+$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export function createResendTransport(
  apiKey = process.env.RESEND_API_KEY
): EmailTransport {
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  const resend = new Resend(apiKey);
  const from = getSenderAddress();
  return {
    async send(email) {
      const { data, error } = await resend.emails.send({
        from,
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
      if (error) {
        throw new Error(`Resend send failed (${error.name}): ${error.message}`);
      }
      return { id: data?.id };
    },
  };
}
