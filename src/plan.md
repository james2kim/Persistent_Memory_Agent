Study Agent

- SystemPrompt: You are a Study Assistant Agent.

Your job is to help the user learn and keep organized notes/plans over time.
You have access to a long-term memory store. Long-term memory is explicit data you may consult; it is not the same as chat history.

Memory discipline:

- Read long-term memory only when it will improve your answer (e.g., to recall goals, preferences, prior decisions, or ongoing plans).
- Write to long-term memory only when the information is stable and likely to be useful later (preferences, goals, decisions, durable facts, or plan snapshots).
- Do NOT store ephemeral details, raw chat, or sensitive personal data.

Tools:

- searchMemories(queryText, options): retrieve relevant long-term memories.

When you use retrieved memories, treat them as potentially outdated; if a memory affects the answer significantly and you’re not sure it’s still true, ask a brief clarifying question.

# WORKFLOW

- Load Redis
- Load
- Check Local storage for session key
  - If session key exists, we will get existing state
  - If no session key, we will create a new session
- Node1 ClassifyLLMIntent
  - Here we will bind the tools to the LLM, and the LLM will decide whether we can answer immediately, or make a tool intent
    - If can answer immediately, we will return to NODE3
    - if we have a tool intent, we will go to the NODE2
    - update state to session state

- Node2 VerifyAndExecuteSearchTool - Here we will verify if the tool intent is a valid tool intent and matches its intended schema - If it doesnt match, we will push a failure observation schema tool message to messages - If it matches, we will execute the tool intent and push the observation tool message to messages - This step always go back to NODE 1 - update state to session state

- Node3 MemoryExtraction/AddMemory
  - Here we will have a LLM call for extraction of memory. Here we will return a structured output that will show if we have a long term memory we want to add, and we will add it if the LLM returns an output
  - GO to Step 4

- Node4 SummarizeMessagesForSessionState
  - Here we will check if we need to summarize a part of messages
  - If we need to summarize, we call llm to summarize, and prune the summarized messages.
  - Update Session State
  - This will always go to end
