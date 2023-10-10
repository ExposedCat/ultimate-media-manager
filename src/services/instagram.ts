import type { Browser } from 'puppeteer'
import puppeteer from 'puppeteer'

const USER_AGENT =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

export async function initScrapper() {
	return puppeteer.launch({
		headless: 'new'
	})
}

export async function dispose(scrapper: Browser) {
	await scrapper.close()
}

export async function getInstagramReelDownloadUrl(
	scrapper: Browser,
	postUrl: string
) {
	const page = await scrapper.newPage()
	await page.setUserAgent(USER_AGENT)
	await page.goto(postUrl, {
		waitUntil: 'networkidle0'
	})

	const videoUrl = await page.evaluate(
		() => document.querySelector('video')?.src
	)

	await page.close()
	return videoUrl ?? null
}
