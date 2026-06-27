import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpegStaticPath from "ffmpeg-static";
import youtubeDlExec from "youtube-dl-exec";

const SYSTEM_YOUTUBE_DL_PATH = "/usr/local/bin/yt-dlp";
const OUTPUT_TEMPLATE = "%(autonumber)03d-%(id)s.%(ext)s";
const YTDLP_TIMEOUT_MS = optionalPositiveIntegerEnv(
	"YTDLP_TIMEOUT_MS",
	120_000,
);
const YTDLP_PLAYLIST_LIMIT = optionalPositiveIntegerEnv(
	"YTDLP_PLAYLIST_LIMIT",
	50,
);
const YTDLP_FORMAT =
	process.env.YTDLP_FORMAT ?? "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b";

const CONTENT_TYPES_BY_EXTENSION = new Map([
	["jpg", "image/jpeg"],
	["jpeg", "image/jpeg"],
	["png", "image/png"],
	["webp", "image/webp"],
	["gif", "image/gif"],
	["mp4", "video/mp4"],
	["mov", "video/quicktime"],
	["webm", "video/webm"],
	["mp3", "audio/mpeg"],
	["wav", "audio/wav"],
	["ogg", "audio/ogg"],
	["m4a", "audio/mp4"],
]);

function optionalPositiveIntegerEnv(name, fallback) {
	const value = Number.parseInt(process.env[name] ?? "", 10);
	return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function optionalEnv(name) {
	const value = process.env[name];
	return value?.trim() || undefined;
}

async function pathExists(filePath) {
	try {
		const stat = await fs.stat(filePath);
		return stat.isFile();
	} catch (error) {
		if (error?.code === "ENOENT") {
			return false;
		}

		throw error;
	}
}

async function getYoutubeDl() {
	const configuredPath =
		optionalEnv("YOUTUBE_DL_PATH") ?? optionalEnv("YT_DLP_PATH");
	if (configuredPath) {
		return youtubeDlExec.create(configuredPath);
	}

	if (await pathExists(SYSTEM_YOUTUBE_DL_PATH)) {
		return youtubeDlExec.create(SYSTEM_YOUTUBE_DL_PATH);
	}

	return youtubeDlExec.youtubeDl ?? youtubeDlExec;
}

function parseRequestUrl(requestBody) {
	const parsed = JSON.parse(requestBody);
	const url = typeof parsed.url === "string" ? parsed.url.trim() : "";
	if (!url) {
		throw new Error("request body did not contain a URL");
	}

	return url;
}

function normalizeYtdlpUrl(value) {
	const url = new URL(value);
	const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
	const isYoutube =
		hostname === "youtu.be" ||
		hostname === "youtube.com" ||
		hostname.endsWith(".youtube.com") ||
		hostname === "youtube-nocookie.com" ||
		hostname.endsWith(".youtube-nocookie.com");

	if (isYoutube) {
		url.searchParams.delete("list");
		url.searchParams.delete("index");
		url.searchParams.delete("start_radio");
	}

	return url.toString();
}

async function listFiles(directory) {
	const entries = [];

	for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			entries.push(...(await listFiles(entryPath)));
			continue;
		}

		if (entry.isFile()) {
			entries.push(entryPath);
		}
	}

	return entries.sort();
}

function isMediaFile(filename) {
	const extension = path.extname(filename).slice(1).toLowerCase();
	return CONTENT_TYPES_BY_EXTENSION.has(extension);
}

function sanitizeFilename(filename) {
	return filename.replaceAll("/", "_").replaceAll("\\", "_");
}

function getContentType(filename) {
	const extension = path.extname(filename).slice(1).toLowerCase();
	return (
		CONTENT_TYPES_BY_EXTENSION.get(extension) ?? "application/octet-stream"
	);
}

async function readDownloadedFiles(directory) {
	const files = [];
	const filenames = (await listFiles(directory)).filter(isMediaFile);

	for (const [index, filename] of filenames.entries()) {
		const data = await fs.readFile(filename);
		if (data.length === 0) {
			continue;
		}

		files.push({
			filename: `${index}-${sanitizeFilename(path.basename(filename))}`,
			contentType: getContentType(filename),
			data,
		});
	}

	return files;
}

export async function downloadWithYtdlp(requestBody, context) {
	const url = normalizeYtdlpUrl(parseRequestUrl(requestBody));
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "umm-ytdlp-"));

	try {
		const youtubeDl = await getYoutubeDl();
		const flags = {
			format: YTDLP_FORMAT,
			ignoreErrors: true,
			mergeOutputFormat: "mp4",
			noCheckCertificates: true,
			noMtime: true,
			noProgress: true,
			noWarnings: true,
			output: path.join(directory, OUTPUT_TEMPLATE),
			playlistEnd: YTDLP_PLAYLIST_LIMIT,
			quiet: true,
			restrictFilenames: true,
			windowsFilenames: true,
		};
		const ffmpegLocation = optionalEnv("FFMPEG_PATH") ?? ffmpegStaticPath;
		if (ffmpegLocation) {
			flags.ffmpegLocation = ffmpegLocation;
		}

		await youtubeDl(url, flags, {
			killSignal: "SIGKILL",
			timeout: YTDLP_TIMEOUT_MS,
		});

		const files = await readDownloadedFiles(directory);
		if (files.length === 0) {
			throw new Error("yt-dlp did not download any supported media files");
		}

		context.log("[MediaFunction] yt-dlp downloaded media", {
			fileCount: files.length,
			url,
		});

		return files;
	} finally {
		await fs.rm(directory, { force: true, recursive: true });
	}
}
