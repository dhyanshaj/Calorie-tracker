import { useCallback, useEffect, useRef, useState } from "react";
import type { ProgramState } from "../shared/program";
import { api } from "./api";
export function usePlanProgram() {
  const [state, setState] = useState<ProgramState | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const busyRef = useRef(false);
  const [pendingDay, setPendingDay] = useState<{
    day: number;
    completed: boolean;
  } | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setState(await api<ProgramState>("/api/plan-program"));
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not load your checklist.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    let current = true;
    api<ProgramState>("/api/plan-program")
      .then((result) => {
        if (current) setState(result);
      })
      .catch((error) => {
        if (current)
          setError(
            error instanceof Error
              ? error.message
              : "Could not load your checklist.",
          );
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, []);
  useEffect(() => {
    const now = Date.now();
    const boundaries = [state?.access.trialEndsAt, state?.access.paidUntil]
      .filter((value): value is string => !!value)
      .map((value) => new Date(value).getTime())
      .filter((value) => value > now);
    if (!boundaries.length) return;
    const timer = window.setTimeout(
      () => void refresh(),
      Math.min(Math.min(...boundaries) - now + 1000, 2147483647),
    );
    return () => window.clearTimeout(timer);
  }, [state?.access.trialEndsAt, state?.access.paidUntil, refresh]);
  async function mutate(url: string, body?: unknown, method = "POST") {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      setState(
        await api<ProgramState>(url, {
          method,
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
      );
      return true;
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not update the plan. Try again.",
      );
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function complete(day: number, completed: boolean) {
    if (!state?.program || busyRef.current) return;
    setPendingDay({ day, completed });
    await mutate(
      `/api/plan-program/${state.program.id}/days/${day}`,
      { completed },
      "PUT",
    );
    setPendingDay(null);
  }
  return {
    state,
    setState,
    loading,
    busy,
    error,
    refresh,
    pendingDay,
    start: () => mutate("/api/plan-program/start"),
    next: () => mutate("/api/plan-program/next"),
    complete,
  };
}
