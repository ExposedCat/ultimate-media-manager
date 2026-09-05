import { Api, InputFile } from "grammy";
import type { Video } from "grammy/types";
import { prepareDownloadedRichMedia } from "../src/services/rich-media-upload.ts";
import { buildRichMessage } from "../src/services/rich-message.ts";

// Offline by default. Each live case uploads the exact same input bytes anew.
// No polling, application cache, remuxing, or production bot startup is involved.
const cases = [
	"rich-minimal",
	"rich-dimensions",
	"rich-thumbnail",
	"rich-complete",
	"rich-prepared",
	"regular-minimal",
] as const;
type Case = (typeof cases)[number];

function option(name: string) {
	return Deno.args
		.find((arg) => arg.startsWith(`--${name}=`))
		?.slice(name.length + 3);
}

async function run(command: string, args: string[]) {
	const result = await new Deno.Command(command, {
		args,
		stdin: "null",
		stdout: "piped",
		stderr: "piped",
	}).output();
	if (!result.success) {
		throw new Error(`${command}: ${new TextDecoder().decode(result.stderr)}`);
	}
	return result.stdout;
}

async function sha256(bytes: Uint8Array) {
	const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
	return Array.from(new Uint8Array(digest), (b) =>
		b.toString(16).padStart(2, "0"),
	).join("");
}

function describeRequest(value: unknown): unknown {
	if (value instanceof InputFile) return "<multipart file>";
	if (Array.isArray(value)) return value.map(describeRequest);
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([key, child]) => [
				key,
				describeRequest(child),
			]),
		);
	}
	return value;
}

function findVideo(value: unknown): Video | undefined {
	if (!value || typeof value !== "object") return;
	if (
		"video" in value &&
		value.video &&
		typeof value.video === "object" &&
		"file_id" in value.video
	) {
		return value.video as Video;
	}
	for (const child of Object.values(value)) {
		const video = findVideo(child);
		if (video) return video;
	}
}

