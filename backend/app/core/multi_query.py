# app/core/multi_query.py  — only create this if Steps 1 and 2 both fail
import logging
from langchain_core.documents import Document
from langchain_core.retrievers import BaseRetriever
from langchain_core.language_models import BaseChatModel
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser

logger = logging.getLogger(__name__)

REWRITE_PROMPT = PromptTemplate.from_template(
    "You are an AI assistant. Generate exactly 3 different rephrasings of "
    "the following question to improve document retrieval. "
    "Output ONLY the 3 questions, one per line, no numbering, no extra text.\n\n"
    "Original question: {question}"
)


class SimpleMultiQueryRetriever:
    """
    Lightweight MultiQueryRetriever replacement.
    Uses the LLM to rewrite the query into 3 variants,
    retrieves docs for each, deduplicates by page_content hash.
    """

    def __init__(self, retriever: BaseRetriever, llm: BaseChatModel):
        self.retriever = retriever
        self.rewrite_chain = REWRITE_PROMPT | llm | StrOutputParser()

    def invoke(self, question: str) -> list[Document]:
        # Generate query variants
        try:
            raw = self.rewrite_chain.invoke({"question": question})
            variants = [q.strip() for q in raw.strip().split("\n") if q.strip()]
            logger.info("Query variants generated", extra={"variants": variants})
        except Exception as exc:
            logger.warning("Query rewrite failed, using original only: %s", exc)
            variants = []

        # Always include original
        all_queries = [question] + variants[:3]

        # Retrieve and deduplicate
        seen = set()
        all_docs = []
        for query in all_queries:
            try:
                docs = self.retriever.invoke(query)
                for doc in docs:
                    key = hash(doc.page_content[:200])
                    if key not in seen:
                        seen.add(key)
                        all_docs.append(doc)
            except Exception as exc:
                logger.warning("Retrieval failed for variant '%s': %s", query, exc)

        logger.info("MultiQuery retrieved %d unique docs", len(all_docs))
        return all_docs