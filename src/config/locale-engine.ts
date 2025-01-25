import { I18n } from "@grammyjs/i18n";

export function initLocaleEngine(path: string, defaultLanguage = "en") {
	return new I18n({
		directory: path,
		defaultLanguage,
		defaultLanguageOnMissing: true,
		useSession: true,
	});
}
