import type { Metadata } from "next";
import { BusMark } from "@/components/boek-de-bus/icons";
import { LoginForm } from "@/components/boek-de-bus/login-form";
import { safeNext } from "@/lib/auth/shared";

export const metadata: Metadata = {
  title: "Inloggen — Boek de Bus",
};

/** Why the visitor was sent here, when the verify route bounced them. */
const REASONS: Record<string, string> = {
  invalid:
    "Die link werkt niet meer. Hij is al gebruikt of verlopen — vraag een nieuwe aan.",
  missing: "Die link was niet compleet. Vraag een nieuwe aan.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // Run through the same validator the action uses, so a hostile `next` cannot
  // even be planted in the form's hidden field.
  const next = safeNext(
    Array.isArray(params.next) ? params.next[0] : params.next,
  );
  const reasonKey = Array.isArray(params.reason)
    ? params.reason[0]
    : params.reason;
  const reason = reasonKey ? REASONS[reasonKey] : undefined;

  return (
    <div className="page page-centered">
      <div className="card auth-card">
        <div className="auth-brand">
          <BusMark />
          <span className="cal-brand-name">Boek de Bus</span>
        </div>

        <h1 className="auth-title">Inloggen</h1>
        <p className="auth-lede">
          Vul je e-mailadres in. Je krijgt een link waarmee je meteen binnen
          bent — geen wachtwoord nodig.
        </p>

        {reason && (
          <div className="cal-error auth-notice" role="alert">
            <span>{reason}</span>
          </div>
        )}

        <LoginForm next={next} />
      </div>

      <p className="page-note page-note-centered">
        Alleen adressen die op de bus-lijst staan kunnen inloggen.
      </p>
    </div>
  );
}
