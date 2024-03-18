import { getTikTokDownloadUrl } from '../services/tiktok.js'

const INPUT = process.env.URL
if (!INPUT) {
	throw new Error('`URL` env is missing')
}
const downloadUrl = await getTikTokDownloadUrl(INPUT)
console.log(downloadUrl)
