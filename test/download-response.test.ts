import { assertEquals } from "jsr:@std/assert@^1";
import type { PostCaptionMeta } from "../src/services/caption.ts";
import {
	buildDownloadResponseBaseText,
	responseMediaKind,
} from "../src/services/download-response.ts";
import type { CustomContext } from "../src/types/context.ts";

const ctx = {
	i18n: {
		t(key: string, values: Record<string, unknown>) {
			return key === "promoCaption"
				? values.viewUrl
				: `shared this ${values.kind}`;
		},
	},
} as unknown as CustomContext;
const data = {
	sourceType: "twitter" as const,
	url: "https://x.com/a/status/1",
	userId: 42,
	userName: "Sender",
};
Deno.test("attribution describes shared X replies and actual attached comments", () => {
	for (const [meta, expected] of [
		[{}, "image"],
		[{ isComment: true }, "image comment"],
		[{ comments: [{ text: "Reply" }] }, "image with comments"],
		[
			{ isComment: true, comments: [{ text: "Reply" }] },
			"image comment with comments",
		],
		[{ comments: [] }, "image"],
	] as Array<[PostCaptionMeta, string]>) {
		assertEquals(
			buildDownloadResponseBaseText(
				ctx,
				{ ...data, comments: 5 },
				"image",
				undefined,
				meta,
			),
			`shared this ${expected}`,
		);
	}
	assertEquals(
		buildDownloadResponseBaseText(ctx, data, null, undefined, {
			isComment: true,
		}),
		"shared this post comment",
	);
	assertEquals(
		buildDownloadResponseBaseText(
			ctx,
			{ ...data, sourceType: "reddit" },
			"video",
			undefined,
			{ comments: [{ text: "Reply" }] },
		),
		"shared this video with comments",
	);
});

Deno.test("Reddit attribution counts root media separately from comment attachments", () => {
	assertEquals(
		responseMediaKind("reddit", {
			kind: "image",
			fileId: "comment",
			metadata: { mediaCount: 0 },
		}),
		null,
	);
	assertEquals(
		responseMediaKind("reddit", {
			kind: "images",
			items: [
				{ kind: "video", fileId: "root" },
				{ kind: "image", fileId: "comment" },
			],
			metadata: { mediaCount: 1 },
		}),
		"video",
	);
});
