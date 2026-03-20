import { useState, useEffect } from 'react';
import { useFlashcards } from '../hooks/useFlashcards';
import type { FlashcardData } from '../api/client';

interface FlashcardViewProps {
  flashcardId: string;
  onBack: () => void;
}

export function FlashcardView({ flashcardId, onBack }: FlashcardViewProps) {
  const { fetchFlashcard } = useFlashcards();
  const [data, setData] = useState<FlashcardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchFlashcard(flashcardId).then((record) => {
      if (record) setData(record.flashcard_data);
      setLoading(false);
    });
  }, [flashcardId, fetchFlashcard]);

  if (loading) {
    return <div className="quiz-view"><p style={{ textAlign: 'center', color: '#666' }}>Loading flashcards...</p></div>;
  }

  if (!data) {
    return (
      <div className="quiz-view">
        <p style={{ textAlign: 'center', color: '#e74c3c' }}>Flashcard set not found.</p>
        <button className="quiz-back-btn" onClick={onBack}>Back</button>
      </div>
    );
  }

  const cards = data.cards;
  const card = cards[currentIndex];
  const total = cards.length;

  const goTo = (idx: number) => {
    setFlipped(false);
    setCurrentIndex(idx);
  };

  return (
    <div className="flashcard-view">
      <div className="quiz-header">
        <button className="quiz-back-btn" onClick={onBack}>&larr; Back</button>
        <h2>{data.title}</h2>
        <div className="flashcard-counter">{currentIndex + 1} / {total}</div>
      </div>

      <div className="flashcard-stage" onClick={() => setFlipped((f) => !f)}>
        <div className={`flashcard-card${flipped ? ' flipped' : ''}`}>
          <div className="flashcard-face flashcard-front">
            <p>{card.front}</p>
            <span className="flashcard-hint">Click to flip</span>
          </div>
          <div className="flashcard-face flashcard-back">
            <p>{card.back}</p>
            <span className="flashcard-hint">Click to flip back</span>
          </div>
        </div>
      </div>

      <div className="flashcard-nav">
        <button
          className="flashcard-nav-btn"
          onClick={() => goTo(currentIndex - 1)}
          disabled={currentIndex === 0}
        >
          &larr; Previous
        </button>
        <button
          className="flashcard-nav-btn"
          onClick={() => goTo(currentIndex + 1)}
          disabled={currentIndex === total - 1}
        >
          Next &rarr;
        </button>
      </div>
    </div>
  );
}
