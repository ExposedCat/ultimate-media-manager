import _YTDlpWrap from 'yt-dlp-wrap'

// TODO: Use better typed lib
export const Binary = (_YTDlpWrap as any).default
export type YTDlpWrap = _YTDlpWrap

export function loadBinary() {
	return new Binary('./ytdlp')
}

export async function downloadMedia(
	binary: YTDlpWrap,
	url: string,
	path: string
) {
	return new Promise<string>((resolve, reject) =>
		binary
			.exec([url, '-o', path])
			.on('error', error => reject(error))
			.on('close', () => resolve(path))
	)
}
