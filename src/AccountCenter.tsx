import { useEffect, useState } from "react";
import type { Account } from "../shared/profile";
import { api } from "./api";
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Please retry.";
export function AccountCenter({
  user,
  onDeleted,
}: {
  user: Account;
  onDeleted: () => void;
}) {
  const [info, setInfo] = useState<{
      emailAvailable: boolean;
      emailVerified: boolean;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState("");
  useEffect(() => {
    let current = true;
    const load = () => {
      api<{ emailAvailable: boolean; emailVerified: boolean }>(
        "/api/account/settings",
      )
        .then((data) => {
          if (current) setInfo(data);
        })
        .catch((e) => {
          if (current) setError(message(e));
        });
    };
    load();
    window.addEventListener("focus", load);
    return () => {
      current = false;
      window.removeEventListener("focus", load);
    };
  }, []);
  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="account-center">
      <span className="eyebrow">YOUR DATA, YOUR CONTROL</span>
      <h2>Account & privacy</h2>
      <p>
        Manage your email, take your records with you, or close your account.
      </p>
      <article className="card settings-card">
        <h3>Email verification</h3>
        <p>{user.email}</p>
        <p>
          {info?.emailVerified
            ? "Your email is verified."
            : "Verify your email to protect access to your Plus services."}
        </p>
        {info && !info.emailAvailable && (
          <p className="service-note">
            The owner needs to configure email delivery before verification or
            password recovery can send messages.
          </p>
        )}
        <button
          className="button button-white"
          disabled={busy || !info?.emailAvailable || info?.emailVerified}
          onClick={() =>
            void run(async () => {
              const result = await api<{ message: string }>(
                "/api/account/verify-email",
                { method: "POST" },
              );
              setNotice(result.message);
            })
          }
        >
          Send verification email
        </button>
      </article>
      <article className="card settings-card">
        <h3>Download your records</h3>
        <p>
          Your profile, diary, plan history, favourites and billing references
          in a portable JSON file. Passwords and session tokens are excluded.
        </p>
        <button
          className="button button-white"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const data = await api("/api/account/export");
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(data, null, 2)], {
                  type: "application/json",
                }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "platewise-export.json";
              a.click();
              window.setTimeout(() => URL.revokeObjectURL(url), 1000);
              setNotice("Your records have been downloaded.");
            })
          }
        >
          Download my data
        </button>
      </article>
      <article className="card settings-card danger-card">
        <h3>Delete my account</h3>
        <p>
          This permanently deletes your app profile, meals, plans, favourites
          and photo-usage records. Active recurring renewals must be cancelled
          successfully first. Minimal payment references remain without your app
          identity for financial reconciliation; payment and email providers
          retain their own records.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api("/api/account/delete", {
                method: "POST",
                body: JSON.stringify({ password, confirmation }),
              });
              onDeleted();
            });
          }}
        >
          <label>
            Current password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label>
            Type DELETE to confirm
            <input
              required
              pattern="DELETE"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
            />
          </label>
          <button
            className="button button-danger"
            disabled={busy || confirmation !== "DELETE"}
          >
            Permanently delete my account
          </button>
        </form>
      </article>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="payment-notice" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
export function AccountActionPage({
  purpose,
}: {
  purpose: "reset" | "verify" | "request";
}) {
  const [token] = useState(
      () =>
        new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "",
    ),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    if (token) window.history.replaceState(null, "", window.location.pathname);
  }, [token]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const url =
        purpose === "request"
          ? "/api/auth/password-request"
          : purpose === "verify"
            ? "/api/auth/email-verify"
            : "/api/auth/password-reset";
      const result = await api<{ message: string }>(url, {
        method: "POST",
        body: JSON.stringify(
          purpose === "request" ? { email } : { token, password },
        ),
      });
      setNotice(result.message);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="link-page">
      <a href="/" className="link-brand">
        platewise<span>.</span>
      </a>
      <section className="card settings-card">
        <span className="eyebrow">ACCOUNT ACCESS</span>
        <h1>
          {purpose === "request"
            ? "Forgot your password?"
            : purpose === "verify"
              ? "Verify your email"
              : "Choose a new password"}
        </h1>
        {notice ? (
          <p role="status">{notice}</p>
        ) : (
          <form onSubmit={submit}>
            {purpose === "request" ? (
              <label>
                Email address
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
            ) : !token ? (
              <p>
                This link is incomplete. Open the full link from your email or
                request a new one.
              </p>
            ) : purpose === "reset" ? (
              <label>
                New password
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={10}
                  maxLength={128}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            ) : (
              <p>
                Confirm to verify the email address associated with this link.
              </p>
            )}
            <button
              className="button button-primary"
              disabled={busy || (purpose !== "request" && !token)}
            >
              {busy
                ? "Please wait…"
                : purpose === "request"
                  ? "Send reset link"
                  : purpose === "verify"
                    ? "Verify my email"
                    : "Save new password"}
            </button>
          </form>
        )}
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        <a className="text-button" href="/">
          Return to sign in
        </a>
      </section>
    </main>
  );
}
