'use client'

import * as React from 'react'

type ToastProps = {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactElement
  variant?: 'default' | 'destructive'
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

type Toast = ToastProps

const TOAST_LIMIT = 1

let count = 0
function genId() {
  count = (count + 1) % Number.MAX_VALUE
  return count.toString()
}

type Action =
  | { type: 'ADD_TOAST'; toast: Toast }
  | { type: 'UPDATE_TOAST'; toast: Partial<Toast> }
  | { type: 'DISMISS_TOAST'; toastId?: string }
  | { type: 'REMOVE_TOAST'; toastId?: string }

interface State {
  toasts: Toast[]
}

const listeners: Array<(state: State) => void> = []
let memoryState: State = { toasts: [] }

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action)
  listeners.forEach((listener) => listener(memoryState))
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ADD_TOAST':
      return { ...state, toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT) }
    case 'UPDATE_TOAST':
      return { ...state, toasts: state.toasts.map((t) => (t.id === action.toast.id ? { ...t, ...action.toast } : t)) }
    case 'DISMISS_TOAST':
      return { ...state, toasts: state.toasts.map((t) => (action.toastId == null || t.id === action.toastId ? { ...t, open: false } : t)) }
    case 'REMOVE_TOAST':
      return { ...state, toasts: action.toastId == null ? [] : state.toasts.filter((t) => t.id !== action.toastId) }
  }
}

function toast({ ...props }: Omit<Toast, 'id'>) {
  const id = genId()
  dispatch({ type: 'ADD_TOAST', toast: { ...props, id, open: true, onOpenChange: (open) => { if (!open) dispatch({ type: 'DISMISS_TOAST', toastId: id }) } } })
  return { id, dismiss: () => dispatch({ type: 'DISMISS_TOAST', toastId: id }), update: (props: Partial<Toast>) => dispatch({ type: 'UPDATE_TOAST', toast: { ...props, id } }) }
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState)
  React.useEffect(() => {
    listeners.push(setState)
    return () => { const i = listeners.indexOf(setState); if (i > -1) listeners.splice(i, 1) }
  }, [state])
  return { ...state, toast, dismiss: (toastId?: string) => dispatch({ type: 'DISMISS_TOAST', toastId }) }
}

export { useToast, toast }
export type { Toast, ToastProps }
