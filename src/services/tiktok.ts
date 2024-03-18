const API_URL = 'https://api16-normal-c-useast2a.tiktokv.com/aweme/v1/feed/'

function getHeaders() {
	const headers = new Headers()
	headers.append(
		'User-Agent',
		'TikTok 26.2.0 rv:262018 (iPhone; iOS 14.4.2; en_US) Cronet'
	)
	return headers
}

async function getVideoId(
	postUrl: string,
	_noRefetch = false
): Promise<string | null> {
	if (!postUrl.includes('/video/')) {
		if (_noRefetch) {
			console.error('[TT] Did not receive full video URL', { postUrl })
			return null
		}
		try {
			new URL(postUrl)
		} catch {
			// URL is invalid - ignore
			return null
		}
		const response = await fetch(postUrl)
		return getVideoId(response.url, true)
	}
	const videoId = postUrl.substring(
		postUrl.indexOf('/video/') + 7,
		postUrl.length
	)
	return videoId.length > 19
		? videoId.substring(0, videoId.indexOf('?'))
		: videoId
}

export async function getTikTokDownloadUrl(
	postUrl: string
): Promise<string | null> {
	const headers = getHeaders()
	const videoId = await getVideoId(postUrl)
	if (!videoId) {
		return null
	}
	console.log(`${API_URL}?aweme_id=${videoId}`)
	const request = await fetch(`${API_URL}?aweme_id=${videoId}`, {
		method: 'GET',
		headers: headers
	})
	const body = await request.text()
	try {
		const parsedResponse = JSON.parse(body)
		return parsedResponse.aweme_list[0].video.play_addr.url_list[0]
	} catch (error) {
		console.error('[TT] Failed to get download URL', { error, body })
		return null
	}
}
