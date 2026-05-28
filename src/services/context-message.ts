export type MessageEntityLike = {
	type: string;
	offset: number;
	length: number;
	url?: string;
};

export type MessageLike = {
	text?: string;
	caption?: string;
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
