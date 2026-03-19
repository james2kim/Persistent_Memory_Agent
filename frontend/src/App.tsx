import { useState, useEffect, useRef } from 'react';
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/clerk-react';
import { ChatMessage } from './components/ChatMessage';
import { ChatInput } from './components/ChatInput';
import { FileUpload } from './components/FileUpload';
import { ThinkingIndicator } from './components/ThinkingIndicator';
import { DocumentList } from './components/DocumentList';
import { useChat } from './hooks/useChat';

type Tab = 'chat' | 'documents';

function App() {
  const { messages, isLoading, rateLimit, handleSend, handleUpload } = useChat();
  const isRateLimited = rateLimit !== null && rateLimit.remaining <= 0;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [documentsKey, setDocumentsKey] = useState(0);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    if (tab === 'documents') {
      setDocumentsKey((k) => k + 1);
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
          <div className="header-tabs">
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
          </div>
        </SignedIn>
        <div className="header-actions">
          <SignedIn>
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
        {activeTab === 'chat' ? (
          <div className="container">
            <div className="messages">
              {messages.map((msg) => (
                <ChatMessage key={msg.id} content={msg.content} role={msg.role} loading={msg.loading} />
              ))}
              {isLoading && <ThinkingIndicator />}
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
        ) : (
          <div className="container">
            <DocumentList key={documentsKey} />
          </div>
        )}
      </SignedIn>
    </>
  );
}

export default App;
