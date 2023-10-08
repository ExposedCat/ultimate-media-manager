export function validateEnv(requiredEnvs: string[]) {
	for (const env of requiredEnvs) {
		if (process.env[env] === undefined) {
			throw `ERROR: Required variable "${env}" is  not specified`
		}
	}
}
