import Link from "next/link";

export default function AppNotFound() {
  return (
    <div className="app-page app-page--narrow">
      <div className="page-head__text">
        <h1>Not found</h1>
        <p>
          That decision or payment does not exist, or it belongs to another
          account.
        </p>
      </div>
      <Link href="/app" className="btn btn-outline align-start">
        Back to overview
      </Link>
    </div>
  );
}
