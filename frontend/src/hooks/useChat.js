// frontend/src/hooks/useChat.js
import { useState, useRef, useCallback } from "react";
import { streamChat } from "../lib/api";

/**
 * Manages all chat state and streaming logic.
 * Components stay clean — they just call sendMessage() and
 * read from messages[].
 *
 * Message shape:
 * {
 *   id: string,
 *   role: "user" | "ai",
 *   content: string,        // accumulated token stream for AI messages
 *   sources: Array | null,
 *   isStreaming: boolean,
 *   ts: string,
 * }
 */
export function useChat() {
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef(null);

  const sendMessage = useCallback(async (question) => {
    if (!question.trim() || isStreaming) return;

    // ── Add user message immediately ──────────────────────────────────────
    const userMsg = {
      id: `user_${Date.now()}`,
      role: "user",
      content: question,
      sources: null,
      isStreaming: false,
      ts: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    // ── Add empty AI message placeholder ─────────────────────────────────
    const aiMsgId = `ai_${Date.now()}`;
    const aiMsg = {
      id: aiMsgId,
      role: "ai",
      content: "",
      sources: null,
      isStreaming: true,
      ts: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setIsStreaming(true);

    // ── Set up abort controller for cancellation ──────────────────────────
    abortControllerRef.current = new AbortController();

    await streamChat(question, {
      signal: abortControllerRef.current.signal,

      onSources: (sources) => {
        // Sources arrive first — update the AI message with them
        setMessages((prev) =>
          prev.map((m) => m.id === aiMsgId ? { ...m, sources } : m)
        );
      },

      onToken: (token) => {
        // Append each token to the AI message content
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? { ...m, content: m.content + token }
              : m
          )
        );
      },

      onDone: () => {
        // Mark streaming complete
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId ? { ...m, isStreaming: false } : m
          )
        );
        setIsStreaming(false);
      },

      onError: (error) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? {
                  ...m,
                  content: `Error: ${error}`,
                  isStreaming: false,
                }
              : m
          )
        );
        setIsStreaming(false);
      },
    });
  }, [isStreaming]);

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
    // Mark last AI message as no longer streaming
    setMessages((prev) =>
      prev.map((m, i) =>
        i === prev.length - 1 && m.role === "ai"
          ? { ...m, isStreaming: false }
          : m
      )
    );
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, isStreaming, sendMessage, stopStreaming, clearMessages };
}