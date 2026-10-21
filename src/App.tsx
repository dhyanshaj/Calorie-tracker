import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Flame,
  ImagePlus,
  Info,
  LayoutDashboard,
  LogOut,
  Leaf,
  LoaderCircle,
  LockKeyhole,
  Pencil,
  Plus,
  RotateCcw,
  Salad,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  Upload,
  Utensils,
  X,
  Zap,
} from "lucide-react";
import { PlanView } from "./PlanView";
import type { Account, DailyPlan } from "../shared/profile";
import { api } from "./api";
import type {
  Analysis,
  Food,
  Meal,
  MealItem,
  Nutrients,
  Status,
} from "../shared/types";
import {
  calculateItem,
  emptyNutrients,
  round,
  sumNutrients,
} from "../shared/nutrition";
function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function localTime(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  return `${dateKey(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function dayRange(day: string) {
  const start = new Date(`${day}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}
function humanDay(day: string) {
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}
function changeDay(day: string, delta: number) {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return dateKey(d);
}
function inputItems(items: MealItem[]) {
  return items.map(({ id, foodId, quantity, unit, gramsPerUnit }) => ({
    id,
    foodId,
    quantity,
    unit,
    gramsPerUnit,
  }));
}
function errorMessage(e: unknown) {
  return e instanceof Error
    ? e.message
    : "Something went wrong. Please try again.";
}
const fmt = (n: number, d = 0) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: d }).format(n);
function Nutrition({
  values,
  compact = false,
}: {
  values: Nutrients;
  compact?: boolean;
}) {
  return (
    <div className={`nutrition-grid ${compact ? "compact" : ""}`}>
      <div className="nutrient calorie">
        <span className="nutrient-label">
          <Flame size={15} />
          Calories
        </span>
        <strong>
          {fmt(values.kcal)}
          <small>kcal</small>
        </strong>
      </div>
      <div className="nutrient protein">
        <span className="nutrient-label">
          <Zap size={15} />
          Protein
        </span>
        <strong>
          {fmt(values.protein, 1)}
          <small>g</small>
        </strong>
      </div>
      <div className="nutrient fat">
        <span className="nutrient-label">
          <span className="fat-drop" />
          Fat
        </span>
        <strong>
          {fmt(values.fat, 1)}
          <small>g</small>
        </strong>
      </div>
    </div>
  );
}
function Feedback({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="error-box" role="alert">
      <Info size={18} />
      <div>
        {message}
        {retry && (
          <button className="text-button" onClick={retry}>
            Try again <RotateCcw size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
export default function Tracker({
  user,
  plan,
  onSettings,
  onLogout,
  initialView = "overview",
}: {
  user: Account;
  plan: DailyPlan | null;
  onSettings: () => void;
  onLogout: () => void;
  initialView?: "overview" | "plan";
}) {
  const [view, setView] = useState<"overview" | "diary" | "plan">(initialView);
  const [status, setStatus] = useState<Status | null>(null);
  const [foods, setFoods] = useState<Food[]>([]);
  const [setupError, setSetupError] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [dragging, setDragging] = useState(false);
  const [description, setDescription] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analysisError, setAnalysisError] = useState("");
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [eatenAt, setEatenAt] = useState(localTime());
  const [editing, setEditing] = useState<Meal | null>(null);
  const [saveToken, setSaveToken] = useState<string>(crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [day, setDay] = useState(dateKey());
  const [meals, setMeals] = useState<Meal[]>([]);
  const [daily, setDaily] = useState<Nutrients>(emptyNutrients());
  const [diaryLoading, setDiaryLoading] = useState(true);
  const [diaryError, setDiaryError] = useState("");
  const [revision, setRevision] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [about, setAbout] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchFoods, setSearchFoods] = useState<Food[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLElement>(null);
  const logRef = useRef<HTMLElement>(null);
  const editorRef = useRef<HTMLElement>(null);
  const busyRef = useRef(false);
  const saveBusyRef = useRef(false);
  async function initialize() {
    setSetupError("");
    try {
      const [s, f] = await Promise.all([
        api<Status>("/api/status"),
        api<{ foods: Food[] }>("/api/foods"),
      ]);
      setStatus(s);
      setFoods(f.foods);
    } catch (e) {
      setSetupError(errorMessage(e));
    }
  }
  useEffect(() => {
    void initialize();
  }, []);
  useEffect(() => {
    if (!photo) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  useEffect(() => {
    const controller = new AbortController();
    setDiaryLoading(true);
    setDiaryError("");
    const params = new URLSearchParams(dayRange(day));
    api<{ meals: Meal[]; totals: Nutrients }>(`/api/meals?${params}`, {
      signal: controller.signal,
    })
      .then((d) => {
        setMeals(d.meals);
        setDaily(d.totals);
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setDiaryError(errorMessage(e));
          setMeals([]);
          setDaily(emptyNutrients());
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setDiaryLoading(false);
      });
    return () => controller.abort();
  }, [day, revision]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!about && !deleting) return;
    const before = document.activeElement as HTMLElement;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !deleteBusy) {
        setAbout(false);
        setDeleting(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      before?.focus();
    };
  }, [about, deleting, deleteBusy]);
  function selectPhoto(file?: File) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setAnalysisError(
        "Choose a JPEG, PNG, or WebP image. Convert HEIC photos before uploading.",
      );
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setAnalysisError(
        "This photo is larger than 8 MB. Choose a smaller image.",
      );
      return;
    }
    setPhoto(file);
    setAnalysisError("");
  }
  function fileChanged(e: ChangeEvent<HTMLInputElement>) {
    selectPhoto(e.target.files?.[0]);
    e.target.value = "";
  }
  function dropPhoto(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (!busy) selectPhoto(e.dataTransfer.files[0]);
  }
  function newDraft() {
    setEditing(null);
    setAnalysis(null);
    setTitle("");
    setDescription("");
    setPhoto(null);
    setEatenAt(`${day}T${localTime().split("T")[1]}`);
    setSaveToken(crypto.randomUUID());
    setAnalysisError("");
    setEditorError("");
    setAddOpen(false);
    setDirty(false);
    setAcknowledged(false);
  }
  function manual() {
    newDraft();
    setAnalysis({
      items: [],
      totals: emptyNutrients(),
      assumptions: [],
      questions: [],
      method: "manual",
      incomplete: false,
    });
    setAddOpen(true);
    setTimeout(
      () =>
        resultRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      80,
    );
  }
  async function analyze(withPhoto = true) {
    if (busyRef.current || saving || recalculating) return;
    busyRef.current = true;
    setBusy(true);
    setAnalysisError("");
    setEditorError("");
    try {
      const form = new FormData();
      form.append("description", description);
      if (photo && withPhoto) form.append("photo", photo);
      const result = await api<Analysis>("/api/analyze", {
        method: "POST",
        body: form,
      });
      setAnalysis(result);
      setDirty(false);
      setAcknowledged(false);
      setAddOpen(!result.items.length);
      if (!title)
        setTitle(
          result.items
            .map((i) => i.food.name.replace("Plain whole-wheat ", ""))
            .slice(0, 2)
            .join(" & ")
            .slice(0, 100) || "My meal",
        );
      if (!editing) setEatenAt(`${day}T${localTime().split("T")[1]}`);
      setTimeout(
        () =>
          resultRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          }),
        80,
      );
    } catch (e) {
      setAnalysisError(errorMessage(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function updateItems(items: MealItem[]) {
    if (!analysis) return;
    setAnalysis({ ...analysis, items, totals: sumNutrients(items) });
    setDirty(true);
    setEditorError("");
  }
  function updateItem(index: number, changes: Partial<MealItem>) {
    if (!analysis) return;
    const items = analysis.items.map((item, i) =>
      i === index
        ? calculateItem({ ...item, ...changes }, changes.food ?? item.food)
        : item,
    );
    updateItems(items);
  }
  function chooseFood(index: number, id: string) {
    const food =
      foods.find((f) => f.id === id) ?? searchFoods.find((f) => f.id === id);
    if (!food) return;
    const p = food.portions[0];
    updateItem(index, {
      food,
      foodId: id,
      quantity: 1,
      unit: p.unit,
      gramsPerUnit: p.grams,
    });
  }
  function addFood(food: Food) {
    if (!analysis) return;
    const p = food.portions[0];
    updateItems([
      ...analysis.items,
      calculateItem(
        {
          id: crypto.randomUUID(),
          foodId: food.id,
          quantity: 1,
          unit: p.unit,
          gramsPerUnit: p.grams,
        },
        food,
      ),
    ]);
    if (!foods.some((f) => f.id === food.id)) setFoods([...foods, food]);
    setAddOpen(false);
    setQuery("");
    setSearchFoods([]);
    if (!title) setTitle("My meal");
  }
  async function searchDatabase() {
    setSearchBusy(true);
    setSearchError("");
    try {
      const result = await api<{ foods: Food[] }>(
        `/api/foods/search?q=${encodeURIComponent(query)}`,
      );
      setSearchFoods(result.foods);
    } catch (e) {
      setSearchError(errorMessage(e));
    } finally {
      setSearchBusy(false);
    }
  }
  const validItems =
    !!analysis?.items.length &&
    analysis.items.every(
      (i) =>
        i.quantity > 0 &&
        Number.isFinite(i.quantity) &&
        i.gramsPerUnit > 0 &&
        Number.isFinite(i.gramsPerUnit) &&
        i.grams <= 20000,
    );
  async function recalculate() {
    if (!analysis || !validItems || saving || busy) return;
    setRecalculating(true);
    setEditorError("");
    try {
      const result = await api<Analysis>("/api/recalculate", {
        method: "POST",
        body: JSON.stringify({
          items: inputItems(analysis.items),
          ...(editing ? { mealId: editing.id } : {}),
        }),
      });
      setAnalysis({
        ...analysis,
        items: result.items,
        totals: result.totals,
        assumptions: [...new Set(result.assumptions)],
        ...(acknowledged ? { questions: [], incomplete: false } : {}),
      });
      setDirty(false);
      setToast("Estimate recalculated. Your diary has not changed.");
    } catch (e) {
      setEditorError(errorMessage(e));
    } finally {
      setRecalculating(false);
    }
  }
  async function saveMeal() {
    if (
      !analysis ||
      !validItems ||
      !title.trim() ||
      !eatenAt ||
      saveBusyRef.current ||
      busy ||
      recalculating
    )
      return;
    if (analysis.incomplete && !acknowledged) {
      setEditorError(
        "Review the missing foods below, then confirm your list is complete.",
      );
      return;
    }
    saveBusyRef.current = true;
    setSaving(true);
    setEditorError("");
    try {
      const at = new Date(eatenAt);
      if (!Number.isFinite(at.getTime()))
        throw new Error("Choose a valid meal date and time.");
      const body = {
        title: title.trim(),
        description,
        eatenAt: at.toISOString(),
        items: inputItems(analysis.items),
        saveToken,
        version: editing?.version,
        method: analysis.method,
      };
      const saved = await api<Meal>(
        editing ? `/api/meals/${editing.id}` : "/api/meals",
        { method: editing ? "PUT" : "POST", body: JSON.stringify(body) },
      );
      const wasEditing = !!editing;
      newDraft();
      setDay(dateKey(new Date(saved.eatenAt)));
      setRevision((r) => r + 1);
      setToast(
        wasEditing
          ? "Meal updated. Daily totals recalculated."
          : "Meal saved to your diary.",
      );
    } catch (e) {
      setEditorError(errorMessage(e));
    } finally {
      saveBusyRef.current = false;
      setSaving(false);
    }
  }
  function editMeal(meal: Meal) {
    setEditing(meal);
    setAnalysis(meal);
    setPhoto(null);
    setDescription(meal.description);
    setTitle(meal.title);
    setEatenAt(localTime(meal.eatenAt));
    setSaveToken(meal.saveToken);
    setDirty(false);
    setAcknowledged(false);
    setView("overview");
    setEditorError("");
    setAnalysisError("");
    setAddOpen(false);
    setTimeout(
      () =>
        resultRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      80,
    );
  }
  async function deleteMeal() {
    if (!deleting || deleteBusy) return;
    setDeleteBusy(true);
    setDiaryError("");
    const meal = meals.find((m) => m.id === deleting);
    if (!meal) {
      setDeleting(null);
      setDeleteBusy(false);
      return;
    }
    try {
      await api(`/api/meals/${meal.id}?version=${meal.version}`, {
        method: "DELETE",
      });
      if (editing?.id === meal.id) newDraft();
      setRevision((r) => r + 1);
      setDeleting(null);
      setToast("Meal deleted. Daily totals updated.");
    } catch (e) {
      setDiaryError(errorMessage(e));
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  }
  function navigate(target: "overview" | "diary" | "plan") {
    setView(target);
    setTimeout(() => {
      (target === "diary"
        ? logRef.current
        : target === "overview"
          ? editorRef.current
          : null
      )?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
  }
  const filteredFoods = (
    searchFoods.length
      ? searchFoods
      : foods.filter((f) =>
          `${f.name} ${f.aliases.join(" ")}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
  ).slice(0, 30);

  function planMeal(
    items: DailyPlan["menu"][number]["items"],
    mealTitle: string,
  ) {
    const mealItems = items.flatMap((item) => {
      const food = foods.find((f) => f.id === item.foodId);
      return food
        ? [
            calculateItem(
              {
                id: crypto.randomUUID(),
                foodId: food.id,
                quantity: item.grams,
                unit: "g",
                gramsPerUnit: 1,
              },
              food,
            ),
          ]
        : [];
    });
    newDraft();
    setAnalysis({
      items: mealItems,
      totals: sumNutrients(mealItems),
      method: "manual",
      questions: [],
      assumptions: mealItems.map((i) => i.food.assumption),
      incomplete: false,
    });
    setTitle(mealTitle);
    setView("overview");
    setTimeout(
      () =>
        resultRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      100,
    );
  }
  const locked = busy || saving || recalculating;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            navigate("overview");
          }}
          aria-label="Platewise home"
        >
          <span className="brand-icon">
            <Utensils size={23} />
          </span>
          platewise<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">YOUR EVERYDAY COMPANION</div>
        <nav aria-label="Main navigation">
          <button
            className={`nav-item ${view === "overview" ? "selected" : ""}`}
            onClick={() => navigate("overview")}
          >
            <LayoutDashboard size={19} />
            Overview
            <ChevronRight size={15} className="nav-arrow" />
          </button>
          <button
            className={`nav-item ${view === "diary" ? "selected" : ""}`}
            onClick={() => navigate("diary")}
          >
            <BookOpen size={19} />
            Food diary
          </button>
          <button
            className={`nav-item ${view === "plan" ? "selected" : ""}`}
            onClick={() => navigate("plan")}
          >
            <Target size={19} />
            My nutrition plan
          </button>
          <button className="nav-item" onClick={() => setAbout(true)}>
            <CircleHelp size={19} />
            About your estimates
          </button>
        </nav>
        <div className="sidebar-note">
          <span className="leaf-icon">
            <Leaf size={22} />
          </span>
          <h3>
            Awareness starts
            <br />
            with a single meal.
          </h3>
          <p>No perfect plates. Just a little more understanding.</p>
          <button onClick={() => setAbout(true)}>
            Our approach <ArrowRight size={14} />
          </button>
        </div>
        <div className="account-nav">
          <button className="account-profile" onClick={onSettings}>
            <span>{user.name.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{user.name}</strong>
              <small>Edit your profile</small>
            </div>
            <ChevronRight size={14} />
          </button>
          <button className="logout-button" onClick={onLogout}>
            <LogOut size={13} />
            Sign out
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Your space <span>/</span>
            <strong>
              {view === "overview"
                ? "Overview"
                : view === "diary"
                  ? "Food diary"
                  : "My nutrition plan"}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="private-label">
              <ShieldCheck size={15} />
              Your private food diary
            </span>
            <button
              className="help-button"
              aria-label="How estimates work"
              onClick={() => setAbout(true)}
            >
              <CircleHelp size={19} />
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span /> A LITTLE MORE MINDFUL, A LITTLE LESS GUESSWORK
              </div>
              <h1>
                {view === "overview" ? (
                  <>
                    Know what’s on
                    <br className="mobile-break" /> your plate<span>.</span>
                  </>
                ) : view === "diary" ? (
                  "Your meals, at a glance."
                ) : (
                  "A plan with you in mind."
                )}
              </h1>
              <p>
                {view === "overview"
                  ? `Welcome back, ${user.name.split(" ")[0]}. Let’s make sense of your next meal.`
                  : view === "diary"
                    ? "A simple record of the meals you choose to save."
                    : "Your goals, your preferences, your pace."}
              </p>
            </div>
            <div className="heading-date">
              <span className="date-icon">
                <Clock3 size={18} />
              </span>
              <div>
                <small>ONE MEAL AT A TIME</small>
                <strong>
                  {new Date().toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </strong>
              </div>
            </div>
          </div>
          {setupError && (
            <Feedback message={setupError} retry={() => void initialize()} />
          )}
          {view === "plan" ? (
            <PlanView
              user={user}
              plan={plan}
              onSettings={onSettings}
              onAddMeal={planMeal}
              canLogMeals={foods.length > 0 && !locked}
            />
          ) : (
            <>
              <div className="dashboard-grid">
                <div className="main-column">
                  {view === "overview" && (
                    <section
                      className="card meal-input"
                      ref={editorRef}
                      aria-labelledby="add-title"
                    >
                      <div className="card-heading">
                        <div className="step-icon blue">
                          <Camera size={21} />
                        </div>
                        <div>
                          <h2 id="add-title">
                            {editing
                              ? "Refine your meal"
                              : "Let’s start with your meal"}
                          </h2>
                          <p>
                            {editing
                              ? "Update the description or adjust your foods below."
                              : "A photo helps. Your details make it better."}
                          </p>
                        </div>
                        <span className="small-tag">STEP 01</span>
                      </div>
                      <fieldset disabled={locked} className="input-fieldset">
                        <div
                          className={`photo-drop ${preview ? "has-photo" : ""} ${dragging ? "dragging" : ""}`}
                          onDragOver={(e) => {
                            e.preventDefault();
                            setDragging(true);
                          }}
                          onDragLeave={() => setDragging(false)}
                          onDrop={dropPhoto}
                        >
                          {preview ? (
                            <>
                              <img
                                className="meal-preview"
                                src={preview}
                                alt="Your meal, ready for analysis"
                              />
                              <div className="preview-label">
                                <CheckCircle2 size={15} /> Ready to analyze
                              </div>
                              <button
                                type="button"
                                className="remove-photo"
                                aria-label="Remove meal photo"
                                onClick={() => setPhoto(null)}
                              >
                                <X size={18} />
                              </button>
                              <button
                                type="button"
                                className="replace-photo"
                                onClick={() => uploadRef.current?.click()}
                              >
                                <Upload size={14} />
                                Change photo
                              </button>
                            </>
                          ) : (
                            <>
                              <span className="upload-illustration">
                                <ImagePlus size={33} strokeWidth={1.5} />
                                <span className="mini-spark">
                                  <Sparkles size={14} />
                                </span>
                              </span>
                              <h3>A little snapshot of your meal</h3>
                              <p>Drag a photo here, or choose one below</p>
                              <div className="upload-actions">
                                <button
                                  type="button"
                                  className="button button-white"
                                  onClick={() => uploadRef.current?.click()}
                                >
                                  <Upload size={16} />
                                  Upload photo
                                </button>
                                <button
                                  type="button"
                                  className="button button-quiet"
                                  onClick={() => cameraRef.current?.click()}
                                >
                                  <Camera size={16} />
                                  Use camera
                                </button>
                              </div>
                              <small>JPG, PNG or WebP · up to 8 MB</small>
                            </>
                          )}
                        </div>
                        <input
                          ref={uploadRef}
                          type="file"
                          className="sr-only"
                          accept="image/jpeg,image/png,image/webp"
                          aria-label="Upload meal photo"
                          onChange={fileChanged}
                        />
                        <input
                          ref={cameraRef}
                          type="file"
                          className="sr-only"
                          accept="image/jpeg,image/png,image/webp"
                          capture="environment"
                          aria-label="Take meal photo"
                          onChange={fileChanged}
                        />
                        <div className="description-heading">
                          <label htmlFor="description">
                            Describe your meal <span>Optional</span>
                          </label>
                          <button
                            type="button"
                            className="hint-button"
                            aria-label="Meal description tips"
                            onClick={() => setAbout(true)}
                          >
                            <Info size={15} />
                          </button>
                        </div>
                        <textarea
                          id="description"
                          maxLength={3000}
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="e.g. Two medium rotis without ghee and four bone-in chicken pieces with a little gravy…"
                          rows={3}
                        />
                        <p className="field-hint">
                          Tell us what’s in it, how it was cooked, and how much
                          you ate.
                        </p>
                        {!status?.visionAvailable && status && (
                          <div className="mode-note">
                            <span className="status-dot amber" />
                            <span>
                              Photo analysis needs a service key.{" "}
                              <strong>
                                Description & manual estimates are available.
                              </strong>
                            </span>
                          </div>
                        )}
                        <button
                          className="button button-primary analyze-button"
                          disabled={locked || (!photo && !description.trim())}
                          onClick={() => void analyze()}
                        >
                          {busy ? (
                            <>
                              <LoaderCircle size={19} className="spin" />
                              Estimating your meal…
                            </>
                          ) : (
                            <>
                              <Sparkles size={18} />
                              Estimate my meal
                              <ArrowRight size={18} />
                            </>
                          )}
                        </button>
                      </fieldset>
                      {analysisError && (
                        <>
                          <Feedback
                            message={analysisError}
                            retry={() => void analyze()}
                          />
                          {photo && description.trim() && (
                            <button
                              className="text-button fallback-button"
                              onClick={() => void analyze(false)}
                              disabled={locked}
                            >
                              Use my description without the photo{" "}
                              <ArrowRight size={14} />
                            </button>
                          )}
                        </>
                      )}
                      <div className="under-analyze">
                        <span>
                          <LockKeyhole size={12} />
                          Photos aren’t stored in your diary
                        </span>
                        <button onClick={manual} disabled={locked}>
                          <Plus size={13} />
                          Add foods manually
                        </button>
                      </div>
                      {photo && (
                        <p className="privacy-disclosure">
                          On analysis, this photo and description are sent to
                          OpenAI if configured. Photo metadata is removed first.{" "}
                          <button
                            className="inline-link"
                            onClick={() => setAbout(true)}
                          >
                            Details
                          </button>
                        </p>
                      )}
                    </section>
                  )}
                  {view === "overview" && analysis && (
                    <section
                      className="card results-card"
                      ref={resultRef}
                      aria-labelledby="result-title"
                    >
                      <div className="card-heading">
                        <div className="step-icon mint">
                          <Salad size={22} />
                        </div>
                        <div>
                          <h2 id="result-title">
                            {editing
                              ? "Edit saved meal"
                              : "Your meal, estimated"}
                          </h2>
                          <p>
                            {editing
                              ? "Saving updates the original entry."
                              : "Review the portions, then make it part of your day."}
                          </p>
                        </div>
                        <span className="small-tag">STEP 02</span>
                      </div>
                      <div className="result-status">
                        <span className="estimate-chip">
                          <Sparkles size={12} />
                          {dirty ? "Updated preview" : "Nutrition estimate"}
                        </span>
                        <span>
                          {analysis.method === "vision"
                            ? "Photo + your details"
                            : analysis.method === "description"
                              ? "From your description"
                              : "From your food selections"}
                        </span>
                      </div>
                      <div aria-live="polite">
                        <Nutrition values={analysis.totals} />
                      </div>
                      <div className="breakdown-heading">
                        <h3>What’s on the plate</h3>
                        <span>
                          {analysis.items.length}{" "}
                          {analysis.items.length === 1 ? "food" : "foods"}
                        </span>
                      </div>
                      <fieldset className="food-fieldset" disabled={locked}>
                        {analysis.items.length === 0 && (
                          <div className="empty-foods">
                            Choose a food to start building your estimate.
                          </div>
                        )}
                        {analysis.items.map((item, index) => (
                          <div className="food-row" key={item.id}>
                            <div className="food-row-top">
                              <div className="food-number">
                                {String(index + 1).padStart(2, "0")}
                              </div>
                              <div className="food-identity">
                                <label
                                  className="sr-only"
                                  htmlFor={`food-${item.id}`}
                                >
                                  Food {index + 1}
                                </label>
                                <select
                                  id={`food-${item.id}`}
                                  value={item.foodId}
                                  onChange={(e) =>
                                    chooseFood(index, e.target.value)
                                  }
                                >
                                  {!foods.some((f) => f.id === item.foodId) && (
                                    <option value={item.foodId}>
                                      {item.food.name}
                                    </option>
                                  )}
                                  {foods.map((f) => (
                                    <option key={f.id} value={f.id}>
                                      {f.name}
                                    </option>
                                  ))}
                                </select>
                                <a
                                  href={item.food.source.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  title={item.food.source.note}
                                >
                                  {item.food.source.label} ↗
                                </a>
                              </div>
                              <button
                                className="icon-button delete-food"
                                aria-label={`Remove ${item.food.name}`}
                                onClick={() =>
                                  updateItems(
                                    analysis.items.filter(
                                      (_, i) => i !== index,
                                    ),
                                  )
                                }
                              >
                                <X size={16} />
                              </button>
                            </div>
                            <div className="portion-edit">
                              <label>
                                Quantity
                                <input
                                  aria-label={`Quantity for ${item.food.name}`}
                                  type="number"
                                  min="0.01"
                                  max="10000"
                                  step="any"
                                  value={item.quantity || ""}
                                  onChange={(e) =>
                                    updateItem(index, {
                                      quantity: Number(e.target.value),
                                    })
                                  }
                                />
                              </label>
                              <label>
                                Portion
                                <select
                                  aria-label={`Portion for ${item.food.name}`}
                                  value={item.unit}
                                  onChange={(e) => {
                                    const p = item.food.portions.find(
                                      (p) => p.unit === e.target.value,
                                    )!;
                                    updateItem(index, {
                                      unit: p.unit,
                                      gramsPerUnit: p.grams,
                                    });
                                  }}
                                >
                                  {item.food.portions.map((p) => (
                                    <option key={p.unit} value={p.unit}>
                                      {p.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              {item.unit !== "g" && (
                                <label>
                                  Edible g / portion
                                  <input
                                    aria-label={`Edible grams per portion for ${item.food.name}`}
                                    type="number"
                                    min="0.01"
                                    max="5000"
                                    step="any"
                                    value={item.gramsPerUnit || ""}
                                    onChange={(e) =>
                                      updateItem(index, {
                                        gramsPerUnit: Number(e.target.value),
                                      })
                                    }
                                  />
                                </label>
                              )}
                            </div>
                            <div className="food-nutrients">
                              <span>{fmt(item.grams, 1)} g edible</span>
                              <strong>{fmt(item.nutrients.kcal)} kcal</strong>
                              <span>
                                {fmt(item.nutrients.protein, 1)} g protein
                              </span>
                              <span>{fmt(item.nutrients.fat, 1)} g fat</span>
                            </div>
                          </div>
                        ))}
                      </fieldset>
                      <div className="breakdown-actions">
                        <button
                          className="text-button"
                          onClick={() => {
                            setAddOpen(!addOpen);
                            setSearchError("");
                          }}
                          disabled={locked || analysis.items.length >= 40}
                        >
                          <Plus size={16} />
                          Add a food
                        </button>
                        <button
                          className="button button-small"
                          onClick={() => void recalculate()}
                          disabled={!validItems || locked}
                        >
                          {recalculating ? (
                            <LoaderCircle className="spin" size={14} />
                          ) : (
                            <RotateCcw size={14} />
                          )}
                          Recalculate
                        </button>
                      </div>
                      {addOpen && (
                        <div className="food-search">
                          <label htmlFor="food-search">Find a food</label>
                          <div className="search-input">
                            <Search size={16} />
                            <input
                              id="food-search"
                              placeholder="Try roti, chicken curry, rice…"
                              value={query}
                              onChange={(e) => {
                                setQuery(e.target.value);
                                setSearchFoods([]);
                              }}
                              autoFocus
                              disabled={locked}
                            />
                            {query && (
                              <button
                                aria-label="Clear food search"
                                onClick={() => {
                                  setQuery("");
                                  setSearchFoods([]);
                                }}
                              >
                                <X size={15} />
                              </button>
                            )}
                          </div>
                          {status?.usdaAvailable && (
                            <button
                              className="text-button database-search"
                              disabled={
                                searchBusy || query.trim().length < 2 || locked
                              }
                              onClick={() => void searchDatabase()}
                            >
                              {searchBusy ? (
                                <LoaderCircle className="spin" size={14} />
                              ) : (
                                <Search size={14} />
                              )}
                              Search USDA database
                            </button>
                          )}
                          {searchError && <Feedback message={searchError} />}
                          <div className="search-list">
                            {filteredFoods.map((food) => (
                              <button
                                key={food.id}
                                onClick={() => addFood(food)}
                                disabled={locked}
                              >
                                <span>
                                  <strong>{food.name}</strong>
                                  <small>
                                    {food.source.label} ·{" "}
                                    {fmt(food.per100.kcal)} kcal / 100 g
                                  </small>
                                </span>
                                <Plus size={17} />
                              </button>
                            ))}
                            {!filteredFoods.length && (
                              <p>
                                No matching foods.{" "}
                                {status?.usdaAvailable
                                  ? "Try the USDA search."
                                  : "Try a simpler food name. USDA search can be enabled on the server."}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                      {(analysis.questions.length > 0 ||
                        analysis.incomplete) && (
                        <div className="question-box">
                          <h3>
                            <CircleHelp size={17} />A few details would help
                          </h3>
                          <ul>
                            {analysis.questions.map((q, i) => (
                              <li key={i}>{q}</li>
                            ))}
                          </ul>
                          <p>
                            Add answers to “Describe your meal” above and
                            estimate again, or correct the food list here.
                          </p>
                          {analysis.incomplete && (
                            <label className="acknowledgment">
                              <input
                                type="checkbox"
                                checked={acknowledged}
                                onChange={(e) =>
                                  setAcknowledged(e.target.checked)
                                }
                                disabled={locked}
                              />
                              I reviewed the missing foods. The list above
                              includes everything I want to save.
                            </label>
                          )}
                        </div>
                      )}
                      <details className="assumptions">
                        <summary>
                          <Info size={15} />
                          What this estimate assumes
                          <ChevronDown size={16} />
                        </summary>
                        <ul>
                          {[
                            ...new Set([
                              ...analysis.assumptions,
                              ...analysis.items.map((i) => i.food.assumption),
                            ]),
                          ].map((a, i) => (
                            <li key={i}>{a}</li>
                          ))}
                        </ul>
                        <p>
                          Nutrition varies with ingredients and preparation.
                          Bones, peels, and pits are excluded. Any extra oil or
                          ghee beyond a recipe baseline should be added
                          separately.
                        </p>
                      </details>
                      <div className="save-section">
                        <div className="save-heading">
                          <CheckCircle2 size={18} />
                          <h3>
                            {editing
                              ? "Update your diary"
                              : "Looks right? Save your meal."}
                          </h3>
                        </div>
                        <div className="save-fields">
                          <label htmlFor="meal-title">
                            Meal name
                            <input
                              id="meal-title"
                              value={title}
                              onChange={(e) => setTitle(e.target.value)}
                              maxLength={100}
                              placeholder="e.g. Roti & chicken curry"
                              disabled={locked}
                            />
                          </label>
                          <label htmlFor="meal-date">
                            Date & time
                            <input
                              id="meal-date"
                              type="datetime-local"
                              value={eatenAt}
                              onChange={(e) => setEatenAt(e.target.value)}
                              required
                              disabled={locked}
                            />
                          </label>
                        </div>
                        <p className="field-hint">
                          Saved in your device’s local time zone. Only confirmed
                          meals count toward daily totals.
                        </p>
                        {editorError && <Feedback message={editorError} />}
                        <div className="save-actions">
                          <button
                            className="button button-primary"
                            disabled={
                              !validItems ||
                              !title.trim() ||
                              !eatenAt ||
                              locked ||
                              (analysis.incomplete && !acknowledged)
                            }
                            onClick={() => void saveMeal()}
                          >
                            {saving ? (
                              <LoaderCircle className="spin" size={17} />
                            ) : (
                              <Check size={17} />
                            )}{" "}
                            {saving
                              ? "Saving…"
                              : editing
                                ? "Save changes"
                                : "Confirm & save meal"}
                          </button>
                          <button
                            className="button button-quiet"
                            disabled={locked}
                            onClick={newDraft}
                          >
                            {editing ? "Cancel editing" : "Discard estimate"}
                          </button>
                        </div>
                      </div>
                    </section>
                  )}
                  {view === "overview" && !analysis && (
                    <div className="how-strip">
                      <div>
                        <span>1</span>
                        <p>Add your meal</p>
                      </div>
                      <ChevronRight size={15} />
                      <div>
                        <span>2</span>
                        <p>Review the estimate</p>
                      </div>
                      <ChevronRight size={15} />
                      <div>
                        <span>3</span>
                        <p>Save to your day</p>
                      </div>
                    </div>
                  )}
                </div>
                <aside className="insights-column">
                  <section className="card daily-card">
                    <div className="daily-heading">
                      <div>
                        <span className="eyebrow">YOUR DAILY PICTURE</span>
                        <h2>
                          {day === dateKey()
                            ? "Today’s intake"
                            : "Daily intake"}
                        </h2>
                      </div>
                      <span className="daily-icon">
                        <Flame size={21} />
                      </span>
                    </div>
                    <p className="daily-date">
                      {new Date(`${day}T12:00:00`).toLocaleDateString(
                        undefined,
                        { month: "long", day: "numeric" },
                      )}{" "}
                      · Confirmed meals only
                    </p>
                    {diaryLoading ? (
                      <div className="daily-loading" role="status">
                        <LoaderCircle className="spin" size={20} />
                        Loading your day…
                      </div>
                    ) : diaryError ? (
                      <p className="daily-unavailable">
                        Totals unavailable. Retry your diary below.
                      </p>
                    ) : (
                      <>
                        <div className="daily-calories">
                          <strong>{fmt(daily.kcal)}</strong>
                          <span>kcal estimated</span>
                          <div className="mini-flame">
                            <Flame size={27} strokeWidth={1.5} />
                          </div>
                        </div>
                        <div className="daily-macros">
                          <div>
                            <span className="macro-dot protein-dot" />
                            <span>Protein</span>
                            <strong>
                              {fmt(daily.protein, 1)} <small>g</small>
                            </strong>
                          </div>
                          <div>
                            <span className="macro-dot fat-dot" />
                            <span>Fat</span>
                            <strong>
                              {fmt(daily.fat, 1)} <small>g</small>
                            </strong>
                          </div>
                        </div>
                        <div className="daily-count">
                          <CheckCircle2 size={15} />
                          {meals.length} {meals.length === 1 ? "meal" : "meals"}{" "}
                          in your diary
                          <button
                            onClick={() => navigate("diary")}
                            aria-label="Go to food diary"
                          >
                            <ArrowRight size={16} />
                          </button>
                        </div>
                      </>
                    )}
                  </section>
                  <section className="clarity-card">
                    <div className="clarity-icon">
                      <Sparkles size={20} />
                    </div>
                    <span className="eyebrow">GOOD TO KNOW</span>
                    <h3>
                      Your details make
                      <br />a difference.
                    </h3>
                    <p>
                      A photo can’t see the cooking oil or weigh your portion. A
                      few words help fill in the gaps.
                    </p>
                    <div className="example-quote">
                      “Two rotis, no ghee,
                      <br />
                      and a little gravy.”
                    </div>
                    <button onClick={() => setAbout(true)}>
                      How estimates work <ArrowRight size={14} />
                    </button>
                  </section>
                  <div className="privacy-note">
                    <ShieldCheck size={20} />
                    <p>
                      <strong>Your meal. Your choice.</strong>Review every
                      estimate before it enters your diary.
                    </p>
                  </div>
                </aside>
              </div>
              <section
                className="diary-section"
                ref={logRef}
                aria-labelledby="diary-title"
              >
                <div className="diary-header">
                  <div>
                    <span className="eyebrow">ONE DAY, ONE PLACE</span>
                    <h2 id="diary-title">
                      Your food diary
                      <span className="count-badge">{meals.length}</span>
                    </h2>
                    <p>
                      {humanDay(day)}
                      {day === dateKey() ? " · Today" : ""}
                    </p>
                  </div>
                  <div className="day-controls">
                    <button
                      className="icon-button"
                      aria-label="Previous day"
                      onClick={() => setDay(changeDay(day, -1))}
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <input
                      type="date"
                      aria-label="Diary date"
                      value={day}
                      onChange={(e) => {
                        if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value))
                          setDay(e.target.value);
                      }}
                    />
                    <button
                      className="icon-button"
                      aria-label="Next day"
                      onClick={() => setDay(changeDay(day, 1))}
                    >
                      <ChevronRight size={18} />
                    </button>
                    {day !== dateKey() && (
                      <button
                        className="text-button"
                        onClick={() => setDay(dateKey())}
                      >
                        Today
                      </button>
                    )}
                  </div>
                </div>
                {diaryError && (
                  <Feedback
                    message={diaryError}
                    retry={() => setRevision((r) => r + 1)}
                  />
                )}
                {diaryLoading ? (
                  <div className="diary-empty" role="status">
                    <LoaderCircle size={24} className="spin" />
                    <p>Opening your diary…</p>
                  </div>
                ) : !diaryError && !meals.length ? (
                  <div className="diary-empty">
                    <span className="empty-diary-icon">
                      <BookOpen size={28} strokeWidth={1.5} />
                      <span>+</span>
                    </span>
                    <h3>A fresh page for your meals</h3>
                    <p>
                      Your confirmed meals will appear here.
                      <br />
                      Start with a photo or tell us what you ate.
                    </p>
                    <button
                      className="text-button"
                      onClick={() => {
                        setView("overview");
                        setTimeout(
                          () =>
                            editorRef.current?.scrollIntoView({
                              behavior: "smooth",
                              block: "start",
                            }),
                          50,
                        );
                      }}
                    >
                      Add your first meal <ArrowRight size={15} />
                    </button>
                  </div>
                ) : (
                  <div className="diary-list">
                    {meals.map((meal) => (
                      <article
                        className={`diary-meal ${editing?.id === meal.id ? "is-editing" : ""}`}
                        key={meal.id}
                      >
                        <div className="diary-meal-main">
                          <span className="meal-symbol">
                            <Utensils size={22} />
                          </span>
                          <div className="diary-meal-info">
                            <div className="meal-time">
                              <Clock3 size={12} />
                              {new Date(meal.eatenAt).toLocaleTimeString(
                                undefined,
                                { hour: "numeric", minute: "2-digit" },
                              )}
                              <span>·</span>
                              {meal.items.length}{" "}
                              {meal.items.length === 1 ? "food" : "foods"}
                            </div>
                            <h3>{meal.title}</h3>
                            <p>
                              {meal.items
                                .map(
                                  (i) =>
                                    `${round(i.quantity)} ${i.unit} ${i.food.name.toLowerCase()}`,
                                )
                                .join(" · ")}
                            </p>
                          </div>
                          <div className="diary-meal-actions">
                            <button
                              className="icon-button"
                              aria-label={`Edit ${meal.title}`}
                              onClick={() => editMeal(meal)}
                              disabled={locked}
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              className="icon-button delete-button"
                              aria-label={`Delete ${meal.title}`}
                              onClick={() => setDeleting(meal.id)}
                              disabled={deleteBusy || locked}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                        <Nutrition values={meal.totals} compact />
                        <details className="diary-details">
                          <summary>
                            Portions & assumptions
                            <ChevronDown size={14} />
                          </summary>
                          <ul>
                            {meal.items.map((i) => (
                              <li key={i.id}>
                                <strong>{i.food.name}</strong> ·{" "}
                                {fmt(i.grams, 1)} g edible ·{" "}
                                {fmt(i.nutrients.kcal)} kcal,{" "}
                                {fmt(i.nutrients.protein, 1)} g protein,{" "}
                                {fmt(i.nutrients.fat, 1)} g fat
                                <p>{i.food.assumption}</p>
                              </li>
                            ))}
                          </ul>
                          {meal.description && (
                            <p className="saved-description">
                              Your description: {meal.description}
                            </p>
                          )}
                        </details>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
          <footer className="page-footer">
            <span className="footer-brand">
              <Utensils size={15} />
              platewise.
            </span>
            <p>
              A little clarity on every plate. All nutrition values are
              estimates.
            </p>
            <button onClick={() => setAbout(true)}>
              Sources & privacy <ArrowRight size={12} />
            </button>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
          <button
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <X size={15} />
          </button>
        </div>
      )}
      {(about || deleting) && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !deleteBusy) {
              setAbout(false);
              setDeleting(null);
            }
          }}
        >
          <dialog
            open
            className="modal"
            aria-modal="true"
            aria-labelledby="modal-title"
            onKeyDown={(e) => {
              if (e.key === "Tab") {
                const focusable = Array.from(
                  e.currentTarget.querySelectorAll<HTMLElement>(
                    "button:not(:disabled), a[href], input:not(:disabled)",
                  ),
                );
                const first = focusable[0],
                  last = focusable.at(-1);
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last?.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first?.focus();
                }
              }
            }}
          >
            <button
              autoFocus
              className="modal-close icon-button"
              aria-label="Close dialog"
              disabled={deleteBusy}
              onClick={() => {
                setAbout(false);
                setDeleting(null);
              }}
            >
              <X size={20} />
            </button>
            {deleting ? (
              <>
                <div className="modal-symbol danger">
                  <Trash2 size={24} />
                </div>
                <h2 id="modal-title">Delete this meal?</h2>
                <p>
                  “{meals.find((m) => m.id === deleting)?.title}” will be
                  removed from your diary and daily totals.
                </p>
                <div className="modal-actions">
                  <button
                    className="button button-danger"
                    disabled={deleteBusy}
                    onClick={() => void deleteMeal()}
                  >
                    {deleteBusy ? (
                      <LoaderCircle size={16} className="spin" />
                    ) : (
                      <Trash2 size={16} />
                    )}
                    Delete meal
                  </button>
                  <button
                    className="button button-white"
                    disabled={deleteBusy}
                    onClick={() => setDeleting(null)}
                  >
                    Keep meal
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="modal-symbol">
                  <Leaf size={25} />
                </div>
                <span className="eyebrow">A LITTLE TRANSPARENCY</span>
                <h2 id="modal-title">Understanding your estimate</h2>
                <p>
                  Food is more than a number. This tool gives you a useful
                  starting point, with room for what you know about your meal.
                </p>
                <h3>What goes into the numbers</h3>
                <p>
                  Our local food list uses 25 real USDA Standard Reference 28
                  records. Roti, chicken curry, and dal use documented
                  ingredient-based recipe estimates. Serving weights and cooking
                  fats are assumptions you can edit. Optional USDA FoodData
                  Central search expands the list.
                </p>
                <h3>Your words come first</h3>
                <p>
                  Explicit quantities override visual guesses. For bone-in
                  chicken, only the estimated edible meat and gravy count.
                  Change the edible grams per portion when your pieces differ.
                  Add extra oil separately when it exceeds a recipe’s baseline.
                </p>
                <h3>Photo analysis & privacy</h3>
                <p>
                  When configured, OpenAI identifies foods and estimates
                  portions. Photos are resized and metadata is stripped before
                  processing. Photos are not written to disk or saved in the
                  diary. OpenAI processes the photo and description under its
                  API data policies; setting store to false does not guarantee
                  zero provider retention.
                </p>
                <p>
                  Saved meal names, descriptions, times, and nutrition are
                  stored in this app’s server database. Meals belong to your
                  signed-in account. Server administrators can access the
                  database; secure the deployment and backups.
                </p>
                <h3>Enable photo recognition · owner setup</h3>
                <ol className="photo-setup-steps">
                  <li>
                    Open{" "}
                    <a
                      href="https://platform.openai.com/api-keys"
                      target="_blank"
                      rel="noreferrer"
                    >
                      OpenAI API keys ↗
                    </a>{" "}
                    and create a private key.
                  </li>
                  <li>
                    Enable{" "}
                    <a
                      href="https://platform.openai.com/settings/organization/billing/overview"
                      target="_blank"
                      rel="noreferrer"
                    >
                      API billing ↗
                    </a>
                    . A ChatGPT subscription does not include API usage.
                  </li>
                  <li>
                    Add the key to the server’s untracked .env file as
                    MEAL_VISION_API_KEY, then restart the app. Never paste a key
                    into chat or GitHub.
                  </li>
                </ol>
                <p>
                  <a
                    href="https://github.com/dhyanshaj/Calorie-tracker/blob/main/docs/PHOTO-SETUP.md"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Step-by-step Chromebook photo setup ↗
                  </a>
                </p>
                <h3>What works here</h3>
                <p>
                  {status?.visionAvailable
                    ? "Photo recognition is configured."
                    : "Photo recognition is not configured. Add MEAL_VISION_API_KEY on the server to enable it."}{" "}
                  Description estimates work with the local food list;
                  unfamiliar dishes need manual selection or clarification.{" "}
                  {status?.usdaAvailable
                    ? "USDA search is configured."
                    : "USDA_API_KEY is optional for live food search."}
                </p>
                <div className="source-links">
                  <a
                    href="https://fdc.nal.usda.gov/data-documentation.html"
                    target="_blank"
                    rel="noreferrer"
                  >
                    USDA data documentation ↗
                  </a>
                  <a
                    href="https://platform.openai.com/docs/guides/your-data"
                    target="_blank"
                    rel="noreferrer"
                  >
                    OpenAI data policy ↗
                  </a>
                </div>
              </>
            )}
          </dialog>
        </div>
      )}
    </div>
  );
}
