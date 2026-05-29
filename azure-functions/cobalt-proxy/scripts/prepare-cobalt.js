import { existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

const projectDir = path.resolve(import.meta.dirname, "..");
const versionInfoSource = path.join(
	projectDir,
	"node_modules",
	"cobalt",
	"packages",
	"version-info",
);
const imputScopeDir = path.join(projectDir, "node_modules", "@imput");
const versionInfoTarget = path.join(imputScopeDir, "version-info");

if (existsSync(versionInfoSource) && !existsSync(versionInfoTarget)) {
	mkdirSync(imputScopeDir, { recursive: true });
	symlinkSync(versionInfoSource, versionInfoTarget, "dir");
}

const versionInfoFile = path.join(versionInfoSource, "index.js");
if (existsSync(versionInfoFile)) {
	writeFileSync(
		versionInfoFile,
		`export const getCommit = async () => process.env.COBALT_GIT_COMMIT ?? "unknown";
export const getBranch = async () => process.env.COBALT_GIT_BRANCH ?? "unknown";
export const getRemote = async () => process.env.COBALT_GIT_REMOTE ?? "imputnet/cobalt";
export const getVersion = async () => process.env.COBALT_VERSION ?? "11";
`,
	);
}
