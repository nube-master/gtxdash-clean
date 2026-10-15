import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOperationId } from "@/contexts/OperationContext";

export interface JarvisConversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface JarvisMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export function useJarvisConversations() {
  const { user } = useAuth();
  const opId = useOperationId();
  const [conversations, setConversations] = useState<JarvisConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<JarvisMessage[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Fetch conversations list
  const fetchConversations = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("jarvis_conversations")
      .select("id, title, created_at, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(50);
    setConversations((data as JarvisConversation[]) || []);
    setLoadingConversations(false);
  }, [user]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Fetch messages for active conversation
  const fetchMessages = useCallback(async (conversationId: string) => {
    setLoadingMessages(true);
    const { data } = await supabase
      .from("jarvis_messages")
      .select("id, conversation_id, role, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(500);
    setMessages((data as JarvisMessage[]) || []);
    setLoadingMessages(false);
  }, []);

  // Select a conversation
  const selectConversation = useCallback(async (id: string) => {
    setActiveConversationId(id);
    await fetchMessages(id);
  }, [fetchMessages]);

  // Create new conversation
  const createConversation = useCallback(async (firstMessage?: string): Promise<string | null> => {
    if (!user) return null;
    const title = firstMessage
      ? firstMessage.slice(0, 60) + (firstMessage.length > 60 ? "…" : "")
      : "Nova conversa";

    const { data, error } = await supabase
      .from("jarvis_conversations")
      .insert({ user_id: user.id, title, operation_id: opId! })
      .select("id")
      .single();

    if (error || !data) return null;
    const newId = (data as { id: string }).id;
    setActiveConversationId(newId);
    setMessages([]);
    await fetchConversations();
    return newId;
  }, [user, fetchConversations]);

  // Start a fresh new conversation (reset state)
  const startNewConversation = useCallback(() => {
    setActiveConversationId(null);
    setMessages([]);
  }, []);

  // Add message to DB
  const addMessage = useCallback(async (
    conversationId: string,
    role: "user" | "assistant",
    content: string,
  ): Promise<JarvisMessage | null> => {
    if (!user) return null;
    const { data, error } = await supabase
      .from("jarvis_messages")
      .insert({ conversation_id: conversationId, user_id: user.id, role, content, operation_id: opId! })
      .select("id, conversation_id, role, content, created_at")
      .single();

    if (error || !data) return null;
    const msg = data as JarvisMessage;
    setMessages(prev => [...prev, msg]);

    // Update conversation updated_at
    await supabase
      .from("jarvis_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    return msg;
  }, [user]);

  // Update the last assistant message content (for streaming)
  const updateLastAssistantContent = useCallback((content: string) => {
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant") {
        return prev.map((m, i) => i === prev.length - 1 ? { ...m, content } : m);
      }
      // Add a temp assistant message
      return [...prev, {
        id: "streaming",
        conversation_id: "",
        role: "assistant" as const,
        content,
        created_at: new Date().toISOString(),
      }];
    });
  }, []);

  // Finalize streaming: update DB with final content, refresh list
  const finalizeAssistantMessage = useCallback(async (
    conversationId: string,
    finalContent: string,
  ) => {
    if (!user) return;
    // Remove temp streaming message
    setMessages(prev => prev.filter(m => m.id !== "streaming"));
    // Insert the final message
    const { data } = await supabase
      .from("jarvis_messages")
      .insert({ conversation_id: conversationId, user_id: user.id, role: "assistant", content: finalContent, operation_id: opId! })
      .select("id, conversation_id, role, content, created_at")
      .single();
    if (data) {
      setMessages(prev => [...prev.filter(m => m.id !== "streaming"), data as JarvisMessage]);
    }
    await supabase
      .from("jarvis_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);
    fetchConversations();
  }, [user, fetchConversations]);

  // Delete conversation
  const deleteConversation = useCallback(async (id: string) => {
    await supabase.from("jarvis_conversations").delete().eq("id", id);
    if (activeConversationId === id) {
      setActiveConversationId(null);
      setMessages([]);
    }
    fetchConversations();
  }, [activeConversationId, fetchConversations]);

  return {
    conversations,
    activeConversationId,
    messages,
    loadingConversations,
    loadingMessages,
    selectConversation,
    createConversation,
    startNewConversation,
    addMessage,
    updateLastAssistantContent,
    finalizeAssistantMessage,
    deleteConversation,
  };
}
