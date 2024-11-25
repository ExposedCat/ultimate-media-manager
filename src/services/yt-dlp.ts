import _YTDlpWrap from 'yt-dlp-wrap';

// TODO: Use better typed lib
export const Binary = _YTDlpWrap.default;
export type YTDlpWrap = _YTDlpWrap.default;

export function loadBinary() {
  return new Binary('./ytdlp');
}

export async function downloadMedia(binary: YTDlpWrap, url: string, path: string, format = false): Promise<string> {
  try {
    const options: string[] = [url, '--cookies', 'cookies'];
    if (format) {
      options.push('-f', '0');
    }
    options.push('-o', path);
    return new Promise<string>((resolve, reject) =>
      binary
        .exec(options)
        .on('error', error => reject(error))
        .on('close', () => resolve(path)),
    );
  } catch (error) {
    if (format) {
      console.error(`[Download Media] Download failed, will retry:`, error);
      return downloadMedia(binary, url, path, false);
    } else {
      throw error;
    }
  }
}

export async function downloadYouTubeAudio(binary: YTDlpWrap, url: string, path: string) {
  const options = ['-x', '--audio-format', 'mp3', url, '-o', path];
  return new Promise<string>((resolve, reject) =>
    binary
      .exec(options)
      .on('error', error => reject(error))
      .on('close', () => resolve(path)),
  );
}
