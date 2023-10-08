import { I18n } from '@grammyjs/i18n'

export function initLocaleEngine(path: string, defaultLanguage = 'en') {
	const i18n = new I18n({
		directory: path,
		defaultLanguage: defaultLanguage,
		defaultLanguageOnMissing: true,
		useSession: true
	})
	return i18n
}
