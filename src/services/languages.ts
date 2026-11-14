import type { CustomContext } from "../types/context.ts";
import type { Settings } from "../types/database.ts";
import { DEFAULT_SETTINGS } from "./chat.ts";
import { getResponseSettings } from "./slideshow.ts";

export function parseLanguages(value: string): string[] | null {
	const languages = value
		.split(",")
		.map((language) => language.trim().toLowerCase());
	if (
		languages.some(
			(language) => !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(language),
		)
	)
		return null;
	return [...new Set(languages)];
}

export function enabledLanguages(settings?: Partial<Settings>): string[] {
	return Array.isArray(settings?.languages)
		? (parseLanguages(settings.languages.join(",")) ?? [
				...DEFAULT_SETTINGS.languages,
			])
		: [...DEFAULT_SETTINGS.languages];
}

export function responseLanguages(ctx: CustomContext): string[] {
	return enabledLanguages(getResponseSettings(ctx));
}
