import fs from 'fs/promises'

export async function deleteFile(path: string) {
	await fs.unlink(path)
}
