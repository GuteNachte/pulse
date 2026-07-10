export type LatestRequestToken = {
	generation: number
}

/** Prevents a superseded request from committing state after a newer refresh begins. */
export function createLatestRequestGuard() {
	let current: LatestRequestToken | undefined
	let generation = 0

	return {
		begin(): LatestRequestToken {
			generation += 1
			current = { generation }
			return current
		},
		isCurrent(token: LatestRequestToken): boolean {
			return current?.generation === token.generation
		},
	}
}
