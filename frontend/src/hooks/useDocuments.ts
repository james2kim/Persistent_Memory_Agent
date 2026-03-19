import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { listDocuments, deleteDocument, DocumentItem } from '../api/client';

export function useDocuments() {
  const { getToken } = useAuth();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const docs = await listDocuments(getToken);
      setDocuments(docs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleDelete = useCallback(
    async (documentId: string) => {
      try {
        await deleteDocument(documentId, getToken);
        setDocuments((prev) => prev.filter((d) => d.id !== documentId));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete document');
      }
    },
    [getToken]
  );

  return { documents, loading, error, fetchDocuments, handleDelete };
}
