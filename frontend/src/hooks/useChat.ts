import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { sendMessage, uploadFileSmart, pollJobStatus, getSession, parseSessionMessage, type RateLimitInfo } from '../api/client';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  loading?: boolean;
}

export function useChat() {
  const { getToken } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'system',
      content:
        'Welcome! Send a message to chat with the agent, or upload a document to add it to the knowledge base.',
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [rateLimit, setRateLimit] = useState<RateLimitInfo | null>(null);

  // Load session messages on mount
  useEffect(() => {
    async function loadSession() {
      const session = await getSession(getToken);
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
  }, [getToken]);

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
        const response = await sendMessage(content, getToken);
        if (response.rateLimit) setRateLimit(response.rateLimit);
        addMessage('assistant', response.response);
      } catch (err) {
        const rateLimitInfo = (err as Error & { rateLimit?: RateLimitInfo }).rateLimit;
        if (rateLimitInfo) setRateLimit(rateLimitInfo);
        addMessage('system', err instanceof Error ? err.message : 'Failed to send message. Please try again.');
      } finally {
        setIsLoading(false);
      }
    },
    [addMessage, getToken]
  );

  const updateMessage = useCallback(
    (id: string, content: string, loading?: boolean) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, content, loading: loading ?? m.loading } : m))
      );
    },
    []
  );

  const handleUpload = useCallback(
    (file: File) => {
      const statusMsg = addMessage('system', `Uploading: ${file.name}...`);
      updateMessage(statusMsg.id, statusMsg.content, true);

      uploadFileSmart(file, getToken)
        .then((outcome) => {
          if (outcome.kind === 'completed') {
            updateMessage(
              statusMsg.id,
              `Uploaded "${outcome.result.filename}" — ${outcome.result.chunkCount} chunks ingested.`,
              false
            );
          } else {
            updateMessage(statusMsg.id, `Processing document: ${file.name}...`, true);

            pollJobStatus(outcome.jobId, getToken, (status) => {
              if (status.progress?.stage) {
                const label = status.progress.stage.replace(/_/g, ' ');
                updateMessage(statusMsg.id, `Processing "${file.name}": ${label}...`, true);
              }
            })
              .then((result) => {
                updateMessage(
                  statusMsg.id,
                  `Uploaded "${result.filename}" — ${result.chunkCount} chunks ingested.`,
                  false
                );
              })
              .catch((err) => {
                updateMessage(
                  statusMsg.id,
                  err instanceof Error ? err.message : 'Processing failed. Please try again.',
                  false
                );
              });
          }
        })
        .catch((err) => {
          updateMessage(
            statusMsg.id,
            err instanceof Error ? err.message : 'Upload failed. Please try again.',
            false
          );
        });
    },
    [addMessage, updateMessage, getToken]
  );

  return {
    messages,
    isLoading,
    rateLimit,
    handleSend,
    handleUpload,
  };
}
