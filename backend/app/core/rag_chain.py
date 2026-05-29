# app/core/rag_chain.py
import logging
from typing import AsyncIterator, Iterator, Any
from operator import itemgetter

from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import (
    RunnablePassthrough,
    RunnableLambda,
    RunnableParallel,
)
from langchain_core.documents import Document

from app.config import config
from app.core.vectorstore import get_retriever, get_vectorstore
from app.core.multi_query import SimpleMultiQueryRetriever

logger = logging.getLogger(__name__)
logging.getLogger("langchain_core").setLevel(logging.WARNING)

# ── LLM singleton ─────────────────────────────────────────────────────────────

def get_llm(streaming: bool = False) -> ChatGroq:
    """
    Returns a Groq LLM instance.

    Why Groq? It runs LLaMA3 on custom LPU hardware — inference is
    10-20x faster than GPU-based providers. For a streaming chat
    endpoint, this matters: users see the first token in ~300ms.

    We create separate instances for streaming vs non-streaming because:
    - The MultiQueryRetriever uses the LLM internally to rewrite queries
      — it does NOT stream (it needs the full rewritten list at once)
    - The final answer generation DOES stream to the client
    """
    return ChatGroq(
        api_key=config.groq_api_key,
        model=config.groq_model_name,
        temperature=0.0,        # Deterministic for RAG — we want facts, not creativity
        streaming=streaming,
        max_tokens=1024,
    )


# ── Prompt Engineering ────────────────────────────────────────────────────────

# This is the single most important prompt in the system.
# Every instruction here is deliberate:
#
# 1. "ONLY use the context below" — prevents hallucination by anchoring
#    the LLM to retrieved chunks. Without this, LLMs confabulate.
#
# 2. "cite the source_name" — forces the model to reference the metadata
#    we carefully attached in ingestion.py. The frontend renders these.
#
# 3. "If the context does not contain" — graceful degradation. Better to
#    say "I don't know" than invent a plausible-sounding wrong answer.
#
# 4. Markdown formatting instruction — the React frontend renders markdown,
#    so we explicitly request it for clean output.

SYSTEM_PROMPT = """You are NexusRetrieval, an expert research assistant. \
Your job is to answer questions based EXCLUSIVELY on the retrieved context provided below.

STRICT RULES:
1. ONLY use information from the context below. Never use prior knowledge.
2. Always cite your sources using the format: [Source: <source_name>, Page: <page>] \
   or [Source: <source_name>] for web sources. Place citations inline.
3. If the context does not contain enough information to answer the question, \
   respond with: "I could not find sufficient information in the provided documents \
   to answer this question." Do NOT speculate or hallucinate.
4. Format your response using clean Markdown: use **bold** for key terms, \
   bullet lists for enumerations, and headers for multi-part answers.
5. Be concise but complete. Prioritize accuracy over comprehensiveness.

CONTEXT:
{context}
"""

RAG_PROMPT = ChatPromptTemplate.from_messages([
    ("system", SYSTEM_PROMPT),
    ("human", "{question}"),
])


# ── Document formatting ───────────────────────────────────────────────────────

def _format_docs_for_context(docs: list[Document]) -> str:
    """
    Converts retrieved Document objects into a structured string
    that the LLM can parse.

    Why include metadata in the context string?
    The LLM needs to see the source_name and page to cite them.
    Without this, it would hallucinate citation details.

    Format per chunk:
    ---
    [Source: report.pdf | Page: 3 | Chunk: 2/12]
    <chunk text here>
    ---
    """
    if not docs:
        return "No relevant context was retrieved from the knowledge base."

    formatted_parts = []
    for doc in docs:
        meta = doc.metadata
        source = meta.get("source_name", "Unknown Source")
        page = meta.get("page")
        chunk_idx = meta.get("chunk_index", "?")
        chunk_total = meta.get("chunk_total", "?")

        if page:
            header = f"[Source: {source} | Page: {page} | Chunk: {chunk_idx}/{chunk_total}]"
        else:
            header = f"[Source: {source} | Chunk: {chunk_idx}/{chunk_total}]"

        formatted_parts.append(f"---\n{header}\n{doc.page_content.strip()}\n---")

    return "\n\n".join(formatted_parts)


