import { assertEquals } from "jsr:@std/assert@^1";

import {
	matchDownloadCommandInput,
	matchInput,
	normalizeInputUrl,
} from "../src/services/sources.ts";

Deno.test("matches Instagram posts with an optional username and query parameters", () => {
	for (const matcher of [matchInput, matchDownloadCommandInput]) {
		for (const path of [
			"p/DbvaYYcEwwy/",
			"_.ved.musical._/p/DbvaYYcEwwy/",
			"reel/DbvaYYcEwwy/",
			"reels/DbvaYYcEwwy/",
			"_.ved.musical._/reel/DbvaYYcEwwy/",
		]) {
			for (const query of [
				"",
				"?somethingsomething",
				"?img_index=4&igsh=abc",
			]) {
				const url = `https://www.instagram.com/${path}${query}`;
				assertEquals(matcher(url).type, "instagram", url);
				assertEquals(
					matcher(url).fallbackUrl,
					`https://www.ssinstagram.com/${path}${query}`,
				);
			}
		}
		assertEquals(
			matcher("https://www.instagram.com/_.ved.musical._/?igsh=abc").type,
			null,
		);
	}
});

Deno.test("ignores TikTok profiles while accepting posts and short links", () => {
	for (const matcher of [matchInput, matchDownloadCommandInput]) {
		for (const url of [
			"http://www.tiktok.com/@best.location.agency",
			"https://www.tiktok.com/@best.location.agency/",
			"tiktok.com/@best.location.agency?lang=en",
			"https://m.tiktok.com/@best.location.agency/?lang=en#profile",
			"https://www.tiktok.com/@best.location.agency#profile",
		]) {
			assertEquals(matcher(url).type, null, url);
		}
		for (const url of [
			"https://www.tiktok.com/@best.location.agency/video/123",
			"tiktok.com/@best.location.agency/photo/123",
			"https://vm.tiktok.com/Zexample/",
			"https://vt.tiktok.com/Zexample/",
			"https://www.tiktok.com/t/Zexample/",
		]) {
			assertEquals(matcher(url).type, "tiktok", url);
		}
	}
});

Deno.test("adds HTTPS to scheme-less URLs and their fallback links", () => {
	const path = "x.com/morganlinton/status/2109709413032546346";
	for (const matcher of [matchInput, matchDownloadCommandInput]) {
		assertEquals(matcher(path).type, "twitter");
		assertEquals(
			matcher(path).fallbackUrl,
			"https://fixupx.com/morganlinton/status/2109709413032546346",
		);
	}
	assertEquals(normalizeInputUrl(` ${path} `), `https://${path}`);
	assertEquals(normalizeInputUrl(`//${path}`), `https://${path}`);
	assertEquals(normalizeInputUrl(`http://${path}`), `http://${path}`);
	assertEquals(normalizeInputUrl(`https://${path}`), `https://${path}`);
});

Deno.test("matches Facebook text post URLs", () => {
	for (const url of [
		"https://www.facebook.com/Engineering/posts/1091181673044313/",
		"https://www.facebook.com/permalink.php?story_fbid=123&id=456",
		"https://www.facebook.com/story.php?story_fbid=123&id=456",
	]) {
		assertEquals(matchInput(url).type, "facebook");
	}
});

Deno.test("matches X text post URLs", () => {
	assertEquals(
		matchInput("https://x.com/thsottiaux/status/2095651088502591861").type,
		"twitter",
	);
});

Deno.test("matches legacy Twitter links for comment requests", () => {
	assertEquals(
		matchInput("https://twitter.com/example/status/123").type,
		"twitter",
	);
	assertEquals(
		matchInput("https://mobile.twitter.com/example/statuses/123").type,
		"twitter",
	);
});
