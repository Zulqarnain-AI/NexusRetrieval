// frontend/src/hooks/useKnowledgeBase.js
import { useState, useCallback, useEffect } from "react";
import {
  uploadFile,
  scrapeUrl,
  checkHealth,
  deleteSource,
  resetKnowledgeBase,
} from "../lib/api";

/**
 * Manages knowledge base state: uploaded docs, processing status,
 * and backend connectivity.
 */
export function useKnowledgeBase() {
  const [docs, setDocs] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const [docCount, setDocCount] = useState(0);

  // ── Check backend health on mount ─────────────────────────────────────
  useEffect(() => {
    checkHealth()
      .then((data) => {
        setConnectionStatus("connected");
        setDocCount(data.knowledge_base?.document_count || 0);
      })
      .catch(() => setConnectionStatus("disconnected"));
  }, []);

  const addDoc = useCallback((name, type) => {
    const id = `doc_${Date.now()}`;
    setDocs((prev) => [
      ...prev,
      { id, name, type, status: "parsing", size: "—", backendDocId: null },
    ]);
    return id;
  }, []);

  const updateDocStatus = useCallback((id, status) => {
    setDocs((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status } : d))
    );
  }, []);

  const setBackendDocId = useCallback((id, backendDocId) => {
    setDocs((prev) =>
      prev.map((d) => (d.id === id ? { ...d, backendDocId } : d))
    );
  }, []);

  const removeDoc = useCallback(async (id) => {
    const targetDoc = docs.find((d) => d.id === id);
    if (!targetDoc) return;

    if (targetDoc.backendDocId) {
      const result = await deleteSource(targetDoc.backendDocId);
      setDocCount(result.collection_stats?.document_count || 0);
    }

    setDocs((prev) => prev.filter((d) => d.id !== id));
  }, [docs]);

  const resetKB = useCallback(async () => {
    const result = await resetKnowledgeBase();
    setDocs([]);
    setDocCount(result.collection_stats?.document_count || 0);
    return result;
  }, []);

  const handleFileUpload = useCallback(async (files) => {
    for (const file of files) {
      const ext = file.name.split(".").pop().toLowerCase();
      const type = ext === "pdf" ? "pdf" : ext === "docx" ? "docx" : "txt";
      const docId = addDoc(file.name, type);

      try {
        updateDocStatus(docId, "parsing");

        // Small delay so "parsing" state is visible in the UI
        await new Promise((r) => setTimeout(r, 400));
        updateDocStatus(docId, "embedding");

        const result = await uploadFile(file);

        updateDocStatus(docId, "ready");
        setBackendDocId(docId, result.source_doc_id || null);
        setDocCount(result.collection_stats?.document_count || 0);

      } catch (err) {
        updateDocStatus(docId, "error");
        console.error("Upload failed:", err.message);
      }
    }
  }, [addDoc, updateDocStatus, setBackendDocId]);

  const handleScrapeUrl = useCallback(async (url) => {
    const domain = new URL(url).hostname;
    const docId = addDoc(url, "web");

    try {
      updateDocStatus(docId, "parsing");
      await new Promise((r) => setTimeout(r, 400));
      updateDocStatus(docId, "embedding");

      const result = await scrapeUrl(url);

      updateDocStatus(docId, "ready");
      setBackendDocId(docId, result.source_doc_id || null);
      setDocCount(result.collection_stats?.document_count || 0);
      return result;

    } catch (err) {
      updateDocStatus(docId, "error");
      throw err;
    }
  }, [addDoc, updateDocStatus, setBackendDocId]);

  return {
    docs,
    connectionStatus,
    docCount,
    handleFileUpload,
    handleScrapeUrl,
    removeDoc,
    resetKB,
  };
}