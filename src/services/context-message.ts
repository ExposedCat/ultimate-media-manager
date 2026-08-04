import type { InputMatcher } from "./sources.ts";

export type MessageEntityLike = {
	type: string;
	offset: number;
	length: number;
	url?: string;
};

export type MessageForwardOriginLike = {
	type: string;
	sender_user?: {
		is_bot?: boolean;
	};
};

export type MessageLike = {
	text?: string;
	caption?: string;
	from?: {
		id: number;
	};
	forward_origin?: MessageForwardOriginLike;
	entities?: MessageEntityLike[];
	caption_entities?: MessageEntityLike[];
	reply_to_message?: MessageLike | null;
};

function getMessageText(message?: MessageLike | null) {
	return message?.text ?? message?.caption ?? "";
}

function getMessageEntities(message?: MessageLike | null) {
	return message?.entities ?? message?.caption_entities ?? [];
}

function extractEntityText(message: MessageLike, entity: MessageEntityLike) {
	const text = getMessageText(message);
	return text.slice(entity.offset, entity.offset + entity.length);
}

export function extractMessageText(message?: MessageLike | null) {
	const text = getMessageText(message).trim();
	return text.length > 0 ? text : null;
}

export function extractUrlsFromMessage(message?: MessageLike | null) {
	const entities = getMessageEntities(message);
	const urls: string[] = [];

	if (!message) {
		return urls;
	}

	for (const entity of entities) {
		if (entity.type === "url") {
			urls.push(extractEntityText(message, entity));
		} else if (entity.type === "text_link" && entity.url) {
			urls.push(entity.url);
		}
	}

	return urls;
}

export function shouldIgnoreForwardedMessage(
	message: MessageLike | null | undefined,
	chatType: string,
): boolean {
	if (chatType === "private") {
		return false;
	}

	const origin = message?.forward_origin;

	return (
		origin?.type === "channel" ||
		(origin?.type === "user" && origin.sender_user?.is_bot === true)
	);
}

export function findFirstMatchedUrlSource(
	messages: Array<MessageLike | null | undefined>,
	matcher: InputMatcher,
) {
	for (const sourceMessage of messages) {
		if (!sourceMessage) {
			continue;
		}

		for (const url of extractUrlsFromMessage(sourceMessage)) {
			const matchResult = matcher(url);
			if (matchResult.type) {
				return { url, sourceMessage, matchResult };
			}
		}
	}

	return null;
}

export function isBotMentioned(
	message: MessageLike | null | undefined,
	botUsername: string | null | undefined,
) {
	if (!message || !botUsername) {
		return false;
	}

	const normalizedBotUsername = botUsername.replace(/^@/, "").toLowerCase();

	return getMessageEntities(message).some((entity) => {
		if (entity.type !== "mention") {
			return false;
		}

		const mention = extractEntityText(message, entity)
			.replace(/^@/, "")
			.toLowerCase();

		return mention === normalizedBotUsername;
	});
}
