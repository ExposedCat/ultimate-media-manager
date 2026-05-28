import { APP_ENV } from "../config/env.ts";

const COLLAGE_COLUMNS = 3;
const COLLAGE_GAP = 6;
const MAX_CELL_SIZE = 720;
const MAX_DIMENSION_SUM = 9500;

function getOutputDir(filename: string) {
	const separatorIndex = filename.lastIndexOf("/");
	return separatorIndex === -1 ? "." : filename.slice(0, separatorIndex);
}

function getCellSize(imageCount: number) {
	const rows = Math.ceil(imageCount / COLLAGE_COLUMNS);
	return Math.max(
		1,
		Math.min(
			MAX_CELL_SIZE,
			Math.floor(MAX_DIMENSION_SUM / (COLLAGE_COLUMNS + rows)),
		),
	);
}

function buildFilter(imageCount: number, cellSize: number) {
	const rows = Math.ceil(imageCount / COLLAGE_COLUMNS);
	const outputWidth =
		COLLAGE_COLUMNS * cellSize + (COLLAGE_COLUMNS - 1) * COLLAGE_GAP;
	const outputHeight = rows * cellSize + (rows - 1) * COLLAGE_GAP;
	const labels = Array.from(
		{ length: imageCount },
		(_, index) => `[t${index}]`,
	);
	const scaleFilters = Array.from(
		{ length: imageCount },
		(_, index) =>
			`[${index}:v]scale=${cellSize}:${cellSize}:force_original_aspect_ratio=decrease,pad=${cellSize}:${cellSize}:(ow-iw)/2:(oh-ih)/2:color=white,setsar=1[t${index}]`,
	);
	const layout = Array.from({ length: imageCount }, (_, index) => {
		const row = Math.floor(index / COLLAGE_COLUMNS);
		const column = index % COLLAGE_COLUMNS;
		const rowImageCount =
			row === rows - 1 ? imageCount - row * COLLAGE_COLUMNS : COLLAGE_COLUMNS;
		const rowWidth =
			rowImageCount * cellSize + (rowImageCount - 1) * COLLAGE_GAP;
		const contentWidth =
			COLLAGE_COLUMNS * cellSize + (COLLAGE_COLUMNS - 1) * COLLAGE_GAP;
		const rowOffset = Math.floor((contentWidth - rowWidth) / 2);
		const x = rowOffset + column * (cellSize + COLLAGE_GAP);
		const y = row * (cellSize + COLLAGE_GAP);
		return `${x}_${y}`;
	}).join("|");

	return `${scaleFilters.join(";")};${labels.join("")}xstack=inputs=${imageCount}:layout=${layout}:fill=white[stacked];[stacked]pad=${outputWidth}:${outputHeight}:0:0:color=white[out]`;
}

export async function createImageCollage(filenames: string[]) {
	if (filenames.length === 0) {
		return null;
	}

	if (filenames.length === 1) {
		return filenames[0];
	}

	const cellSize = getCellSize(filenames.length);
	const outputFilename = `${getOutputDir(filenames[0])}/collage-${crypto.randomUUID()}.jpg`;
	const args = [
		"-hide_banner",
		"-loglevel",
		"error",
		"-y",
		...filenames.flatMap((filename) => ["-i", filename]),
		"-filter_complex",
		buildFilter(filenames.length, cellSize),
		"-map",
		"[out]",
		"-frames:v",
		"1",
		"-q:v",
		"3",
		outputFilename,
	];

	const command = new Deno.Command(APP_ENV.FFMPEG_PATH, {
		args,
		stderr: "piped",
		stdout: "piped",
	});
	const result = await command.output();

	if (!result.success) {
		console.warn("[Collage] Failed to create image collage", {
			code: result.code,
			imageCount: filenames.length,
			error: new TextDecoder().decode(result.stderr),
		});
		return null;
	}

	return outputFilename;
}
