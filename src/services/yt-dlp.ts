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
	path: string,
	format = false
) {
	const options: string[] = [url, '--cookies', 'cookies']
	if (format) {
		options.push('-f', '0')
	}
	options.push('-o', path)
	return new Promise<string>((resolve, reject) =>
		binary
			.exec(options)
			.on('error', error => reject(error))
			.on('close', () => resolve(path))
	)
}
