export async function deletePaths(paths: string[]) {
	const results = await Promise.allSettled(
		paths.map((path) => Deno.remove(path, { recursive: true })),
	);
	for (const result of results) {
		if (result.status === "rejected") {
			console.error("[Failed to delete temp path]", result.reason);
		}
	}
}
