import { useState } from 'react';
import { useFlashcards } from '../hooks/useFlashcards';
import { ConfirmModal } from './ConfirmModal';

interface FlashcardListProps {
  onSelect: (id: string) => void;
}

export function FlashcardList({ onSelect }: FlashcardListProps) {
  const { flashcards, loading, error, removeFlashcard } = useFlashcards();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  if (loading) {
    return <div className="documents-list"><p style={{ textAlign: 'center', color: '#666' }}>Loading flashcards...</p></div>;
  }

  if (error) {
    return <div className="documents-list"><p style={{ textAlign: 'center', color: '#e74c3c' }}>{error}</p></div>;
  }

  if (flashcards.length === 0) {
    return (
      <div className="documents-list">
        <div className="document-card empty-state-card">
          <div className="document-card-header">
            <h3>No flashcards yet</h3>
          </div>
          <p className="document-summary">
            Ask the agent to create flashcards in the Chat tab! Try something like "Make me flashcards about photosynthesis".
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="documents-list">
      {deleteTarget && (
        <ConfirmModal
          title="Delete Flashcards"
          message={`Are you sure you want to delete "${deleteTarget.title}"? This cannot be undone.`}
          onConfirm={() => { removeFlashcard(deleteTarget.id); setDeleteTarget(null); }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {flashcards.map((fc) => (
        <div key={fc.id} className="document-card" style={{ cursor: 'pointer' }} onClick={() => onSelect(fc.id)}>
          <div className="document-card-header">
            <h3>{fc.title}</h3>
            <button
              className="document-delete-btn"
              onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: fc.id, title: fc.title }); }}
              title="Delete flashcards"
            >
              Delete
            </button>
          </div>
          <div className="document-meta">
            <span>{fc.card_count} card{fc.card_count !== 1 ? 's' : ''}</span>
            <span>{new Date(fc.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
