import { useCallback, useEffect, useMemo, useState } from "react"

/**
 * Form state with a baseline for dirty tracking.
 *
 * `initial` must be referentially stable (wrap it in useMemo at the caller).
 * When the saved source changes, both the values and baseline reset so the
 * form never shows a stale draft.
 */
export function useDirtyForm<T extends Record<string, string>>(initial: T) {
	const [values, setValues] = useState<T>(initial)
	const [baseline, setBaseline] = useState<T>(initial)

	useEffect(() => {
		setValues(initial)
		setBaseline(initial)
	}, [initial])

	const dirty = useMemo(() => {
		return Object.keys(initial).some((key) => values[key] !== baseline[key])
	}, [initial, values, baseline])

	const setField = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
		setValues((current) => ({ ...current, [key]: value }))
	}, [])

	const reset = useCallback(() => {
		setValues(baseline)
	}, [baseline])

	const commit = useCallback(
		(next?: T) => {
			const committed = next ?? values
			setValues(committed)
			setBaseline(committed)
		},
		[values]
	)

	return { values, setField, setValues, dirty, reset, commit }
}
