import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { listFlashcards, getFlashcard, deleteFlashcard, type FlashcardListItem, type FlashcardRecord } from '../api/client';

export function useFlashcards() {
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const [flashcards, setFlashcards] = useState<FlashcardListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listFlashcards(getTokenRef.current);
      setFlashcards(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load flashcards');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const fetchFlashcard = useCallback(
    async (id: string): Promise<FlashcardRecord | null> => {
      try {
        return await getFlashcard(id, getTokenRef.current);
      } catch {
        return null;
      }
    },
    []
  );

  const removeFlashcard = useCallback(
    async (id: string) => {
      await deleteFlashcard(id, getTokenRef.current);
      setFlashcards((prev) => prev.filter((f) => f.id !== id));
    },
    []
  );

  return { flashcards, loading, error, refresh, fetchFlashcard, removeFlashcard };
}
