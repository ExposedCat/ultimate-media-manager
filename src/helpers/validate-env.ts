export function validateEnv(requiredEnvs: string[]) {
	for (const env of requiredEnvs) {
		if (process.env[env] === undefined) {
			throw new Error(`ERROR: Required variable "${env}" is  not specified`);
		}
	}
}
