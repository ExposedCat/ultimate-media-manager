export type MediaSendFailureReason =
	| "fileTooLarge"
	| "unsupportedMedia"
	| "processingFailed"
	| "captionInvalid"
	| "permissionDenied"
	| "rateLimited"
	| "telegramUnavailable"
	| "unknown";

type ErrorDetails = {
	code: string;
	description: string;
};

function errorProperty(error: unknown, key: string): unknown {
	if (typeof error !== "object" || error === null || !(key in error)) {
		return undefined;
	}

	return (error as Record<string, unknown>)[key];
}

function errorDescription(error: unknown): string {
	const description = errorProperty(error, "description");
	if (typeof description === "string") {
		return description;
	}

	if (error instanceof Error) {
		return error.message;
	}

	return typeof error === "string" ? error : "";
}

function explicitErrorCode(error: unknown): string | null {
	for (const key of ["error_code", "status", "statusCode", "code"]) {
		const value = errorProperty(error, key);
		if (typeof value === "number" && Number.isFinite(value)) {
			return String(value);
		}
		if (typeof value === "string" && /^\d{3}$/.test(value)) {
			return value;
		}
	}

	return null;
}

export function getFailureCode(error: unknown): string {
	const explicitCode = explicitErrorCode(error);
	if (explicitCode) {
		return explicitCode;
	}

	const description = errorDescription(error);
	const describedCode = description.match(
		/(?:http(?:\s+error)?|status(?:\s+code)?|error)\D{0,8}(\d{3})/i,
	)?.[1];
	return describedCode ?? "unknown";
}

function getErrorDetails(error: unknown): ErrorDetails {
	return {
		code: getFailureCode(error),
		description: errorDescription(error).toLowerCase(),
	};
}

export function classifyMediaSendFailure(error: unknown): {
	code: string;
	reason: MediaSendFailureReason;
} {
	const { code, description } = getErrorDetails(error);

	if (
		code === "413" ||
		/(?:request entity too large|(?:file|video|audio|photo)(?: is|_is)?(?: |_)?too(?: |_)?(?:big|large))/.test(
			description,
		)
	) {
		return { code, reason: "fileTooLarge" };
	}

	if (
		/(?:content[_ ]type[_ ]invalid|unsupported|wrong type of (?:the )?(?:web page )?content|format.*invalid)/.test(
			description,
		)
	) {
		return { code, reason: "unsupportedMedia" };
	}

	if (
		/(?:media_empty|image_process_failed|photo_invalid_dimensions|video_file_invalid|media_invalid|failed to process|could not process)/.test(
			description,
		)
	) {
		return { code, reason: "processingFailed" };
	}

	if (/(?:can't parse entities|caption.*(?:long|invalid))/.test(description)) {
		return { code, reason: "captionInvalid" };
	}

	if (
		code === "403" ||
		/(?:forbidden|not enough rights|have no rights|bot was blocked)/.test(
			description,
		)
	) {
		return { code, reason: "permissionDenied" };
	}

	if (code === "429" || /too many requests|retry after/.test(description)) {
		return { code, reason: "rateLimited" };
	}

	if (
		/^5\d{2}$/.test(code) ||
		/(?:network|fetch failed|connection|timed? out|bad gateway|service unavailable)/.test(
			description,
		)
	) {
		return { code, reason: "telegramUnavailable" };
	}

	return { code, reason: "unknown" };
}
