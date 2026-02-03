import type {Message} from './types'

export const SummarizeUil = {
    shouldSummarize(messages: Message[],  maxMessages = 40) {
        return messages.length >= maxMessages
    }
}