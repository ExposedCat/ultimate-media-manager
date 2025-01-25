import fs from "node:fs/promises";

export async function deleteFile(path: string) {
	await fs.unlink(path);
}
