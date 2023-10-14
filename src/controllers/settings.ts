import { Composer } from 'grammy'

import type { CustomContext } from '../types/context.js'
import { setChatCleanup } from '../services/chat.js'
import type { Settings } from '../types/database.js'

export const settingsController = new Composer<CustomContext>()
settingsController.command('settings', async ctx => {
	if (!ctx.message || !ctx.entities.chat) {
		return
	}

	// TODO: Refactor
	const options: Record<keyof Settings, string> = {
		cleanup: ctx.i18n.t('cleanupOption')
	}
	const [option, value] = ctx.message.text.split(' ').slice(1) as [
		(keyof Settings)?,
		string?
	]

	const enabled = ctx.i18n.t('enabled')
	const disabled = ctx.i18n.t('disabled')

	if (!option || !value) {
		await ctx.text('settings', {
			cleanupOption: options.cleanup,
			cleanup: ctx.entities.chat.settings.cleanup ? enabled : disabled
		})
	} else {
		if (!options[option]) {
			await ctx.text('unknownOption', { option })
		} else {
			const result = value === 'yes' || value === 'true'
			await setChatCleanup({
				db: ctx.db,
				chatId: ctx.chat.id,
				cleanup: result
			})
			await ctx.text('settingsUpdated', {
				option: options[option],
				value: result ? enabled : disabled
			})
		}
	}
})
