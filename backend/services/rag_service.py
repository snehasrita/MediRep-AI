"""
RAG Service - Hybrid retrieval using Qdrant + Turso.

Architecture:
- Qdrant Collections:
  - drug_embeddings: Drug vectors (384 dims) linked to Turso
  - medical_qa: MedQuAD Q&A vectors (47k NIH pairs)
- Turso: Drug structured data (curated dataset)

Hybrid Reranking:
- Drug queries (price, dosage, info) → Boost drug_embeddings
- Medical queries (symptoms, diagnosis) → Boost medical_qa
"""
import asyncio
import logging
from typing import List, Optional, Literal

from services import qdrant_service, turso_service

logger = logging.getLogger(__name__)

# Intent-based weights for hybrid reranking
INTENT_WEIGHTS = {
    "INFO": {"drug": 0.8, "qa": 0.2},
    "SUBSTITUTE": {"drug": 0.9, "qa": 0.1},
    "INTERACTION": {"drug": 0.6, "qa": 0.4},
    "GENERAL": {"drug": 0.4, "qa": 0.6},
    "SYMPTOM": {"drug": 0.3, "qa": 0.7},
}


class RAGService:
    """Retrieval-Augmented Generation service using Qdrant + Turso."""

    async def search_hybrid(
        self,
        query: str,
        intent: str = "GENERAL",
        top_k: int = 5
    ) -> str:
        """
        Hybrid search combining drug embeddings and medical QA.

        Args:
            query: User query
            intent: One of INFO, SUBSTITUTE, INTERACTION, GENERAL, SYMPTOM
            top_k: Number of results per collection

        Returns:
            Formatted context string for LLM
        """
        if not query or not query.strip():
            return ""

        weights = INTENT_WEIGHTS.get(intent, INTENT_WEIGHTS["GENERAL"])
        context_parts = []

        try:
            # Compute embedding once, reuse for both collections.
            query_embedding = await asyncio.to_thread(
                lambda: (qdrant_service.get_embedding_model().encode(query).tolist())
                if qdrant_service.get_embedding_model()
                else None
            )

            if not query_embedding:
                return ""

            # Parallel search in both collections using precomputed embedding
            drug_task = asyncio.to_thread(
                qdrant_service.search_similar_with_embedding, query_embedding, top_k
            )
            qa_task = asyncio.to_thread(
                qdrant_service.search_medical_qa_with_embedding, query_embedding, top_k
            )

            drug_results, qa_results = await asyncio.gather(drug_task, qa_task, return_exceptions=True)

            # Handle exceptions gracefully
            if isinstance(drug_results, Exception):
                logger.warning("Drug search failed: %s", drug_results)
                drug_results = []
            if isinstance(qa_results, Exception):
                logger.warning("QA search failed: %s", qa_results)
                qa_results = []

            # Process drug results
            if drug_results and weights["drug"] > 0:
                drug_context = await self._format_drug_results(drug_results, weights["drug"])
                if drug_context:
                    context_parts.append(drug_context)

            # Process medical QA results
            if qa_results and weights["qa"] > 0:
                qa_context = self._format_qa_results(qa_results, weights["qa"])
                if qa_context:
                    context_parts.append(qa_context)

            if context_parts:
                return "\n\n".join(context_parts)

            return ""

        except Exception as e:
            logger.error("Hybrid search failed: %s", e)
            return ""

    async def _format_drug_results(
        self,
        results: list,
        weight: float
    ) -> str:
        """Format drug search results with Turso data."""
        if not results:
            return ""

        context_parts = []
        for result in results:
            drug_name = result.get("drug_name", "")
            score = result.get("score", 0) * weight

            if not drug_name or score < 0.3:
                continue

            # Get detailed info from Turso
            drug_data = await asyncio.to_thread(
                turso_service.get_drug_by_name, drug_name
            )

            if drug_data:
                info_parts = [f"Drug: {drug_data.get('name', drug_name)}"]
                if drug_data.get('generic_name'):
                    info_parts.append(f"Generic: {drug_data['generic_name']}")
                if drug_data.get('price_raw'):
                    info_parts.append(f"Price: {drug_data['price_raw']}")
                if drug_data.get('therapeutic_class'):
                    info_parts.append(f"Class: {drug_data['therapeutic_class']}")
                context_parts.append(" | ".join(info_parts))
            else:
                context_parts.append(f"Drug: {drug_name}")

        if context_parts:
            return "[Drug Database]\n" + "\n".join(context_parts[:5])
        return ""

    def _format_qa_results(self, results: list, weight: float) -> str:
        """Format medical QA results."""
        if not results:
            return ""

        context_parts = []
        for result in results:
            question = result.get("question", "")
            answer = result.get("answer", "")
            score = result.get("score", 0) * weight

            if not question or not answer or score < 0.3:
                continue

            # Truncate answer for context
            answer_short = answer[:300] + "..." if len(answer) > 300 else answer
            context_parts.append(f"Q: {question}\nA: {answer_short}")

        if context_parts:
            return "[Medical Knowledge (NIH)]\n" + "\n\n".join(context_parts[:3])
        return ""

    async def search_context(self, query: str, top_k: int = 5) -> str:
        """
        Search for relevant drug context using Qdrant semantic search.

        Flow:
        1. Query -> Qdrant (semantic search) -> drug_ids
        2. drug_ids -> Turso (structured data) -> full drug info
        3. Return formatted context for LLM
        """
        if not query or not query.strip():
            return ""

        try:
            # Step 1: Semantic search in Qdrant
            qdrant_results = await asyncio.to_thread(
                qdrant_service.search_similar, query, top_k
            )

            if not qdrant_results:
                logger.info("No Qdrant results for query: %s...", query[:50])
                return ""

            logger.info("Qdrant found %d results for: %s...", len(qdrant_results), query[:50])

            # Step 2: Fetch full drug data from Turso
            context_parts = []

            for result in qdrant_results:
                drug_name = result.get("drug_name", "")
                score = result.get("score", 0)

                if not drug_name:
                    continue

                # Get detailed info from Turso
                drug_data = await asyncio.to_thread(
                    turso_service.get_drug_by_name, drug_name
                )

                if drug_data:
                    # Format drug info for context
                    info_parts = [f"Drug: {drug_data.get('name', drug_name)}"]

                    if drug_data.get('generic_name'):
                        info_parts.append(f"Generic: {drug_data['generic_name']}")
                    if drug_data.get('manufacturer'):
                        info_parts.append(f"Manufacturer: {drug_data['manufacturer']}")
                    if drug_data.get('price_raw'):
                        info_parts.append(f"Price: {drug_data['price_raw']}")
                    if drug_data.get('therapeutic_class'):
                        info_parts.append(f"Class: {drug_data['therapeutic_class']}")
                    if drug_data.get('description'):
                        desc = drug_data['description'][:200]
                        info_parts.append(f"Description: {desc}")
                    if drug_data.get('side_effects'):
                        info_parts.append(f"Side Effects: {drug_data['side_effects'][:150]}")

                    context_parts.append(" | ".join(info_parts))
                else:
                    # Fallback: just use the drug name from Qdrant
                    context_parts.append(f"Drug: {drug_name} (relevance: {score:.2f})")

            if context_parts:
                return "Relevant drugs from database:\n" + "\n".join(context_parts)

            return ""

        except Exception as e:
            logger.error("RAG search failed: %s", e)
            return ""

    async def search_by_description(self, query: str, limit: int = 3) -> str:
        """
        Direct text search in Turso for symptom/description based queries.
        Useful when semantic search doesn't find matches.
        """
        if not query or len(query) < 3:
            return ""

        try:
            # Search drugs by description/therapeutic class in Turso
            results = await asyncio.to_thread(
                turso_service.search_drugs, query, limit
            )

            if not results:
                return ""

            context_parts = []
            for drug in results:
                info = f"Drug: {drug.get('name', 'Unknown')}"
                if drug.get('generic_name'):
                    info += f" ({drug['generic_name']})"
                if drug.get('manufacturer'):
                    info += f" by {drug['manufacturer']}"
                context_parts.append(info)

            if context_parts:
                return "Related drugs: " + ", ".join(context_parts)

            return ""

        except Exception as e:
            logger.warning("Description search failed: %s", e)
            return ""


# Singleton
rag_service = RAGService()
