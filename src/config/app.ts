// TODO: Use path aliases
import env from 'dotenv'
import { validateEnv } from '../helpers/validate-env.js'
import { startBot } from './bot.js'
import { connectToDb } from './database.js'
import { resolvePath } from '../helpers/resolve-path.js'

export async function startApp() {
	try {
		env.config({
			path: resolvePath(import.meta.url, '../../.env')
		})
		validateEnv(['TOKEN', 'DB_CONNECTION_STRING'])
	} catch (error) {
		console.error('Error occurred while loading environment:', error)
		process.exit(1)
	}

	let database
	try {
		database = await connectToDb()
	} catch (error) {
		console.error('Error occurred while connecting to the database:', error)
		process.exit(2)
	}

	try {
		await startBot(database)
	} catch (error) {
		console.error('Error occurred while starting the bot:', error)
		process.exit(3)
	}
}
