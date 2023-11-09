import type { Browser } from 'puppeteer'
import puppeteer from 'puppeteer'

class Data {
	static USER_AGENT =
		'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

	static FB_VIDEO_SELECTOR = '.inline-video-container'
}

export async function initScrapper() {
	return puppeteer.launch({
		headless: 'new',
		args: ['--no-sandbox']
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
	page.setUserAgent(Data.USER_AGENT)
	await page.goto(postUrl, {
		waitUntil: 'networkidle0'
	})

	const videoUrl = await page.evaluate(
		() => document.querySelector('video')?.src
	)

	await page.close()
	return videoUrl ?? null
}

export async function getFacebookReelDownloadUrl(
	scrapper: Browser,
	postUrl: string
) {
	const page = await scrapper.newPage()
	page.setUserAgent(Data.USER_AGENT)
	await page.setCookie({
		// Cookies
		name: 'datr',
		value: 'jytMZfO-dFCu8e5yKoMBl_Rn',
		domain: '.facebook.com',
		path: '/',
		expires: -1,
		httpOnly: true,
		secure: true,
		sameSite: 'None',
		sameParty: false,
		sourceScheme: 'Secure',
		sourcePort: 443
	})

	const clickElement = (selector: string) =>
		page.$eval(selector, element => (element as HTMLDivElement).click()).catch()

	await page.goto(postUrl, {
		waitUntil: 'networkidle0'
	})

	try {
		await page.waitForSelector('[data-action-id="32704"]', {
			timeout: 5_000
		})
		await clickElement('[data-action-id="32704"]')
	} catch {
		// Did not asked to login
	}

	await clickElement(Data.FB_VIDEO_SELECTOR)
	const videoUrl = await page.evaluate(
		() => document.querySelector('video')?.src
	)

	await page.close()
	return videoUrl ?? null
}
