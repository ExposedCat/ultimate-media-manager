import fs from 'fs'
import type { ReadableStream } from 'node:stream/web'
import { pipeline } from 'stream/promises'

export async function downloadFile(url: string, path: string) {
	const response = await fetch(url)
	if (!response.ok || !response.body) {
		throw new Error('failed to download file: fetch failed')
	}
	const output = fs.createWriteStream(path)
	return pipeline(response.body as ReadableStream, output)
}
