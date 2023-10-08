import type { CustomContext, CustomContextMethods } from '../types/context.js'

export function createReplyWithTextFunc(
	ctx: CustomContext
): CustomContextMethods['text'] {
	return (resourceKey, templateData, extra = {}) => {
		extra.parse_mode = 'HTML'
		extra.disable_web_page_preview = true
		const text = ctx.i18n.t(resourceKey, templateData)
		return ctx.reply(text, extra)
	}
}
