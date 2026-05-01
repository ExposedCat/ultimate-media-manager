import { Composer } from "grammy";

import type { CustomContext } from "../types/context.ts";

export const startController = new Composer<CustomContext>();
startController.command("start", async (ctx) => {
	await ctx.text("greeting");
});
