import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Dumbbell,
  Eye,
  EyeOff,
  Flag,
  Leaf,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  ShieldCheck,
  Sparkles,
  Target,
  Utensils,
  X,
} from "lucide-react";
import type { Account, DailyPlan, Profile } from "../shared/profile";
import { activities, allergies, barriers, goals } from "../shared/profile";
import type { Nutrients } from "../shared/types";
import { api } from "./api";
import Tracker from "./App";
export function Root() {
  const [account, setAccount] = useState<Account | null>(null);
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState(false);
  const [startInPlan, setStartInPlan] = useState(false);
  async function load() {
    setLoading(true);
    setError("");
    try {
      const result = await api<{ user?: Account; plan: DailyPlan | null }>(
        "/api/auth/me",
      );
      setAccount(result.user ?? null);
      setPlan(result.plan);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    const expired = () => {
      setAccount(null);
      setPlan(null);
      setSettings(false);
    };
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, []);
  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST" });
      setAccount(null);
      setPlan(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign out.");
    }
  }
  if (loading)
    return (
      <div className="startup-screen">
        <Logo />
        <LoaderCircle className="spin" size={25} />
        <p>Making a little space for you…</p>
      </div>
    );
  if (error)
    return (
      <div className="startup-screen">
        <Logo />
        <p role="alert">{error}</p>
        <button className="button button-primary" onClick={() => void load()}>
          Reconnect
        </button>
      </div>
    );
  if (!account)
    return (
      <Auth
        onSuccess={(user, plan) => {
          setAccount(user);
          setPlan(plan);
        }}
      />
    );
  if (!account.profile || settings)
    return (
      <ProfileWizard
        account={account}
        onComplete={(user, plan) => {
          setAccount(user);
          setPlan(plan);
          setSettings(false);
          setStartInPlan(true);
        }}
        onCancel={account.profile ? () => setSettings(false) : undefined}
        onLogout={() => void logout()}
      />
    );
  return (
    <Tracker
      key={`${account.id}-${startInPlan}`}
      initialView={startInPlan ? "plan" : "overview"}
      user={account}
      plan={plan}
      onSettings={() => setSettings(true)}
      onLogout={() => void logout()}
    />
  );
}
export function Logo() {
  return (
    <span className="brand auth-brand">
      <span className="brand-icon">
        <Utensils size={23} />
      </span>
      platewise<span className="brand-dot">.</span>
    </span>
  );
}
function Auth({
  onSuccess,
}: {
  onSuccess: (user: Account, plan: DailyPlan | null) => void;
}) {
  const [signup, setSignup] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ user: Account; plan: DailyPlan | null }>(
        signup ? "/api/auth/signup" : "/api/auth/login",
        { method: "POST", body: JSON.stringify({ name, email, password }) },
      );
      onSuccess(result.user, result.plan);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <Logo />
        <div className="auth-story-content">
          <div className="eyebrow">
            <span className="status-dot" /> A LITTLE CLARITY, EVERY DAY
          </div>
          <h1>
            Good food.
            <br />
            Better understanding.
            <br />
            <em>Your kind of balance.</em>
          </h1>
          <p>
            Turn everyday meals into a clearer picture of you. A photo, a few
            details, and a little less guesswork.
          </p>
          <div className="plate-art" aria-hidden="true">
            <div className="plate-glow" />
            <div className="plate-rim">
              <div className="plate-inner">
                <div className="food-grains" />
                <div className="food-greens">
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <div className="food-salmon">
                  <i />
                  <i />
                  <i />
                </div>
                <div className="food-tomatoes">
                  <i />
                  <i />
                  <i />
                </div>
                <div className="food-lemon" />
              </div>
            </div>
            <span className="art-badge">
              <Sparkles size={15} />
              <span>
                A little insight.<strong>On every plate.</strong>
              </span>
            </span>
          </div>
          <div className="auth-benefits">
            <span>
              <CameraIcon />
              Photo to food diary
            </span>
            <span>
              <Target size={16} />A plan that fits you
            </span>
            <span>
              <ShieldCheck size={16} />
              Your private space
            </span>
          </div>
        </div>
        <span className="auth-story-footer">
          A mindful approach to your everyday meals.
        </span>
      </section>
      <section className="auth-form-section">
        <span className="auth-top-note">YOUR NEXT CHAPTER STARTS HERE</span>
        <div className="auth-form-card">
          <div className="auth-form-symbol">
            <Leaf size={25} />
          </div>
          <h2>{signup ? "Make room for you." : "Welcome back."}</h2>
          <p>
            {signup
              ? "A few details today. A little more clarity tomorrow."
              : "Your next meal is a fresh start. Let’s pick up here."}
          </p>
          <div className="auth-tabs">
            <button
              className={signup ? "active" : ""}
              onClick={() => {
                setSignup(true);
                setError("");
              }}
            >
              Create account
            </button>
            <button
              className={!signup ? "active" : ""}
              onClick={() => {
                setSignup(false);
                setError("");
              }}
            >
              Sign in
            </button>
          </div>
          <form onSubmit={submit}>
            <fieldset disabled={busy}>
              {signup && (
                <label>
                  Your name
                  <input
                    name="name"
                    autoComplete="given-name"
                    placeholder="What should we call you?"
                    required
                    maxLength={80}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
              )}
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@gmail.com"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label>
                Password
                <div className="password-input">
                  <input
                    name="password"
                    type={visible ? "text" : "password"}
                    autoComplete={signup ? "new-password" : "current-password"}
                    placeholder={
                      signup ? "At least 10 characters" : "Enter your password"
                    }
                    minLength={signup ? 10 : 1}
                    maxLength={128}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    aria-label={visible ? "Hide password" : "Show password"}
                    onClick={() => setVisible(!visible)}
                  >
                    {visible ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </label>
              {error && (
                <div className="error-box" role="alert">
                  {error}
                </div>
              )}
              <button className="button button-primary" type="submit">
                {busy ? (
                  <LoaderCircle size={18} className="spin" />
                ) : (
                  <>
                    {signup ? "Create my space" : "Sign in"}
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </fieldset>
          </form>
          <p className="auth-fine-print">
            <LockKeyhole size={13} />
            Passwords are securely hashed. Your diary is linked to your account.
          </p>
          <div className="auth-small-note">
            Use Gmail or any email address. This is an app account, not Google
            sign-in. Email verification and password recovery are not enabled in
            this version.
          </div>
        </div>
        <div className="auth-bottom-note">
          Food awareness, without the all-or-nothing mindset.
        </div>
      </section>
    </div>
  );
}
function CameraIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    >
      <path d="M9 4h6l2 3h3a1 1 0 0 1 1 1v12H3V8a1 1 0 0 1 1-1h3z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}
const stepNames = [
  "Your intention",
  "Your barriers",
  "A little about you",
  "Your movement",
  "Your starting plan",
];
export function ProfileWizard({
  account,
  onComplete,
  onCancel,
  onLogout,
}: {
  account: Account;
  onComplete: (u: Account, p: DailyPlan) => void;
  onCancel?: () => void;
  onLogout: () => void;
}) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<Profile>(
    account.profile ?? {
      name: account.name,
      birthDate: "",
      country: "",
      gender: "unspecified",
      energyBasis: "neutral",
      heightCm: 0,
      weightKg: 0,
      goal: "awareness",
      targetWeightKg: null,
      timelineWeeks: 12,
      barriers: [],
      activity: "sedentary",
      diet: "balanced",
      allergies: [],
      needsClinicalGuidance: false,
    },
  );
  const update = <K extends keyof Profile>(key: K, value: Profile[K]) =>
    setForm({ ...form, [key]: value });
  async function next(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    if (step < 4) {
      setStep(step + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ user: Account; plan: DailyPlan }>(
        "/api/profile",
        { method: "PUT", body: JSON.stringify(form) },
      );
      onComplete(result.user, result.plan);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your profile.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="onboarding-page">
      <header className="onboarding-header">
        <Logo />
        <div className="profile-header-actions">
          {onCancel ? (
            <button className="button button-quiet" onClick={onCancel}>
              <X size={17} />
              Back to dashboard
            </button>
          ) : (
            <button className="button button-quiet" onClick={onLogout}>
              <LogOut size={16} />
              Sign out
            </button>
          )}
          {onCancel && (
            <button
              className="button button-quiet"
              onClick={onLogout}
              aria-label="Sign out"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </header>
      <div className="onboarding-shell">
        <div
          className="onboarding-progress"
          aria-label={`Step ${step + 1} of 5`}
        >
          {stepNames.map((name, i) => (
            <div
              className={i === step ? "active" : i < step ? "complete" : ""}
              key={name}
            >
              <span>{i < step ? <Check size={13} /> : i + 1}</span>
              <small>{name}</small>
            </div>
          ))}
        </div>
        <form className="onboarding-card" onSubmit={next}>
          <fieldset disabled={busy}>
            <span className="eyebrow">
              A PLAN THAT STARTS WITH YOU · {step + 1} OF 5
            </span>
            {step === 0 && (
              <>
                <h1>
                  What brings you here,
                  <br />
                  <em>{form.name.split(" ")[0]}?</em>
                </h1>
                <p>
                  Choose the intention that feels right today. You can change it
                  whenever you like.
                </p>
                <div className="goal-choices">
                  {goals.map((g, i) => (
                    <label
                      className={`choice-card ${form.goal === g.id ? "chosen" : ""}`}
                      key={g.id}
                    >
                      <input
                        className="sr-only"
                        type="radio"
                        name="goal"
                        value={g.id}
                        checked={form.goal === g.id}
                        onChange={() => update("goal", g.id)}
                      />
                      <span className="choice-symbol">
                        {i === 1 ? (
                          <Dumbbell size={20} />
                        ) : i === 4 ? (
                          <Leaf size={20} />
                        ) : (
                          <Target size={20} />
                        )}
                      </span>
                      <span>
                        <strong>{g.name}</strong>
                        <small>{g.note}</small>
                      </span>
                      <span className="choice-check">
                        {form.goal === g.id && <Check size={13} />}
                      </span>
                    </label>
                  ))}
                </div>
              </>
            )}
            {step === 1 && (
              <>
                <h1>
                  What’s gotten
                  <br />
                  <em>in the way before?</em>
                </h1>
                <p>
                  There’s no wrong answer. We’ll use this to make your starting
                  advice a little more useful. Select any that fit.
                </p>
                <div className="barrier-choices">
                  {barriers.map((b) => (
                    <label
                      key={b}
                      className={`barrier-choice ${form.barriers.includes(b) ? "chosen" : ""}`}
                    >
                      <input
                        className="sr-only"
                        type="checkbox"
                        checked={form.barriers.includes(b)}
                        onChange={() =>
                          update(
                            "barriers",
                            form.barriers.includes(b)
                              ? form.barriers.filter((x) => x !== b)
                              : b === "None of these"
                                ? [b]
                                : [
                                    ...form.barriers.filter(
                                      (x) => x !== "None of these",
                                    ),
                                    b,
                                  ],
                          )
                        }
                      />
                      <span>{b}</span>
                      <span className="choice-check">
                        {form.barriers.includes(b) && <Check size={12} />}
                      </span>
                    </label>
                  ))}
                </div>
                <div className="onboarding-note">
                  <Leaf size={20} />
                  <p>
                    Small, repeatable steps tend to fit real life better than a
                    perfect streak.
                  </p>
                </div>
              </>
            )}
            {step === 2 && (
              <>
                <h1>
                  A few details.
                  <br />
                  <em>A better starting point.</em>
                </h1>
                <p>
                  These help estimate your needs. They’re saved privately with
                  your account and can be updated.
                </p>
                <div className="profile-form-grid">
                  <label>
                    Your name
                    <input
                      required
                      maxLength={80}
                      autoComplete="given-name"
                      value={form.name}
                      onChange={(e) => update("name", e.target.value)}
                    />
                  </label>
                  <label>
                    Date of birth
                    <input
                      required
                      type="date"
                      min="1916-01-01"
                      max={new Date().toISOString().slice(0, 10)}
                      value={form.birthDate}
                      onChange={(e) => update("birthDate", e.target.value)}
                    />
                  </label>
                  <label>
                    Country
                    <input
                      required
                      placeholder="e.g. India"
                      autoComplete="country-name"
                      list="countries"
                      minLength={2}
                      maxLength={80}
                      value={form.country}
                      onChange={(e) => update("country", e.target.value)}
                    />
                  </label>
                  <datalist id="countries">
                    {[
                      "India",
                      "United States",
                      "United Kingdom",
                      "Canada",
                      "Australia",
                      "Germany",
                      "France",
                      "Singapore",
                      "United Arab Emirates",
                      "South Africa",
                      "Brazil",
                      "Japan",
                    ].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </datalist>
                  <label>
                    Gender
                    <select
                      value={form.gender}
                      onChange={(e) =>
                        update("gender", e.target.value as Profile["gender"])
                      }
                    >
                      <option value="unspecified">Prefer not to say</option>
                      <option value="woman">Woman</option>
                      <option value="man">Man</option>
                      <option value="nonbinary">Non-binary</option>
                    </select>
                  </label>
                  <label>
                    Height <span>cm</span>
                    <input
                      type="number"
                      min="120"
                      max="230"
                      step="0.1"
                      placeholder="170"
                      required
                      value={form.heightCm || ""}
                      onChange={(e) =>
                        update("heightCm", Number(e.target.value))
                      }
                    />
                  </label>
                  <label>
                    Current weight <span>kg</span>
                    <input
                      type="number"
                      min="30"
                      max="300"
                      step="0.1"
                      placeholder="70"
                      required
                      value={form.weightKg || ""}
                      onChange={(e) =>
                        update("weightKg", Number(e.target.value))
                      }
                    />
                  </label>
                  <label className="full-width">
                    Energy calculation basis
                    <select
                      value={form.energyBasis}
                      onChange={(e) =>
                        update(
                          "energyBasis",
                          e.target.value as Profile["energyBasis"],
                        )
                      }
                    >
                      <option value="neutral">
                        Use midpoint (less specific)
                      </option>
                      <option value="female">
                        Female physiological equation
                      </option>
                      <option value="male">Male physiological equation</option>
                    </select>
                    <small>
                      The formula uses sex-based constants. Your gender identity
                      isn’t used to infer this.
                    </small>
                  </label>
                </div>
              </>
            )}
            {step === 3 && (
              <>
                <h1>
                  How do you
                  <br />
                  <em>usually move?</em>
                </h1>
                <p>
                  Think about a typical week. Daily movement also matters, so
                  these are broad starting estimates.
                </p>
                <div className="goal-choices">
                  {activities.map((a, i) => (
                    <label
                      className={`choice-card ${form.activity === a.id ? "chosen" : ""}`}
                      key={a.id}
                    >
                      <input
                        className="sr-only"
                        type="radio"
                        name="activity"
                        value={a.id}
                        checked={form.activity === a.id}
                        onChange={() => update("activity", a.id)}
                      />
                      <span className="activity-bars">
                        {[0, 1, 2, 3].map((n) => (
                          <i
                            key={n}
                            style={{
                              height: `${8 + n * 5}px`,
                              opacity: n <= i ? 1 : 0.18,
                            }}
                          />
                        ))}
                      </span>
                      <span>
                        <strong>{a.label}</strong>
                        <small>{a.detail}</small>
                      </span>
                      <span className="choice-check">
                        {form.activity === a.id && <Check size={13} />}
                      </span>
                    </label>
                  ))}
                </div>
                <div className="onboarding-note">
                  <CircleHelp size={20} />
                  <p>
                    A workout can be a gym session, sport, or similar
                    intentional exercise. Rest and recovery belong in the
                    picture, too.
                  </p>
                </div>
              </>
            )}
            {step === 4 && (
              <>
                <h1>
                  Your pace.
                  <br />
                  <em>Your preferences.</em>
                </h1>
                <p>
                  We’ll make a practical starting menu. A timeline guides
                  planning; it can’t guarantee a result.
                </p>
                <div className="profile-form-grid">
                  <label>
                    Planning timeline <span>weeks</span>
                    <input
                      type="number"
                      min="4"
                      max="104"
                      step="1"
                      required
                      value={form.timelineWeeks || ""}
                      onChange={(e) =>
                        update("timelineWeeks", Number(e.target.value))
                      }
                    />
                  </label>
                  <label>
                    Target weight <span>kg · optional</span>
                    <input
                      type="number"
                      min="30"
                      max="300"
                      step="0.1"
                      placeholder="Leave blank for a gradual plan"
                      value={form.targetWeightKg ?? ""}
                      onChange={(e) =>
                        update(
                          "targetWeightKg",
                          e.target.value ? Number(e.target.value) : null,
                        )
                      }
                      disabled={
                        !["lose_weight", "gain_weight"].includes(form.goal)
                      }
                    />
                  </label>
                  <label className="full-width">
                    Food preferences
                    <select
                      value={form.diet}
                      onChange={(e) =>
                        update("diet", e.target.value as Profile["diet"])
                      }
                    >
                      <option value="balanced">
                        Balanced · includes meat, fish, eggs & dairy
                      </option>
                      <option value="vegetarian">
                        Vegetarian · eggs & dairy allowed
                      </option>
                      <option value="vegan">Vegan · plant foods only</option>
                    </select>
                  </label>
                </div>
                <div className="allergy-heading">
                  Exclude these allergens <span>Optional</span>
                </div>
                <div className="allergy-choices">
                  {allergies.map((a) => (
                    <label
                      className={form.allergies.includes(a) ? "chosen" : ""}
                      key={a}
                    >
                      <input
                        type="checkbox"
                        checked={form.allergies.includes(a)}
                        onChange={() =>
                          update(
                            "allergies",
                            form.allergies.includes(a)
                              ? form.allergies.filter((x) => x !== a)
                              : [...form.allergies, a],
                          )
                        }
                      />
                      {a}
                    </label>
                  ))}
                </div>
                <p className="allergy-hint">
                  For allergies beyond this list, get a menu reviewed by a
                  dietitian. Check ingredient labels and cross-contact.
                </p>
                <label className="clinical-choice">
                  <input
                    type="checkbox"
                    checked={form.needsClinicalGuidance}
                    onChange={(e) =>
                      update("needsClinicalGuidance", e.target.checked)
                    }
                  />
                  <span>
                    I’m pregnant, breastfeeding, or follow a
                    clinician-prescribed diet.
                    <small>
                      We’ll keep meal tracking available and pause automated
                      targets.
                    </small>
                  </span>
                </label>
              </>
            )}
            {error && (
              <div className="error-box" role="alert">
                {error}
              </div>
            )}
            <div className="onboarding-actions">
              {step > 0 ? (
                <button
                  className="button button-quiet"
                  type="button"
                  onClick={() => setStep(step - 1)}
                >
                  <ArrowLeft size={16} />
                  Back
                </button>
              ) : (
                <span className="secure-note">
                  <LockKeyhole size={12} />
                  Just for your personal plan
                </span>
              )}
              <button className="button button-primary" type="submit">
                {busy ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <>
                    {step === 4 ? "Build my starting plan" : "Continue"}
                    <ArrowRight size={17} />
                  </>
                )}
              </button>
            </div>
          </fieldset>
        </form>
        <div className="onboarding-fine-print">
          Nutrition estimates, made transparent. No promises of fast results.
        </div>
      </div>
    </div>
  );
}
const f = (v: number, d = 0) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: d }).format(v);
export function PlanView({
  user,
  plan,
  onSettings,
  onAddMeal,
}: {
  user: Account;
  plan: DailyPlan | null;
  onSettings: () => void;
  onAddMeal: (items: DailyPlan["menu"][number]["items"], title: string) => void;
}) {
  if (!plan)
    return (
      <section className="card plan-empty">
        <h2>Let’s build your starting plan.</h2>
        <button className="button button-primary" onClick={onSettings}>
          Complete your profile <ArrowRight size={16} />
        </button>
      </section>
    );
  return (
    <section className="plan-page">
      <div className="plan-intro">
        <div>
          <span className="eyebrow">YOUR STARTING POINT, NOT A RULEBOOK</span>
          <h2>
            A little structure.
            <br />
            <em>Room for real life.</em>
          </h2>
          <p>
            Built for {user.name.split(" ")[0]} ·{" "}
            {goals.find((g) => g.id === user.profile?.goal)?.name} ·{" "}
            {user.profile?.timelineWeeks}-week horizon
          </p>
        </div>
        <button className="button button-white" onClick={onSettings}>
          Edit my profile <ArrowRight size={15} />
        </button>
      </div>
      {plan.targets && (
        <div className="plan-targets">
          <TargetNumber
            label="Calories"
            value={plan.targets.kcal}
            unit="kcal / day"
          />
          <TargetNumber
            label="Protein"
            value={plan.targets.protein}
            unit="g / day"
          />
          <TargetNumber label="Fat" value={plan.targets.fat} unit="g / day" />
        </div>
      )}
      {plan.warnings.map((w, i) => (
        <div className="plan-warning" key={i}>
          <CircleHelp size={17} />
          <p>{w}</p>
        </div>
      ))}
      {plan.eligible && (
        <>
          <div className="plan-menu-heading">
            <div>
              <h3>A sample day, made for you</h3>
              <p>
                Cooked, edible weights. A starting menu you can change—not an
                allergy or medical guarantee.
              </p>
            </div>
            <span className="estimate-chip">
              Estimates · {user.profile?.diet}
            </span>
          </div>
          <div className="plan-menu-grid">
            {plan.menu.map((meal, i) => (
              <article className="card plan-meal" key={meal.name}>
                <div className="plan-meal-header">
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <h3>{meal.name}</h3>
                  <strong>
                    {f(meal.totals.kcal)} <small>kcal</small>
                  </strong>
                </div>
                <ul>
                  {meal.items.map((item) => (
                    <li key={item.foodId}>
                      <span>{item.name}</span>
                      <strong>{item.grams} g</strong>
                    </li>
                  ))}
                </ul>
                <div className="plan-meal-macros">
                  <span>{f(meal.totals.protein, 1)} g protein</span>
                  <span>{f(meal.totals.fat, 1)} g fat</span>
                </div>
                <button
                  className="text-button"
                  onClick={() => onAddMeal(meal.items, meal.name)}
                >
                  Review as a meal <ArrowRight size={14} />
                </button>
              </article>
            ))}
          </div>
          <div className="menu-total">
            <strong>Actual sample menu totals</strong>
            <span>{f(plan.menuTotals.kcal)} kcal</span>
            <span>{f(plan.menuTotals.protein, 1)} g protein</span>
            <span>{f(plan.menuTotals.fat, 1)} g fat</span>
            <small>
              These can differ from the targets above. Nothing is logged until
              you confirm saving.
            </small>
          </div>
        </>
      )}
      {plan.barrierTips.length > 0 && (
        <div className="card barrier-tips">
          <h3>Make it work for your everyday</h3>
          {plan.barrierTips.map((t) => (
            <div key={t.barrier}>
              <span>
                <Leaf size={17} />
              </span>
              <div>
                <h4>{t.barrier}</h4>
                <p>{t.tip}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      <details className="card plan-method">
        <summary>
          <CircleHelp size={17} />
          How your plan was calculated<span>View details</span>
        </summary>
        {plan.maintenanceKcal && (
          <p>
            Estimated maintenance: {f(plan.maintenanceKcal)} kcal/day. This uses
            your profile data, not a measurement of metabolism.
          </p>
        )}
        <ul>
          {plan.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
        <a
          href="https://pubmed.ncbi.nlm.nih.gov/2305711/"
          target="_blank"
          rel="noreferrer"
        >
          Mifflin–St Jeor equation source ↗
        </a>
      </details>
    </section>
  );
}
function TargetNumber({
  label,
  value,
  unit,
}: {
  label: string;
  value: number;
  unit: string;
}) {
  return (
    <div>
      <span>{label}</span>
      <strong>
        {f(value)}
        <small>{unit}</small>
      </strong>
      <p>Estimated daily starting target</p>
    </div>
  );
}
