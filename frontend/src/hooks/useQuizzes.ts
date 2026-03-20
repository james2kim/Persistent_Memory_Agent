import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { listQuizzes, getQuiz, deleteQuiz, type QuizListItem, type QuizRecord } from '../api/client';

export function useQuizzes() {
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const [quizzes, setQuizzes] = useState<QuizListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listQuizzes(getTokenRef.current);
      setQuizzes(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load quizzes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const fetchQuiz = useCallback(
    async (quizId: string): Promise<QuizRecord | null> => {
      try {
        return await getQuiz(quizId, getTokenRef.current);
      } catch {
        return null;
      }
    },
    []
  );

  const removeQuiz = useCallback(
    async (quizId: string) => {
      await deleteQuiz(quizId, getTokenRef.current);
      setQuizzes((prev) => prev.filter((q) => q.id !== quizId));
    },
    []
  );

  return { quizzes, loading, error, refresh, fetchQuiz, removeQuiz };
}
