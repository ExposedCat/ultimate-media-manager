import { InputFile } from "grammy";

import { APP_ENV } from "../config/env.ts";
import type { DownloadedMedia } from "./download-media.ts";
import type { RichMediaItem, RichMediaKind } from "./rich-message.ts";

type FfmpegResult = {
	success: boolean;
	stderr: Uint8Array;
};

type FfmpegRunner = (args: string[]) => Promise<FfmpegResult>;

const runFfmpeg: FfmpegRunner = async (args) =>
	await new Deno.Command(APP_ENV.FFMPEG_PATH, {
		args,
		stdout: "null",
		stderr: "piped",
	}).output();

export async function prepareDownloadedRichMedia(
	media: DownloadedMedia,
	ffmpeg: FfmpegRunner = runFfmpeg,
): Promise<RichMediaItem[]> {
	if (media.kind === "images") {
		const items: RichMediaItem[] = [];
		for (const item of media.files) {
			items.push(
				await prepareRichMediaItem(
					item.kind,
					item.file,
					item.media.data,
					item.media.extension,
					item.media.filename,
					ffmpeg,
				),
			);
		}
		return items;
	}

	return [
		await prepareRichMediaItem(
			media.kind,
			media.file,
			media.bytes,
			media.extension,
			media.filename,
			ffmpeg,
		),
	];
}

async function prepareRichMediaItem(
	kind: RichMediaKind,
	file: InputFile,
	bytes: Uint8Array | undefined,
	extension: string | undefined,
	filename: string | undefined,
	ffmpeg: FfmpegRunner,
): Promise<RichMediaItem> {
	if (kind !== "video" || !bytes || !isMp4(extension, filename)) {
		return { kind, media: file };
	}

	const remuxed = await remuxMp4(bytes, filename, ffmpeg);
	return {
		kind,
		media: remuxed ? new InputFile(remuxed, filename ?? "video.mp4") : file,
	};
}

function isMp4(extension: string | undefined, filename: string | undefined) {
	return (
		extension?.toLowerCase() === "mp4" ||
		filename?.toLowerCase().endsWith(".mp4") === true
	);
}

async function remuxMp4(
	bytes: Uint8Array,
	filename: string | undefined,
	ffmpeg: FfmpegRunner,
): Promise<Uint8Array | null> {
	const directory = await Deno.makeTempDir({ prefix: "umm-rich-video-" });
	const inputPath = `${directory}/input.mp4`;
	const outputPath = `${directory}/output.mp4`;

	try {
		await Deno.writeFile(inputPath, bytes);
		// Some Telegram Android rich-message videos black-screen when the source
		// MP4 uses edit lists and starts with negative decode timestamps. Rebuild
		// only the container/timing tables; keep the encoded media unchanged.
		const result = await ffmpeg([
			"-nostdin",
			"-hide_banner",
			"-loglevel",
			"error",
			"-y",
			"-i",
			inputPath,
			"-map",
			"0:v:0",
			"-map",
			"0:a:0?",
			"-c",
			"copy",
			"-movflags",
			"+faststart",
			"-avoid_negative_ts",
			"make_zero",
			"-use_editlist",
			"0",
			outputPath,
		]);
		if (!result.success) {
			throw new Error(
				new TextDecoder().decode(result.stderr).trim() || "ffmpeg failed",
			);
		}

		const remuxed = await Deno.readFile(outputPath);
		if (remuxed.length === 0) {
			throw new Error("ffmpeg produced an empty MP4");
		}
		console.info("[RichMedia] Remuxed MP4 for Telegram", {
			filename,
			inputSize: bytes.length,
			outputSize: remuxed.length,
		});
		return remuxed;
	} catch (error) {
		console.warn("[RichMedia] Could not remux MP4; using original", {
			filename,
			error: error instanceof Error ? error.message : String(error),
		});
		return null;
	} finally {
		await Deno.remove(directory, { recursive: true }).catch(() => undefined);
	}
}
