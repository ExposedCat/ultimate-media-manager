import fs from "node:fs/promises";

export async function deleteFiles(filePaths: string[]) {
	const results = await Promise.allSettled(
		filePaths.map((filePath) => fs.unlink(filePath)),
	);
	for (const result of results) {
		if (result.status === "rejected") {
			console.error("[Failed to delete temp file]", result.reason);
		}
	}
}
