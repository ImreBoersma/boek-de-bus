import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page page-centered">
      <div className="card auth-card">
        <h1 className="auth-title">Deze pagina bestaat niet</h1>
        <p className="auth-lede">
          Misschien een oude link. De kalender staat er nog wel.
        </p>
        <Link className="btn btn-primary btn-block flow-cta" href="/">
          Naar de kalender
        </Link>
      </div>
    </div>
  );
}
