// TODO: Use path aliases
import { loadEnv } from '../helpers/load-env.js'
import { validateEnv } from '../helpers/validate-env.js'
import { startBot } from './bot.js'
import { connectToDb } from './database.js'

export async function startApp() {
	try {
		loadEnv()
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
