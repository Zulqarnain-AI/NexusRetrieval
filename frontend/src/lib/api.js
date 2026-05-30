// frontend/src/lib/api.js

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

// ── Ingestion ─────────────────────────────────────────────────────────────────

/**
 * Uploads a file to the backend ingestion pipeline.
 * @param {File} file - The File object from an <input> or drag-drop event
 * @param {(progress: string) => void} onStatus - Optional status callback
 * @returns {Promise<{chunks_created: number, collection_stats: object}>}
 */
export async function uploadFile(file, onStatus) {
  const formData = new FormData();
  formData.append("file", file);

  onStatus?.(`Uploading ${file.name}...`);

  const resp = await fetch(`${BASE_URL}/upload-file`, {
    method: "POST",
    body: formData,
    // Do NOT set Content-Type header — browser sets it automatically
    // with the correct multipart boundary when using FormData
  });

  const data = await resp.json();

  if (!resp.ok) {
    throw new Error(data.error || `Upload failed with status ${resp.status}`);
  }

  onStatus?.(`Ready — ${data.chunks_created} chunks indexed`);
  return data;
}

/**
 * Scrapes a URL and adds it to the knowledge base.
 * @param {string} url
 * @returns {Promise<{chunks_created: number, collection_stats: object}>}
 */
export async function scrapeUrl(url) {
  const resp = await fetch(`${BASE_URL}/scrape-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  const data = await resp.json();

  if (!resp.ok) {
    throw new Error(data.error || `Scrape failed with status ${resp.status}`);
  }

  return data;
}

/**
 * Deletes an ingested source and all its chunks by backend doc_id.
 * @param {string} docId
 */
export async function deleteSource(docId) {
  const resp = await fetch(`${BASE_URL}/documents/${encodeURIComponent(docId)}`, {
    method: "DELETE",
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data.error || `Delete failed with status ${resp.status}`);
  }

  return data;
}

/**
 * Clears the entire vector knowledge base.
 */
export async function resetKnowledgeBase() {
  const resp = await fetch(`${BASE_URL}/knowledge-base/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data.error || `Reset failed with status ${resp.status}`);
  }

  return data;
}

/**
 * Health check — used by the frontend to show backend connection status.
 * @returns {Promise<{status: string, knowledge_base: object}>}
 */
export async function checkHealth() {
  const resp = await fetch(`${BASE_URL}/health`);
  if (!resp.ok) throw new Error("Backend unreachable");
  return resp.json();
}

// ── Streaming Chat ────────────────────────────────────────────────────────────

/**
 * Sends a question to the RAG pipeline and streams the response.
 *
 * Why fetch + ReadableStream instead of EventSource?
 * The browser's EventSource API only supports GET requests.
 * Our /api/chat endpoint requires POST to send the question body.
 * fetch() gives us full control while still supporting streaming.
 *
 * @param {string} question
 * @param {object} callbacks
 * @param {(sources: Array) => void} callbacks.onSources   - called once with source docs
 * @param {(token: string) => void}  callbacks.onToken     - called per token
 * @param {(count: number) => void}  callbacks.onDone      - called when stream ends
 * @param {(error: string) => void}  callbacks.onError     - called on error
 * @param {AbortSignal}              callbacks.signal      - for cancellation
 */
export async function streamChat(question, callbacks) {
  const { onSources, onToken, onDone, onError, signal } = callbacks;

  let resp;
  try {
    resp = await fetch(`${BASE_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
      signal,  // allows the caller to cancel mid-stream
    });
  } catch (err) {
    if (err.name === "AbortError") return;
    onError?.(err.message);
    return;
  }

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    onError?.(data.error || `Request failed with status ${resp.status}`);
    return;
  }

  // ── Parse the SSE stream manually ────────────────────────────────────────
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    // Decode the chunk and add to buffer
    // We buffer because a single read() may return a partial SSE event
    buffer += decoder.decode(value, { stream: true });

    // SSE events are separated by double newlines
    const parts = buffer.split("\n\n");

    // Keep the last (possibly incomplete) part in the buffer
    buffer = parts.pop() || "";

    for (const part of parts) {
      if (!part.trim()) continue;

      const lines = part.split("\n");
      let eventType = currentEvent;
      let dataLine = "";

      for (const line of lines) {
        if (line.startsWith("event:")) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataLine = line.slice(5).trim();
        }
      }

      if (!dataLine) continue;

      let payload;
      try {
        payload = JSON.parse(dataLine);
      } catch {
        continue;  // malformed data line — skip
      }

      // Dispatch to the correct callback
      switch (eventType) {
        case "sources":
          onSources?.(payload.sources);
          break;
        case "token":
          onToken?.(payload.token);
          break;
        case "done":
          onDone?.(payload.token_count);
          break;
        case "error":
          onError?.(payload.error);
          break;
      }
    }
  }
}