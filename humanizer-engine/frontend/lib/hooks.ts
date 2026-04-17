"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/** Persist a value to localStorage under `key`. SSR-safe. */
export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial)
  const hydrated = useRef(false)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key)
      if (raw !== null) setValue(JSON.parse(raw) as T)
    } catch {}
    hydrated.current = true
  }, [key])

  useEffect(() => {
    if (!hydrated.current) return
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch {}
  }, [key, value])

  return [value, setValue] as const
}

type Combo = {
  key: string | string[]
  meta?: boolean
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  preventDefault?: boolean
}

/** Register a global keyboard shortcut. */
export function useKeyboardShortcut(combo: Combo, handler: (e: KeyboardEvent) => void) {
  const saved = useRef(handler)
  useEffect(() => {
    saved.current = handler
  }, [handler])

  useEffect(() => {
    const keys = Array.isArray(combo.key) ? combo.key : [combo.key]
    const lower = keys.map((k) => k.toLowerCase())

    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      const inField =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target?.getAttribute("contenteditable") === "true"

      const k = e.key.toLowerCase()
      if (!lower.includes(k)) return
      if (combo.meta !== undefined && combo.meta !== (e.metaKey || e.ctrlKey)) return
      if (combo.ctrl !== undefined && combo.ctrl !== e.ctrlKey) return
      if (combo.shift !== undefined && combo.shift !== e.shiftKey) return
      if (combo.alt !== undefined && combo.alt !== e.altKey) return

      const hasModifier = e.metaKey || e.ctrlKey || e.altKey
      if (inField && !hasModifier && !combo.shift) return

      if (combo.preventDefault) e.preventDefault()
      saved.current(e)
    }

    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    Array.isArray(combo.key) ? combo.key.join(",") : combo.key,
    combo.meta,
    combo.ctrl,
    combo.shift,
    combo.alt,
    combo.preventDefault,
  ])
}

/** Returns true after the component has mounted on the client. */
export function useMounted() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted
}

/** Debounce a rapidly changing value. */
export function useDebouncedValue<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

/** Count-up animation for numbers. */
export function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0)
  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number | null>(null)
  const fromRef = useRef(0)

  useEffect(() => {
    fromRef.current = value
    startRef.current = null

    const tick = (ts: number) => {
      if (startRef.current === null) startRef.current = ts
      const elapsed = ts - startRef.current
      const t = Math.min(1, elapsed / duration)
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
      const next = fromRef.current + (target - fromRef.current) * eased
      setValue(next)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration])

  return value
}

/** Simple event-bus for cross-component commands. */
const listeners = new Map<string, Set<(detail: unknown) => void>>()

export function emit(event: string, detail?: unknown) {
  listeners.get(event)?.forEach((fn) => fn(detail))
}

export function useEventBus(event: string, handler: (detail: unknown) => void) {
  const saved = useRef(handler)
  useEffect(() => {
    saved.current = handler
  }, [handler])
  useEffect(() => {
    const set = listeners.get(event) ?? new Set()
    const fn = (d: unknown) => saved.current(d)
    set.add(fn)
    listeners.set(event, set)
    return () => {
      set.delete(fn)
    }
  }, [event])
}

export function useStableCallback<T extends (...args: any[]) => any>(fn: T) {
  const ref = useRef(fn)
  useEffect(() => {
    ref.current = fn
  }, [fn])
  return useCallback((...args: Parameters<T>) => ref.current(...args), []) as T
}
