/**
 * How a message leaves the app.
 *
 * The transport is the second deliberately stubbed layer. The messages
 * themselves are real (see `index.ts`) — subject lines, Dutch copy, both a
 * text and an HTML part — so switching to a provider is a matter of writing one
 * `Transport` and binding it, with nothing above this line to rewrite.
 */

// No `server-only` marker: the tests import `recordingTransport` from here, and
// that package throws outside a react-server condition. The guard lives on
// `./index.ts`, which is what application code imports.

export type Email = {
  to: readonly string[];
  subject: string;
  text: string;
  html: string;
};

export type SendResult = { ok: true } | { ok: false; error: string };

export interface Transport {
  send(email: Email): Promise<SendResult>;
}

/**
 * Writes the message to the server log instead of sending it.
 *
 * The sign-in link is printed in full and on its own line, because with no real
 * delivery that log line *is* the sign-in flow: you copy the URL from the
 * terminal to get in. That is also why this must never be the transport in
 * production — see the guard in `index.ts`.
 */
export const logTransport: Transport = {
  async send(email) {
    const rule = "─".repeat(72);
    console.info(
      [
        "",
        rule,
        `✉  ${email.subject}`,
        `   aan: ${email.to.join(", ")}`,
        rule,
        email.text.trim(),
        rule,
        "",
      ].join("\n"),
    );
    return { ok: true };
  },
};

/**
 * Drops the message and reports success. Useful for tests that exercise a flow
 * without asserting on mail.
 */
export const nullTransport: Transport = {
  async send() {
    return { ok: true };
  },
};

/** Records what it was asked to send. Tests only. */
export function recordingTransport(): Transport & { sent: Email[] } {
  const sent: Email[] = [];
  return {
    sent,
    async send(email) {
      sent.push(email);
      return { ok: true };
    },
  };
}
