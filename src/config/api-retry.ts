import { autoRetry } from "@grammyjs/auto-retry";

export function telegramApiRetry() {
	return autoRetry({
		maxRetryAttempts: 5,
		// Telegram may have delivered a message before the request failed.
		// Only retry explicit rate-limit rejections, where nothing was sent.
		rethrowInternalServerErrors: true,
		rethrowHttpErrors: true,
	});
}
