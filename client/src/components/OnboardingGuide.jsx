import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Compass,
  MapPin,
  RotateCcw,
  X,
} from "lucide-react";

/* ------------------------------------------------------------------
   Persistent storage
   - Per-page:   smartstock-guide-<pageKey>
   - Site tour:  smartstock-tour  (records last page/step across visits)
------------------------------------------------------------------- */
const STORAGE_PREFIX = "smartstock-guide-";
const TOUR_KEY = "smartstock-tour";
const OPEN_GUIDE_EVENT = "smartstock:open-guide";

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable - non-fatal */
  }
}

const readGuideState = (pageKey) =>
  readJSON(`${STORAGE_PREFIX}${pageKey}`, null);

const saveGuideState = (pageKey, state) =>
  writeJSON(`${STORAGE_PREFIX}${pageKey}`, state);

const readTour = () => readJSON(TOUR_KEY, null);

/* ------------------------------------------------------------------
   DOM helpers (router- and async-friendly)
------------------------------------------------------------------- */
const isRendered = (el) => Boolean(el && el.getClientRects().length > 0);

function findGuideElement(selector) {
  if (!selector) return null;

  let candidates = [];

  if (selector.startsWith("text=")) {
    const text = selector.replace(/^text\s*=\s*/, "").trim();
    candidates = [...document.querySelectorAll("body *")].filter(
      (el) => el.textContent && el.textContent.trim().includes(text)
    );
  } else if (selector.includes(":has-text(")) {
    const match = selector.match(/:has-text\((.*?)\)/);
    if (match) {
      const text = match[1].replace(/['"]/g, "").trim();
      candidates = [...document.querySelectorAll("body *")].filter(
        (el) => el.textContent && el.textContent.trim().includes(text)
      );
    }
  } else {
    candidates = [...document.querySelectorAll(selector)];

    // Router-agnostic fallback: HashRouter (Electron) anchors use href="#/path"
    if (!candidates.length && /^a\[href='[^']+'\]$/.test(selector)) {
      const href = selector.match(/a\[href='([^']+)'\]/)[1];
      candidates = [...document.querySelectorAll(`a[href='#${href}']`)];
    }
  }

  // Keep only elements that are actually rendered on screen
  const visible = candidates.filter(isRendered);
  if (!visible.length) return null;

  // When the selector named an element tag (e.g. button/input/a), keep only it
  const tagMatch = selector.match(/^([a-zA-Z][\w-]*?)(?=[\[:.#]|$)/);
  const tag = tagMatch && tagMatch[1].toLowerCase();
  const filtered = tag
    ? visible.filter((el) => el.tagName.toLowerCase() === tag)
    : visible;
  const pool = filtered.length ? filtered : visible;

  // Most specific match = shortest own text (deepest node that contains the label)
  pool.sort(
    (a, b) =>
      (a.textContent || "").trim().length - (b.textContent || "").trim().length
  );
  return pool[0];
}

/* ------------------------------------------------------------------
   Component - self-guided tour
------------------------------------------------------------------- */
export default function OnboardingGuide({
  pageKey,
  steps = [],
  nextPage,
  nextPageLabel,
  startOpen = true,
  title = "Quick guide",
}) {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [targetEl, setTargetEl] = useState(null);
  const [highlightRect, setHighlightRect] = useState(null);

  const count = steps.length;
  const safeIndex = Math.min(currentIndex, Math.max(0, count - 1));
  const currentStep = steps[safeIndex] || null;
  const isLast = count > 0 && safeIndex === count - 1;

  /* ---- Open on first visit (or resume exactly where the user left off). ---- */
  useEffect(() => {
    if (!pageKey || !count || !startOpen) return;

    const saved = readGuideState(pageKey);
    // Completed or skipped tours do not auto-reopen, but stay replayable.
    if (saved?.completed || saved?.skipped) {
      setIsOpen(false);
      return;
    }

    const index = Math.max(0, Number(saved?.currentIndex) || 0);
    setCurrentIndex(Math.min(index, count - 1));
    setResuming(Boolean(saved && saved.currentIndex > 0));
    setIsOpen(true);
  }, [pageKey, count, startOpen]);

  /* ---- Replay support: "Help / Guide" buttons dispatch this event. ---- */
  useEffect(() => {
    const openGuide = () => {
      if (!pageKey || !count) return;
      const saved = readGuideState(pageKey);
      const restart = saved?.completed || saved?.skipped;
      const index = restart ? 0 : Math.max(0, Number(saved?.currentIndex) || 0);
      setCurrentIndex(Math.min(index, count - 1));
      setResuming(!restart && index > 0);
      setIsOpen(true);
    };
    window.addEventListener(OPEN_GUIDE_EVENT, openGuide);
    return () => window.removeEventListener(OPEN_GUIDE_EVENT, openGuide);
  }, [pageKey, count]);

  /* ---- Record every visited step + keep the site-wide tour in sync. ---- */
  useEffect(() => {
    if (!isOpen || !pageKey || !count) return;

    const saved = readGuideState(pageKey) || {};
    const history = Array.isArray(saved.history) ? saved.history : [];
    if (history[history.length - 1] !== safeIndex) history.push(safeIndex);

    saveGuideState(pageKey, {
      currentIndex: safeIndex,
      completed: false,
      skipped: false,
      startedAt: saved.startedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      history,
    });

    const tour = readTour() || {};
    writeJSON(TOUR_KEY, {
      ...tour,
      startedAt: tour.startedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastPage: pageKey,
      lastStepIndex: safeIndex,
      visitedPages: tour.visitedPages?.includes(pageKey)
        ? tour.visitedPages
        : [...(tour.visitedPages || []), pageKey],
      completedPages: tour.completedPages || [],
    });
  }, [isOpen, pageKey, safeIndex, count]);

  /* ---- Find the highlighted element (retries for async-rendered content). ---- */
  useEffect(() => {
    if (!isOpen || !currentStep?.selector) {
      setTargetEl(null);
      setHighlightRect(null);
      return;
    }

    let settled = false;
    let attempts = 0;

    const locate = () => {
      if (settled || attempts > 25) {
        if (attempts > 25) setTargetEl(null);
        return;
      }
      attempts += 1;
      const el = findGuideElement(currentStep.selector);
      if (el) {
        settled = true;
        setTargetEl(el);
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    };

    locate();

    const timer = setInterval(() => {
      if (settled) {
        clearInterval(timer);
        return;
      }
      locate();
    }, 400);

    return () => clearInterval(timer);
  }, [isOpen, currentStep, pageKey]);

  /* ---- Track the target rect (stays accurate on scroll / resize / anim). ---- */
  useEffect(() => {
    if (!targetEl) {
      setHighlightRect(null);
      return;
    }

    let raf;
    const sync = () => {
      const r = targetEl.getBoundingClientRect();
      const next = { left: r.left, top: r.top, width: r.width, height: r.height };
      setHighlightRect((prev) => {
        if (
          prev &&
          Math.abs(prev.left - next.left) < 1 &&
          Math.abs(prev.top - next.top) < 1 &&
          Math.abs(prev.width - next.width) < 1 &&
          Math.abs(prev.height - next.height) < 1
        ) {
          return prev;
        }
        return next;
      });
      raf = requestAnimationFrame(sync);
    };

    raf = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(raf);
  }, [targetEl]);


  /* ---- Actions ---- */
  const saveState = (index, { completed = false, skipped = false } = {}) => {
    const saved = readGuideState(pageKey) || {};
    saveGuideState(pageKey, {
      currentIndex: index,
      completed,
      skipped,
      startedAt: saved.startedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      history: saved.history || [],
    });
  };

  const markCompleted = () => {
    if (!pageKey) return;
    saveState(safeIndex, { completed: true });

    const tour = readTour() || {};
    writeJSON(TOUR_KEY, {
      ...tour,
      startedAt: tour.startedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastPage: pageKey,
      lastStepIndex: safeIndex,
      visitedPages: tour.visitedPages?.includes(pageKey)
        ? tour.visitedPages
        : [...(tour.visitedPages || []), pageKey],
      completedPages: [
        ...new Set([...(tour.completedPages || []), pageKey]),
      ],
    });
  };

  const handleClose = () => {
    setIsOpen(false); // currentIndex is persisted by the recording effect
  };

  const handleSkip = () => {
    if (!pageKey) return setIsOpen(false);
    saveState(0, { skipped: true });
    setIsOpen(false);
  };

  const handleNext = () => {
    if (!currentStep) return;

    if (isLast) {
      markCompleted();
      setIsOpen(false);
      if (nextPage) navigate(nextPage, { replace: false });
      return;
    }
    setCurrentIndex((i) => i + 1);
  };

  const handlePrevious = () => {
    setCurrentIndex((i) => Math.max(0, i - 1));
  };

  const handleStay = () => {
    markCompleted();
    setIsOpen(false);
  };

  if (!isOpen || !currentStep) return null;

  return (
    <>
      {/* Soft dim - the page stays fully interactive behind the guide */}
      <div className="pointer-events-none fixed inset-0 z-[65] bg-slate-900/10 dark:bg-black/30" />

      {/* Spotlight ring around the guide target */}
      {highlightRect && (
        <div
          className="pointer-events-none fixed z-[70] rounded-lg border-2 border-blue-500 ring-4 ring-blue-500/30"
          style={{
            left: highlightRect.left,
            top: highlightRect.top,
            width: highlightRect.width,
            height: highlightRect.height,
            boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.35)",
            transition:
              "left 120ms linear, top 120ms linear, width 120ms linear, height 120ms linear",
          }}
        />
      )}

      {/* Guide dialog */}
      <div className="fixed bottom-4 right-4 z-[80] w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        {/* Header */}
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
              <Compass size={18} />
            </span>
            <div>
              <p className="text-sm font-bold leading-tight text-slate-900 dark:text-white">
                {title}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                SmartStock self-guided tour
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            title="Close (progress is saved)"
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        {/* Resume notice */}
        {resuming && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            <RotateCcw size={13} className="shrink-0" />
            Welcome back - resuming where you left off (step {safeIndex + 1}).
          </div>
        )}

        {/* Progress bar */}
        <div className="mb-4 flex gap-1.5">
          {steps.map((_, idx) => (
            <div
              key={idx}
              className={`h-1.5 flex-1 rounded-full ${
                idx <= safeIndex ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-700"
              }`}
            />
          ))}
        </div>


        {/* Step content */}
        <div className="mb-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
            Step {safeIndex + 1} of {count}
          </p>
          <h4 className="mb-1 text-lg font-bold leading-snug text-slate-900 dark:text-white">
            {currentStep.title}
          </h4>
          <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
            {currentStep.description}
          </p>
        </div>

        {/* Auto-save note */}
        <p className="mb-4 flex items-start gap-1.5 text-[11px] leading-5 text-slate-400 dark:text-slate-500">
          <MapPin size={12} className="mt-0.5 shrink-0" />
          Steps are recorded automatically - if you close this window, we return you to
          this exact spot next time.
        </p>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrevious}
            disabled={safeIndex === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ChevronLeft size={16} />
            Back
          </button>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={handleSkip}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              Skip
            </button>

            {isLast ? (
              <>
                <button
                  type="button"
                  onClick={handleStay}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Stay here
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  {nextPage && nextPageLabel
                    ? `Continue to ${nextPageLabel}`
                    : "Finish tour"}
                  <ArrowRight size={16} />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleNext}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                Next
                <ChevronRight size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

