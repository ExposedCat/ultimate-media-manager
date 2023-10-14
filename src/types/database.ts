import type { Collection } from 'mongodb'

export type Settings = {
	cleanup: boolean
}

export type Chat = {
	chatId: number
	title: string
	settings: Settings
}

export type Database = {
	chat: Collection<Chat>
}
