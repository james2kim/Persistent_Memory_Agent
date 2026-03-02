import { formatMarkdown } from '../utils/formatMarkdown';

interface ChatMessageProps {
  content: string;
  role: 'user' | 'assistant' | 'system';
}

export function ChatMessage({ content, role }: ChatMessageProps) {
  return (
    <div
      className={`message ${role}`}
      dangerouslySetInnerHTML={{ __html: formatMarkdown(content) }}
    />
  );
}
