/**
 * The messages Boek de Bus sends, and the transport binding.
 *
 * The copy, subjects, and both MIME parts are real. Only delivery is stubbed —
 * `logTransport` prints to the server log. To send for actual:
 *
 *   1. Add `resend.ts` exporting a `Transport` that posts to the provider.
 *   2. Bind it in `transport()` below for production.
 *
 * Every value interpolated into the HTML part goes through `escapeHtml`. A
 * destination and a note are free text typed by a person, and they end up in
 * mail sent to someone else, so this is the boundary where that has to be
 * handled rather than trusted.
 */

import "server-only";

import type { Day } from "@/lib/boek-de-bus/schedule";
import { dayCountWords, rangeWords } from "@/lib/boek-de-bus/schedule";
import type { Email, Transport } from "./transport";
import { logTransport } from "./transport";

/** Where links in mail point. Must be set in production. */
export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

function transport(): Transport {
  // Guard rather than silently shipping an app whose sign-in links only ever
  // appear in a log nobody reads.
  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_LOG_EMAIL) {
    throw new Error(
      "No email transport is configured. Bind a real Transport in " +
        "src/lib/email/index.ts, or set ALLOW_LOG_EMAIL=1 to accept that mail " +
        "is only written to the server log.",
    );
  }
  return logTransport;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Shared HTML shell. Table-free, inline-styled, and safe to render as text. */
function layout(bodyHtml: string): string {
  return [
    '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;',
    'font-size:16px;line-height:1.6;color:#2f2a24;max-width:34rem;margin:0 auto;padding:24px">',
    '<p style="font-size:20px;font-weight:700;margin:0 0 20px">Boek de Bus</p>',
    bodyHtml,
    '<hr style="border:none;border-top:1px solid #e4dccd;margin:28px 0 12px">',
    '<p style="font-size:13px;color:#7c7266;margin:0">',
    "Je krijgt deze mail omdat je meerijdt met de bus.",
    "</p></div>",
  ].join("");
}

function button(href: string, label: string): string {
  return [
    `<p style="margin:24px 0"><a href="${escapeHtml(href)}" `,
    'style="background:#5a7d5a;color:#fff;text-decoration:none;padding:12px 22px;',
    'border-radius:10px;font-weight:600;display:inline-block">',
    escapeHtml(label),
    "</a></p>",
  ].join("");
}

async function send(email: Email) {
  return transport().send(email);
}

/** The sign-in link. The only way into the app. */
export async function sendSignInLink(params: {
  to: string;
  name: string;
  url: string;
  expiresInMinutes: number;
}) {
  const { to, name, url, expiresInMinutes } = params;
  return send({
    to: [to],
    subject: "Je inloglink voor Boek de Bus",
    text: [
      `Hoi ${name},`,
      "",
      "Klik op deze link om in te loggen bij Boek de Bus:",
      url,
      "",
      `De link werkt ${expiresInMinutes} minuten en kan één keer gebruikt worden.`,
      "",
      "Heb je hier niet om gevraagd? Dan kun je deze mail weggooien —",
      "zonder de link kan niemand met jouw adres inloggen.",
    ].join("\n"),
    html: layout(
      [
        `<p>Hoi ${escapeHtml(name)},</p>`,
        "<p>Klik op de knop om in te loggen bij Boek de Bus:</p>",
        button(url, "Inloggen"),
        `<p style="font-size:14px;color:#7c7266">De link werkt ${expiresInMinutes} minuten en kan één keer gebruikt worden.</p>`,
        '<p style="font-size:14px;color:#7c7266">Heb je hier niet om gevraagd? Dan kun je deze mail weggooien — zonder de link kan niemand met jouw adres inloggen.</p>',
      ].join(""),
    ),
  });
}

/** Told to the owners when a guest files a request. */
export async function sendRequestFiled(params: {
  owners: readonly string[];
  requesterName: string;
  start: Day;
  end: Day;
  today: Day;
  destination: string;
  note: string;
}) {
  const { owners, requesterName, start, end, today, destination, note } =
    params;
  if (owners.length === 0) return { ok: true as const };

  const period = rangeWords(start, end, today);
  const count = dayCountWords(start, end);
  const url = `${appUrl()}/aanvragen`;

  const details = [
    `Periode: ${period} (${count})`,
    destination ? `Bestemming: ${destination}` : null,
    note ? `Notitie: ${note}` : null,
  ].filter(Boolean) as string[];

  return send({
    to: owners,
    subject: `Nieuwe aanvraag van ${requesterName}: ${period}`,
    text: [
      `${requesterName} vraagt de bus aan.`,
      "",
      ...details,
      "",
      "Beslis erover in de app:",
      url,
    ].join("\n"),
    html: layout(
      [
        `<p><strong>${escapeHtml(requesterName)}</strong> vraagt de bus aan.</p>`,
        '<ul style="padding-left:20px;margin:16px 0">',
        details.map((line) => `<li>${escapeHtml(line)}</li>`).join(""),
        "</ul>",
        button(url, "Bekijk de aanvraag"),
      ].join(""),
    ),
  });
}

/** Told to the requester once an owner decides. */
export async function sendDecision(params: {
  to: string;
  name: string;
  approved: boolean;
  deciderName: string;
  start: Day;
  end: Day;
  today: Day;
}) {
  const { to, name, approved, deciderName, start, end, today } = params;
  const period = rangeWords(start, end, today);
  const url = appUrl();

  const verdict = approved
    ? `${deciderName} heeft je aanvraag goedgekeurd. De bus is van jou van ${period}, en die dagen staan nu voor de rest op geboekt.`
    : `${deciderName} heeft je aanvraag voor ${period} afgewezen. De dagen zijn weer vrij, dus je kunt een andere periode kiezen.`;

  return send({
    to: [to],
    subject: approved ? `Goedgekeurd: ${period}` : `Afgewezen: ${period}`,
    text: [`Hoi ${name},`, "", verdict, "", "Naar de kalender:", url].join(
      "\n",
    ),
    html: layout(
      [
        `<p>Hoi ${escapeHtml(name)},</p>`,
        `<p>${escapeHtml(verdict)}</p>`,
        button(url, "Naar de kalender"),
      ].join(""),
    ),
  });
}

export type { Email, SendResult, Transport } from "./transport";
