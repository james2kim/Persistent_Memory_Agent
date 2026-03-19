import { useState } from 'react';
import { useDocuments } from '../hooks/useDocuments';

export function DocumentList() {
  const { documents, loading, error, handleDelete } = useDocuments();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="documents-list">
        <p style={{ textAlign: 'center', color: '#666' }}>Loading documents...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="documents-list">
        <p style={{ textAlign: 'center', color: '#e74c3c' }}>{error}</p>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="documents-list">
        <p style={{ textAlign: 'center', color: '#666' }}>
          No documents uploaded yet. Use the upload area in the Chat tab to add documents.
        </p>
      </div>
    );
  }

  return (
    <div className="documents-list">
      {documents.map((doc) => (
        <div key={doc.id} className="document-card">
          <div className="document-card-header">
            <h3>{doc.title || doc.source}</h3>
            {confirmId === doc.id ? (
              <div className="document-confirm-delete">
                <span>Delete?</span>
                <button
                  className="document-delete-yes"
                  onClick={() => {
                    handleDelete(doc.id);
                    setConfirmId(null);
                  }}
                >
                  Yes
                </button>
                <button
                  className="document-delete-no"
                  onClick={() => setConfirmId(null)}
                >
                  No
                </button>
              </div>
            ) : (
              <button
                className="document-delete-btn"
                onClick={() => setConfirmId(doc.id)}
                title="Delete document"
              >
                Delete
              </button>
            )}
          </div>
          <p className="document-summary">
            {doc.summary || 'No summary available'}
          </p>
          <div className="document-meta">
            <span>{doc.source}</span>
            <span>{new Date(doc.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
