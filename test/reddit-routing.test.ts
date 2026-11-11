import { assert, assertEquals, assertRejects } from "jsr:@std/assert@^1";
import { downloadWithPostfetch } from "../src/services/postfetch.ts";

const id = "1xo45dd";
const url = `https://www.reddit.com/r/teenagers/comments/${id}/haircut/`;
const image = "https://i.redd.it/photo.jpeg";

function fixture(status = 200) {
	const requests: string[] = [];
	const fetcher: typeof fetch = async (input, init) => {
		const target = String(input);
		requests.push(target);
		if (target.endsWith("/access_token")) {
			return Response.json({ access_token: "test-token" });
		}
		if (target.startsWith("https://oauth.reddit.com/")) {
			return status === 200
				? Response.json([
						{
							data: {
								children: [
									{
										data: {
											id,
											title: "Haircut",
											post_hint: "image",
											url: image,
										},
									},
								],
							},
						},
					])
				: new Response(null, { status });
		}
		if (target === url || target.endsWith("/.rss?limit=1")) {
			return new Response(null, { status: 403 });
		}
		if (target === image) {
			return new Response(
				init?.method === "HEAD" ? null : Uint8Array.of(255, 216, 255, 217),
				{ headers: { "content-length": "4", "content-type": "image/jpeg" } },
			);
		}
		throw new Error(`Unexpected request: ${target}`);
	};
	return { fetch: fetcher, requests };
}

for (const blocked of [true, false]) {
	Deno.test(blocked
		? "Reddit retries denied WARP access with direct resolution and media download"
		: "Reddit keeps successful resolution and media download on WARP", async () => {
		const original = globalThis.fetch;
		const proxy = fixture(blocked ? 403 : 200);
		const direct = fixture();
		globalThis.fetch = direct.fetch;
		try {
			const result = await downloadWithPostfetch(url, {}, proxy.fetch);
			assert(result?.type === "single");
			assertEquals(result.file.data, Uint8Array.of(255, 216, 255, 217));
			assertEquals(result.metadata?.title, "Haircut");
			assertEquals(proxy.requests.includes(image), !blocked);
			assertEquals(direct.requests.includes(image), blocked);
			if (!blocked) assertEquals(direct.requests, []);
		} finally {
			globalThis.fetch = original;
		}
	});
}

Deno.test("Reddit does not retry a missing post through another route", async () => {
	const original = globalThis.fetch;
	const direct = fixture();
	globalThis.fetch = direct.fetch;
	try {
		await assertRejects(
			() => downloadWithPostfetch(url, {}, fixture(404).fetch),
			Error,
			"Reddit post failed: 404",
		);
		assertEquals(direct.requests, []);
	} finally {
		globalThis.fetch = original;
	}
});

Deno.test("Reddit stops after one direct retry if both routes deny access", async () => {
	const original = globalThis.fetch;
	const direct = fixture(403);
	globalThis.fetch = direct.fetch;
	try {
		await assertRejects(
			() => downloadWithPostfetch(url, {}, fixture(403).fetch),
			Error,
			"Reddit post failed: 403",
		);
		assertEquals(
			direct.requests.filter((target) => target.endsWith("/access_token"))
				.length,
			1,
		);
	} finally {
		globalThis.fetch = original;
	}
});
