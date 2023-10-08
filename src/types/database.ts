import type { Collection } from 'mongodb'

export interface Chat {
	chatId: number
	title: string
}

export interface Database {
	chat: Collection<Chat>
}
