// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useCallback, useReducer } from "react";

// A form's whole state in one reducer, with one action per field: `key` picks
// the field and `value` is checked against that field's own type, so a typo or
// a mismatched value is a compile error rather than a silent `any`.
type FormAction<S> =
  | { [K in keyof S]: { type: "set"; key: K; value: S[K] } }[keyof S]
  | { type: "reset"; state: S };

// The setter the form's sections are handed instead of a pile of `onChange`s.
export type FormSetter<S> = <K extends keyof S>(key: K, value: S[K]) => void;

function formReducer<S>(state: S, action: FormAction<S>): S {
  if (action.type === "reset") return action.state;
  // Bail out on a no-op write the way `useState` does: a child that re-reports
  // the value it already reported (a validity callback, say) must not spin the
  // component through another render.
  if (state[action.key] === action.value) return state;
  return { ...state, [action.key]: action.value };
}

// `reset` replaces the whole state — used when the server hands back the record
// the form is editing, on load and again after a save.
export function useFormReducer<S>(
  initial: S,
): [S, FormSetter<S>, (state: S) => void] {
  const [state, dispatch] = useReducer(formReducer<S>, initial);
  const set = useCallback<FormSetter<S>>((key, value) => {
    // The generic `key`/`value` pair is exactly one member of the action union,
    // but only the caller's instantiation knows which one.
    dispatch({ type: "set", key, value } as FormAction<S>);
  }, []);
  const reset = useCallback(
    (next: S) => dispatch({ type: "reset", state: next }),
    [],
  );
  return [state, set, reset];
}