async function main() {
	if (Deno.args.includes("--help")) {
		console.log(`Offline: deno run -A scripts/diagnose-rich-video.ts --input=/path/video.mp4
Live:    deno run -A --env-file=.env scripts/diagnose-rich-video.ts --input=/path/video.mp4 --send --chat=ID --bot=USERNAME
Optional: --cases=${cases.join(",")}
Offline defaults to all cases; live defaults to rich-minimal only.
Live results include Telegram's returned metadata and a downloaded-file hash.
Run rich cases before the regular case; watch them before opening regular controls.`);
		return;
	}
	const input = option("input");
	if (!input) throw new Error("Provide --input=/absolute/path/video.mp4");
	const send = Deno.args.includes("--send");
	const selected = (option("cases")?.split(",") ??
		(send ? ["rich-minimal"] : [...cases])) as Case[];
	if (selected.length === 0 || selected.some((id) => !cases.includes(id))) {
		throw new Error(`Unknown case; available: ${cases.join(", ")}`);
	}
	const chat = option("chat");
	const expectedBot = option("bot")?.replace(/^@/, "");
	if (send && (!chat || !expectedBot || !Deno.env.get("TOKEN"))) {
		throw new Error("Live mode needs TOKEN, --chat=ID and --bot=USERNAME");
	}
	const bytes = await Deno.readFile(input);
	const fileHash = await sha256(bytes);
	const filename = input.split("/").at(-1) ?? "video.mp4";
	const ffmpeg = Deno.env.get("FFMPEG_PATH") ?? "ffmpeg";
	const ffprobe = Deno.env.get("FFPROBE_PATH") ?? "ffprobe";
	const probe = JSON.parse(
		new TextDecoder().decode(
			await run(ffprobe, [
				"-v",
				"error",
				"-show_streams",
				"-show_format",
				"-of",
				"json",
				input,
			]),
		),
	);
	const stream = probe.streams.find(
		(s: { codec_type: string }) => s.codec_type === "video",
	);
	if (!stream || !(stream.width > 0 && stream.height > 0))
		throw new Error("No video dimensions found");
	const seconds = Number(probe.format.duration ?? stream.duration);
	if (!(seconds > 0 && Number.isFinite(seconds)))
		throw new Error("No valid duration found");
	const rotation =
		stream.side_data_list?.find(
			(s: { rotation?: number }) => s.rotation !== undefined,
		)?.rotation ?? 0;
	const sideways = Math.abs(rotation) % 180 === 90;
	const dimensions = {
		width: sideways ? stream.height : stream.width,
		height: sideways ? stream.width : stream.height,
		duration: Math.ceil(seconds),
	};
	const thumbnail = await run(ffmpeg, [
		"-nostdin",
		"-hide_banner",
		"-loglevel",
		"error",
		"-ss",
		"1",
		"-i",
		input,
		"-map",
		"0:v:0",
		"-frames:v",
		"1",
		"-vf",
		"scale=320:320:force_original_aspect_ratio=decrease",
		"-c:v",
		"mjpeg",
		"-q:v",
		"5",
		"-f",
		"image2pipe",
		"pipe:1",
	]);
	if (thumbnail.length === 0 || thumbnail.length >= 200_000)
		throw new Error("Invalid thumbnail size");
	const streamHashes = new TextDecoder().decode(
		await run(ffmpeg, [
			"-nostdin",
			"-hide_banner",
			"-loglevel",
			"error",
			"-i",
			input,
			"-map",
			"0:v:0",
			"-map",
			"0:a:0?",
			"-c",
			"copy",
			"-f",
			"streamhash",
			"-hash",
			"SHA256",
			"-",
		]),
	);
	const output = await Deno.makeTempDir({ prefix: "umm-rich-diagnostic-" });
	await Deno.writeFile(`${output}/thumbnail.jpg`, thumbnail, {
		createNew: true,
		mode: 0o600,
	});
	const report: Record<string, unknown> = {
		createdAt: new Date().toISOString(),
		mode: send ? "live" : "offline",
		input,
		bytes: bytes.length,
		sha256: fileHash,
		streamHashes,
		probe,
		dimensions,
		thumbnail: { bytes: thumbnail.length, sha256: await sha256(thumbnail) },
		cases: [],
	};
	const records = report.cases as Record<string, unknown>[];
	const save = () =>
		Deno.writeTextFile(
			`${output}/report.json`,
			JSON.stringify(report, null, 2),
			{ mode: 0o600 },
		);
	console.log(`Evidence directory: ${output}`);
	console.log(
		JSON.stringify({
			input,
			bytes: bytes.length,
			sha256: fileHash,
			dimensions,
			cases: selected,
		}),
	);
	let api: Api | undefined;
	if (send) {
		api = new Api(Deno.env.get("TOKEN") as string);
		const me = await api.getMe();
		if (me.username.toLowerCase() !== expectedBot?.toLowerCase()) {
			throw new Error(
				`Configured bot is @${me.username}; expected @${expectedBot}`,
			);
		}
		const destination = await api.getChat(chat as string);
		report.bot = { id: me.id, username: me.username };
		report.chat = { id: destination.id, type: destination.type };
	}
	await save();
	for (const id of selected) {
		const withDimensions = id === "rich-dimensions" || id === "rich-complete";
		const withThumbnail = id === "rich-thumbnail" || id === "rich-complete";
		const label = `[${filename}] ${id}`;
		const file = new InputFile(bytes, filename);
		const rich = buildRichMessage({
			baseHtml: label
				.replaceAll("&", "&amp;")
				.replaceAll("<", "&lt;")
				.replaceAll(">", "&gt;"),
			captionEnabled: false,
			sourceType: "twitter",
			media:
				id === "rich-prepared"
					? await prepareDownloadedRichMedia({
							kind: "video",
							file,
							bytes,
							duration: dimensions.duration,
							filename,
							height: dimensions.height,
							thumbnail,
							width: dimensions.width,
						})
					: [{ kind: "video", media: file }],
		});
		const video = rich.media?.[0].media;
		if (!video || video.type !== "video")
			throw new Error("UMM builder did not produce video media");
		if (withDimensions) Object.assign(video, dimensions);
		if (withThumbnail)
			video.thumbnail = new InputFile(thumbnail, "thumbnail.jpg");
		const request =
			id === "regular-minimal"
				? { video: file, caption: label, supports_streaming: true }
				: { rich_message: rich };
		const record: Record<string, unknown> = {
			id,
			sha256: fileHash,
			request: describeRequest(request),
		};
		records.push(record);
		await save();
		// Exercise the real multipart serializer offline, including attachment hashes.
		const client =
			api ??
			new Api("offline:diagnostic", {
				fetch: async (_url: RequestInfo | URL, init?: RequestInit) => {
					// Copy Node stream chunks before using Deno's web body reader;
					// that reader transfers buffers, while grammY reuses separators.
					const parts: Uint8Array[] = [];
					for await (const part of init?.body as unknown as AsyncIterable<Uint8Array>) {
						parts.push(new Uint8Array(part));
					}
					const body = new Uint8Array(
						parts.reduce((size, part) => size + part.length, 0),
					);
					let offset = 0;
					for (const part of parts) {
						body.set(part, offset);
						offset += part.length;
					}
					const form = await new Response(body, {
						headers: init?.headers,
					}).formData();
					const fields: Record<string, unknown> = {};
					let verifiedVideo = false;
					for (const [key, value] of form.entries()) {
						if (typeof value === "string") {
							fields[key] = key === "rich_message" ? JSON.parse(value) : value;
						} else {
							const hash = await sha256(
								new Uint8Array(await value.arrayBuffer()),
							);
							fields[key] = {
								filename: value.name,
								bytes: value.size,
								sha256: hash,
							};
							if (value.name === filename) {
								if (hash !== fileHash)
									throw new Error("Multipart video bytes changed");
								verifiedVideo = true;
							}
						}
					}
					if (!verifiedVideo)
						throw new Error("Missing multipart video attachment");
					const verifyReferences = (value: unknown): void => {
						if (typeof value === "string" && value.startsWith("attach://")) {
							const target = fields[value.slice("attach://".length)];
							if (
								!target ||
								typeof target !== "object" ||
								!("sha256" in target)
							)
								throw new Error(`Unresolved multipart attachment: ${value}`);
						} else if (value && typeof value === "object") {
							for (const child of Object.values(value)) verifyReferences(child);
						}
					};
					verifyReferences(fields);
					record.serializedMultipart = fields;
					return Response.json({
						ok: true,
						result: {
							message_id: 0,
							date: 0,
							chat: { id: 0, type: "private" },
						},
					});
				},
			});
		try {
			const response =
				id === "regular-minimal"
					? await client.sendVideo(chat ?? "0", file, {
							caption: label,
							supports_streaming: true,
							disable_notification: true,
						})
					: await client.sendRichMessage(chat ?? "0", rich, {
							disable_notification: true,
						});
			if (!api) {
				await save();
				continue;
			}
			record.response = response;
			await save();
			const returnedVideo = findVideo(response);
			if (!returnedVideo) throw new Error("Telegram returned no video");
			const info = await api.getFile(returnedVideo.file_id);
			if (!info.file_path) throw new Error("Telegram returned no file path");
			const token = Deno.env.get("TOKEN");
			const downloaded = await fetch(
				`https://api.telegram.org/file/bot${token}/${info.file_path}`,
				{ signal: AbortSignal.timeout(60_000) },
			);
			if (!downloaded.ok)
				throw new Error(
					`Download verification failed: HTTP ${downloaded.status}`,
				);
			const returnedBytes = new Uint8Array(await downloaded.arrayBuffer());
			const returnedHash = await sha256(returnedBytes);
			record.download = {
				bytes: returnedBytes.length,
				sha256: returnedHash,
				identical: returnedHash === fileHash,
			};
			await Deno.writeFile(`${output}/${id}.mp4`, returnedBytes, {
				createNew: true,
				mode: 0o600,
			});
			console.log(
				JSON.stringify({
					id,
					messageId: response.message_id,
					video: returnedVideo,
					identical: returnedHash === fileHash,
				}),
			);
		} catch (error) {
			const token = Deno.env.get("TOKEN") ?? "";
			const nested =
				error && typeof error === "object" && "error" in error
					? error.error
					: undefined;
			const detail =
				(error instanceof Error ? error.message : String(error)) +
				(nested instanceof Error
					? ` ${send ? nested.message : nested.stack}`
					: "");
			record.error = token ? detail.replaceAll(token, "<redacted>") : detail;
			await save();
			throw new Error(String(record.error));
		}
		await save();
	}
	console.log(
		send
			? "Uploads complete. Playback is not verified until tested on the affected Android device."
			: "Offline checks complete; no Telegram requests or messages were sent.",
	);
}

if (import.meta.main) {
	await main();
}
