"use client";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
const BestContext = createContext<{
  best: Record<string, number>;
  record: (slug: string, ms: number) => void;
} | null>(null);
export function SessionBestProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [best, setBest] = useState<Record<string, number>>({});
  const record = useCallback(
    (slug: string, ms: number) =>
      setBest((v) => ({
        ...v,
        [slug]: Math.min(v[slug] ?? Number.POSITIVE_INFINITY, ms),
      })),
    [],
  );
  const value = useMemo(() => ({ best, record }), [best, record]);
  return <BestContext.Provider value={value}>{children}</BestContext.Provider>;
}
export function useSessionBest() {
  const v = useContext(BestContext);
  if (!v) throw new Error("SessionBestProvider missing");
  return v;
}
