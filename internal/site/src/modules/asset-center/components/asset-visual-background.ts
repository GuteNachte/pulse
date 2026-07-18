export function removeEdgeConnectedPlainBackground(pixels: Uint8ClampedArray, width: number, height: number) {
	if (width <= 0 || height <= 0 || pixels.length < width * height * 4) return false
	const visited = new Uint8Array(width * height)
	const queue = new Int32Array(width * height)
	let head = 0
	let tail = 0

	const isPlainBackground = (index: number) => {
		const offset = index * 4
		const red = pixels[offset]
		const green = pixels[offset + 1]
		const blue = pixels[offset + 2]
		return Math.min(red, green, blue) >= 228 && Math.max(red, green, blue) - Math.min(red, green, blue) <= 20
	}
	const enqueue = (index: number) => {
		if (visited[index] || !isPlainBackground(index)) return
		visited[index] = 1
		queue[tail++] = index
	}

	for (let x = 0; x < width; x++) {
		enqueue(x)
		enqueue((height - 1) * width + x)
	}
	for (let y = 1; y < height - 1; y++) {
		enqueue(y * width)
		enqueue(y * width + width - 1)
	}

	let removed = 0
	while (head < tail) {
		const index = queue[head++]
		pixels[index * 4 + 3] = 0
		removed++
		const x = index % width
		if (x > 0) enqueue(index - 1)
		if (x < width - 1) enqueue(index + 1)
		if (index >= width) enqueue(index - width)
		if (index < width * (height - 1)) enqueue(index + width)
	}
	return removed > 0
}
