import dotenv from 'dotenv'
import { resolvePath } from './resolve-path.js'

export function loadEnv(configPath = '.env') {
	const fullPath = resolvePath(import.meta.url, configPath)
	dotenv.config({
		path: fullPath
	})
}
