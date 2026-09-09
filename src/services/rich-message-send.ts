import { classifyMediaSendFailure } from "./failure.ts";
import {
	type RichMessageData,
	selectRichMessageComments,
} from "./rich-message.ts";

/** Retry delivery using the already prepared post and attachments. */
export async function sendRichMessageWithFallback<T, R>(
	input: RichMessageData<T>,
	send: (data: RichMessageData<T>) => Promise<R>,
): Promise<R> {
	const original = selectRichMessageComments(input);
	const count =
		original.sourceType === "twitter" || original.sourceType === "reddit"
			? (original.metadata?.comments?.length ?? 0)
			: 0;
	const attempts = new Set(
		[100, 95, 90, 50, 0].map((percent) => Math.floor((count * percent) / 100)),
	);
	for (const comments of attempts) {
		const data = selectRichMessageComments(original, comments);
		try {
			return await send(data);
		} catch (error) {
			if (comments > 0) {
				console.warn(
					"[RichMessage] Send failed; retrying with fewer comments",
					{
						comments,
						originalComments: count,
						error,
					},
				);
				continue;
			}
			if (
				!data.captionEnabled ||
				classifyMediaSendFailure(error).reason !== "captionInvalid"
			) {
				throw error;
			}
			console.warn("[RichMessage] Caption failed; retrying without it", {
				error,
			});
			return await send({ ...data, captionEnabled: false });
		}
	}
	throw new Error("No rich-message send attempt was made");
}
