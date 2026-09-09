import type { CustomContext } from "../types/context.ts";
import type { Settings } from "../types/database.ts";
import { DEFAULT_SETTINGS } from "./chat.ts";

export function getResponseSettings(ctx: CustomContext): Settings {
	if (ctx.guestMessage && ctx.chat?.type === "private") {
		return (
			ctx.objects?.guestReceiverUser?.settings ??
			ctx.objects?.guestSenderUser?.settings ??
			DEFAULT_SETTINGS
		);
	}
	return (
		ctx.objects?.chat?.settings ??
		ctx.objects?.user?.settings ??
		DEFAULT_SETTINGS
	);
}

export function slideshowDelay(settings?: Partial<Settings>): number {
	const value = settings?.slideshowDelay;
	return typeof value === "number" &&
		Number.isInteger(value) &&
		value >= 0 &&
		value <= 10
		? value
		: DEFAULT_SETTINGS.slideshowDelay;
}

export function responseSlideshowDelay(ctx: CustomContext): number {
	return slideshowDelay(getResponseSettings(ctx));
}
