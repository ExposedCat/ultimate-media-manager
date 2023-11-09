import type { Browser } from 'puppeteer'
import { getTikTokDownloadUrl } from './tiktok.js'
import {
	getFacebookReelDownloadUrl,
	getInstagramReelDownloadUrl
} from './meta.js'

export async function extractDirectUrl(
	scrapper: Browser,
	postUrl: string,
	type: 'tiktok' | 'instagram' | 'facebook'
) {
	switch (type) {
		case 'tiktok':
			return await getTikTokDownloadUrl(postUrl)
		case 'instagram':
			return await getInstagramReelDownloadUrl(scrapper, postUrl)
		case 'facebook':
			return await getFacebookReelDownloadUrl(scrapper, postUrl)
	}
}
