import { useState, useEffect, useCallback } from 'react';
import { sendMessage, uploadFile, getSession, parseSessionMessage } from '../api/client';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'system',
      content:
        'Welcome! Send a message to chat with the agent, or upload a document to add it to the knowledge base.',
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);

  // Load session messages on mount
  useEffect(() => {
    async function loadSession() {
      const session = await getSession();
      if (session?.messages && session.messages.length > 0) {
        const parsed: Message[] = [];
        for (const msg of session.messages) {
          const result = parseSessionMessage(msg);
          if (result) {
            parsed.push({
              id: crypto.randomUUID(),
              role: result.role as 'user' | 'assistant' | 'system',
              content: result.content,
            });
          }
        }
        if (parsed.length > 0) {
          setMessages(parsed);
        }
      }
    }
    loadSession();
  }, []);

  const addMessage = useCallback((role: Message['role'], content: string): Message => {
    const message: Message = {
      id: crypto.randomUUID(),
      role,
      content,
    };
    setMessages((prev) => [...prev, message]);
    return message;
  }, []);

  const handleSend = useCallback(
    async (content: string) => {
      addMessage('user', content);
      setIsLoading(true);

      try {
        const response = await sendMessage(content);
        addMessage('assistant', response.response);
      } catch (err) {
        addMessage('system', err instanceof Error ? err.message : 'Failed to send message. Please try again.');
      } finally {
        setIsLoading(false);
      }
    },
    [addMessage]
  );

  const handleUpload = useCallback(
    async (file: File) => {
      addMessage('system', `Uploading: ${file.name}...`);

      try {
        const response = await uploadFile(file);
        addMessage('system', `Uploaded "${response.filename}" - ${response.chunkCount} chunks ingested.`);
      } catch (err) {
        addMessage('system', err instanceof Error ? err.message : 'Upload failed. Please try again.');
      }
    },
    [addMessage]
  );

  return {
    messages,
    isLoading,
    handleSend,
    handleUpload,
  };
}