def _serialize_source_metadata(docs: list[Document]) -> list[dict]:
    """
    Converts Documents to clean dicts for the API JSON response.

    The Flask /chat endpoint returns two things:
      1. The streamed answer text (tokens)
      2. A final JSON payload with the source documents used

    This function builds that second payload.
    """
    seen_ids = set()
    sources = []

    for doc in docs:
        meta = doc.metadata
        # Deduplicate by doc_id — MultiQueryRetriever can return
        # the same chunk from multiple query variants
        doc_id = meta.get("doc_id", "")
        chunk_key = f"{doc_id}_{meta.get('chunk_index', 0)}"

        if chunk_key in seen_ids:
            continue
        seen_ids.add(chunk_key)

        sources.append({
            "source_name": meta.get("source_name", "Unknown"),
            "source_type": meta.get("source_type", "unknown"),
            "page": meta.get("page"),
            "chunk_index": meta.get("chunk_index"),
            "chunk_total": meta.get("chunk_total"),
            "domain": meta.get("domain"),
            "snippet": doc.page_content.strip()[:200] + "..."
            if len(doc.page_content) > 200
            else doc.page_content.strip(),
        })

    return sources


# ── Multi-Query Retriever factory ─────────────────────────────────────────────

# ✅ Replace the entire get_multi_query_retriever() function with this:
def get_multi_query_retriever() -> SimpleMultiQueryRetriever:
    """
    Returns our custom MultiQueryRetriever backed by ChromaDB + Groq.
    Uses a non-streaming LLM instance for query rewriting since we
    need the complete rewritten list before retrieval can begin.
    """
    base_retriever = get_retriever(k=config.retriever_k)
    llm = get_llm(streaming=False)

    retriever = SimpleMultiQueryRetriever(
        retriever=base_retriever,
        llm=llm,
    )

    logger.info(
        "SimpleMultiQueryRetriever initialized",
        extra={
            "base_k": config.retriever_k,
            "model": config.groq_model_name,
        },
    )
    return retriever


# ── Core RAG chain (LCEL) ─────────────────────────────────────────────────────

def build_rag_chain():
    """
    Assembles the full RAG pipeline using LCEL.

    SimpleMultiQueryRetriever is a plain Python class, not a LangChain
    Runnable — so we can't use the | pipe operator directly on it.
    RunnableLambda wraps any callable into a Runnable, making it
    compatible with LCEL chaining. This is the correct pattern for
    integrating custom logic into an LCEL pipeline.

    Data flow:
      {"question": str}
           │
           ├─► [RunnableLambda] extract question
           │         │
           │         ▼
           │   SimpleMultiQueryRetriever.invoke(question)
           │         │
           │         ▼
           │   _format_docs_for_context(docs) ──► context string
           │
           ├─► passthrough question string
           │
           ▼
      RAG_PROMPT(context, question)
           │
           ▼
      ChatGroq (streaming=True)
           │
           ▼
      StrOutputParser() ──► streamed string tokens
    """
    retriever = get_multi_query_retriever()
    llm = get_llm(streaming=True)

    # Wrap our custom retriever in RunnableLambda so LCEL can pipe into it
    retrieve_and_format = RunnableLambda(
        lambda inputs: _format_docs_for_context(
            retriever.invoke(inputs["question"])
        )
    )

    chain = (
        RunnableParallel(
            context=retrieve_and_format,
            question=itemgetter("question") | RunnableLambda(lambda x: x),
        )
        | RAG_PROMPT
        | llm
        | StrOutputParser()
    )

    return chain


def build_rag_chain_with_sources():
    """
    Returns (answer_chain, retriever) tuple.
    The Flask /chat route uses the retriever to fetch sources first,
    then streams the answer chain separately.
    """
    retriever = get_multi_query_retriever()
    llm = get_llm(streaming=True)

    retrieve_and_format = RunnableLambda(
        lambda inputs: _format_docs_for_context(
            retriever.invoke(inputs["question"])
        )
    )

    chain = (
        RunnableParallel(
            context=retrieve_and_format,
            question=itemgetter("question") | RunnableLambda(lambda x: x),
        )
        | RAG_PROMPT
        | llm
        | StrOutputParser()
    )

    return chain, retriever


# ── Retrieval utility (for the Flask route) ───────────────────────────────────

def retrieve_sources(question: str) -> list[dict]:
    """
    Runs only the retrieval step and returns serialized source metadata.
    Called by the Flask /chat route before starting the answer stream,
    so sources can be sent at the end of the SSE response.
    """
    try:
        retriever = get_multi_query_retriever()
        docs = retriever.invoke(question)
        sources = _serialize_source_metadata(docs)
        logger.info(
            "Sources retrieved",
            extra={"question": question[:80], "source_count": len(sources)},
        )
        return sources
    except Exception as exc:
        logger.error(
            "Source retrieval failed",
            extra={"error": str(exc)},
            exc_info=True,
        )
        raise