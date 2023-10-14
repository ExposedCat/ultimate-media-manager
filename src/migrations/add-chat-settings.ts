import { config } from 'dotenv'
import { resolvePath } from '../helpers/resolve-path.js'
import { validateEnv } from '../helpers/validate-env.js'
import type { Database } from '../types/database.js'
import { connectToDb } from '../config/database.js'

config({
	path: resolvePath(import.meta.url, '../../.env')
})
validateEnv(['DB_CONNECTION_STRING'])

async function migrate(database: Database) {
	await database.chat.updateMany({}, { $set: { settings: { cleanup: true } } })
}

console.info('Connecting…')
const { database, client } = await connectToDb()
console.info('Running migration…')
await migrate(database)
console.info('Disconnecting…')
await client.close()
console.info('Done')
