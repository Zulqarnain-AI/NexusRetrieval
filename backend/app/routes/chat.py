# app/routes/chat.py
import json
import logging
from typing import Iterator

from flask import Blueprint, request, jsonify, Response, stream_with_context

from app.core.rag_chain import build_rag_chain, retrieve_sources
from app.core.vectorstore import collection_stats

logger = logging.getLogger(__name__)

chat_bp = Blueprint("chat", __name__)


def _sse_event(event: str, data: any) -> str:
    """
    Formats a Server-Sent Events message.

    SSE wire format (must be exact):
      event: <event_name>\n
      data: <json_string>\n
      \n          ← blank line terminates the event

    The double newline at the end signals to the browser's EventSource
    API that the event is complete and should be dispatched.
    """
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _generate_sse_stream(question: str) -> Iterator[str]:
    """
    Core SSE generator. This function runs inside Flask's streaming
    response context.

    Event sequence:
      1. "sources" event  — sent FIRST with retrieved document metadata
                            so the frontend can render the sources panel
                            immediately, before the answer starts
      2. "token" events   — one per LLM token, streamed as they arrive
      3. "done" event     — signals the frontend to stop the loading state

    Why send sources BEFORE tokens?
    The retrieval step (MultiQueryRetriever) completes before the LLM
    starts generating. We have the sources immediately — no reason to
    make the user wait until the full answer is done to see them.
    This creates a perceived performance improvement.

    Error handling strategy:
    Any exception inside a generator silently stops iteration in Flask.
    We catch explicitly and yield an "error" event so the frontend
    always receives a terminal signal and never hangs indefinitely.
    """
    try:
        # ── Step 1: Retrieve sources (blocking, completes quickly) ────────
        logger.info(
            "Chat request received",
            extra={"question": question[:80]},
        )
        sources = retrieve_sources(question)

        # Send sources immediately — frontend renders the accordion now
        yield _sse_event("sources", {"sources": sources})

        # ── Step 2: Stream the answer tokens ──────────────────────────────
        chain = build_rag_chain()
        token_count = 0

        for token in chain.stream({"question": question}):
            if token:   # skip empty string tokens (LangChain emits them)
                yield _sse_event("token", {"token": token})
                token_count += 1

        # ── Step 3: Signal completion ─────────────────────────────────────
        logger.info(
            "Stream complete",
            extra={"question": question[:80], "tokens_sent": token_count},
        )
        yield _sse_event("done", {"token_count": token_count})

    except Exception as exc:
        logger.error(
            "SSE stream error",
            extra={"error": str(exc)},
            exc_info=True,
        )
        yield _sse_event("error", {"error": str(exc)})


@chat_bp.route("/chat", methods=["POST"])
def chat():
    """
    Streaming chat endpoint using Server-Sent Events.

    Request body (JSON):
      {"question": "your question here"}

    Response:
      Content-Type: text/event-stream
      A sequence of SSE events (sources → tokens → done)

    Why not WebSockets?
    SSE is simpler, works over standard HTTP/1.1, and is
    one-directional — which is all we need. WebSockets add
    complexity (connection management, reconnection logic)
    with no benefit for a request-response chat pattern.

    The X-Accel-Buffering header tells Nginx (if used as a
    reverse proxy) not to buffer this response — without it,
    Nginx collects the entire stream before forwarding, which
    completely defeats the purpose of streaming.
    """
    body = request.get_json(silent=True)
    if not body or "question" not in body:
        return jsonify({"error": "Request body must be JSON with a 'question' field"}), 400

    question: str = body["question"].strip()
    if not question:
        return jsonify({"error": "Question cannot be empty"}), 400

    if len(question) > 4000:
        return jsonify({"error": "Question exceeds maximum length of 4000 characters"}), 400

    # Check that there's actually something in the knowledge base
    stats = collection_stats()
    if stats.get("document_count", 0) == 0:
        return jsonify({
            "error": "Knowledge base is empty. Please upload documents first."
        }), 422

    response = Response(
        stream_with_context(_generate_sse_stream(question)),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",          # Disable Nginx buffering
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",  # CORS for SSE
        },
    )
    return response


@chat_bp.route("/health", methods=["GET"])
def health():
    """
    Health check endpoint. Useful for Docker, load balancers,
    and your frontend to check backend connectivity on startup.
    """
    stats = collection_stats()
    return jsonify({
        "status": "ok",
        "knowledge_base": stats,
    }), 200