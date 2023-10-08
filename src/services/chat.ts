import type { Chat, Database } from '../types/database.js'

async function createChat(args: {
	db: Database
	chatId: number
	title: string
}): Promise<Chat> {
	const chatObject = {
		chatId: args.chatId,
		title: args.title
	} as Chat

	await args.db.chat.insertOne(chatObject)

	return chatObject
}

export async function getOrCreateChat(args: {
	db: Database
	chatId: number
	title: string
}): Promise<Chat> {
	const chat = await args.db.chat.findOneAndUpdate(
		{ chatId: args.chatId },
		{ $set: { title: args.title } },
		{ returnDocument: 'after' }
	)

	if (chat.ok && chat.value) {
		return chat.value
	}

	return createChat(args)
}
