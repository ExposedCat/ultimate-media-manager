import type { Collection } from 'mongodb'

export interface User {
	userId: number
	name: string
}

export interface Chat {
	chatId: number
	title: string
}

export interface Database {
	user: Collection<User>
	chat: Collection<Chat>
}
