import type { Browser } from 'puppeteer'
import { getTikTokDownloadUrl } from './tiktok.js'
import { getInstagramReelDownloadUrl } from './instagram.js'

export async function extractDirectUrl(
	scrapper: Browser,
	postUrl: string,
	type: 'tiktok' | 'instagram'
) {
	if (type === 'tiktok') {
		return await getTikTokDownloadUrl(postUrl)
	}
	return await getInstagramReelDownloadUrl(scrapper, postUrl)
}
