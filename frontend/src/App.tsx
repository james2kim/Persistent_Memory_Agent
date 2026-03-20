import { useState, useEffect, useRef } from 'react';
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/clerk-react';
import { ChatMessage } from './components/ChatMessage';
import { ChatInput } from './components/ChatInput';
import { FileUpload } from './components/FileUpload';
import { ThinkingIndicator } from './components/ThinkingIndicator';
import { DocumentList } from './components/DocumentList';
import { QuizList } from './components/QuizList';
import { QuizView } from './components/QuizView';
import { FlashcardList } from './components/FlashcardList';
import { FlashcardView } from './components/FlashcardView';
import { useChat } from './hooks/useChat';

type Tab = 'chat' | 'documents' | 'study';
type StudyView = 'list' | 'quiz' | 'flashcard';

function App() {
  const { messages, isLoading, progressLabel, rateLimit, handleSend, handleUpload } = useChat();
  const isRateLimited = rateLimit !== null && rateLimit.remaining <= 0;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [documentsKey, setDocumentsKey] = useState(0);
  const [studyKey, setStudyKey] = useState(0);
  const [studyView, setStudyView] = useState<StudyView>('list');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    setMenuOpen(false);
    if (tab === 'documents') {
      setDocumentsKey((k) => k + 1);
    }
    if (tab === 'study') {
      setStudyKey((k) => k + 1);
      setStudyView('list');
      setSelectedItemId(null);
    }
  };

  return (
    <>
      <header>
        <div className="header-logo">
          <img src="/logo.png" alt="Anchor logo" />
          <h1>Anchor</h1>
        </div>
        <SignedIn>
          <div className={`header-tabs${menuOpen ? ' open' : ''}`}>
            <button
              className={`tab-button${activeTab === 'chat' ? ' active' : ''}`}
              onClick={() => switchTab('chat')}
            >
              Chat
            </button>
            <button
              className={`tab-button${activeTab === 'documents' ? ' active' : ''}`}
              onClick={() => switchTab('documents')}
            >
              Documents
            </button>
            <button
              className={`tab-button${activeTab === 'study' ? ' active' : ''}`}
              onClick={() => switchTab('study')}
            >
              Study
            </button>
          </div>
        </SignedIn>
        <div className="header-actions">
          <SignedIn>
            <button
              className="hamburger"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Toggle menu"
            >
              <span /><span /><span />
            </button>
            <UserButton />
          </SignedIn>
        </div>
      </header>

      <SignedOut>
        <div className="auth-container">
          <div className="auth-card">
            <h2>Welcome to Anchor</h2>
            <p>Your AI-powered study companion. Upload documents, ask questions, and learn smarter.</p>
            <SignInButton mode="modal">
              <button className="primary">Sign In</button>
            </SignInButton>
          </div>
        </div>
      </SignedOut>

      <SignedIn>
        {activeTab === 'chat' && (
          <div className="container">
            <div className="messages">
              {messages.map((msg) => (
                <ChatMessage key={msg.id} content={msg.content} role={msg.role} loading={msg.loading} />
              ))}
              {isLoading && <ThinkingIndicator label={progressLabel} />}
              <div ref={messagesEndRef} />
            </div>

            {isRateLimited && (
              <div className="rate-limit-alert">
                Daily message limit reached ({rateLimit.limit}/{rateLimit.limit}). Please try again tomorrow.
              </div>
            )}
            <ChatInput onSend={handleSend} disabled={isLoading || isRateLimited} />
            <FileUpload onUpload={handleUpload} disabled={isLoading} />
          </div>
        )}
        {activeTab === 'documents' && (
          <div className="container">
            <DocumentList key={documentsKey} />
          </div>
        )}
        {activeTab === 'study' && (
          <div className="container">
            {studyView === 'quiz' && selectedItemId ? (
              <QuizView
                key={selectedItemId}
                quizId={selectedItemId}
                onBack={() => { setStudyView('list'); setSelectedItemId(null); }}
              />
            ) : studyView === 'flashcard' && selectedItemId ? (
              <FlashcardView
                key={selectedItemId}
                flashcardId={selectedItemId}
                onBack={() => { setStudyView('list'); setSelectedItemId(null); }}
              />
            ) : (
              <div className="study-lists" key={studyKey}>
                <h3 className="study-section-title">Quizzes</h3>
                <QuizList onSelectQuiz={(id) => { setSelectedItemId(id); setStudyView('quiz'); }} />
                <h3 className="study-section-title">Flashcards</h3>
                <FlashcardList onSelect={(id) => { setSelectedItemId(id); setStudyView('flashcard'); }} />
              </div>
            )}
          </div>
        )}
      </SignedIn>
    </>
  );
}

export default App;
