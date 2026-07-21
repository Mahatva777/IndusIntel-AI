"""Minimal Knowledge Retriever for Incident Pattern Intelligence (risk_engine/rag.py).

Intentionally minimal for a hackathon deadline. Provides a naive TF-IDF / substring
scorer (acting as a stand-in for BM25/Vector DB) over a small, static corpus of 
incident records and regulatory excerpts.

This module is dependency-light and can be run without network access, matching the
style of the rest of the risk_engine.
"""

import csv
import math
from collections import Counter
from pathlib import Path

_DATA_ROOT = Path(__file__).resolve().parent.parent / "data"

# Hardcoded near-miss / regulation excerpts (Placeholders)
_STATIC_CORPUS = [
    "[OISD-STD-116] Fire Protection Facilities for Petroleum Refineries. "
    "Mandates continuous gas monitoring for confined space entry.",
    
    "[OISD-GDN-192] Safety Practices during Construction and Pre-commissioning. "
    "Requires stringent monitoring of decanter levels and differential pressure to avoid tar carryover.",
    
    "[OISD-137] Inspection of Electrical Equipment. "
    "Electrical equipment in hazardous zones must be flame-proof.",
    
    "[Near-Miss 2023-08] Hot work permit issued near valve gallery while H2S levels "
    "were fluctuating. Work was stopped by operator. Recommendation: strict overlap checking."
]

def _load_incidents() -> list[str]:
    """Load historical incidents from CSV, if available."""
    incident_path = _DATA_ROOT / "incidents.csv"
    incidents = []
    if incident_path.exists():
        try:
            with open(incident_path, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    text = (
                        f"[Historical Incident {row.get('incident_id', 'UNKNOWN')}] "
                        f"Cause: {row.get('root_cause', '')}. "
                        f"Gas: {row.get('gas', '')}. "
                        f"Recommendation: {row.get('recommendation', '')}. "
                        f"Ref: {row.get('oisd_reference', '')}"
                    )
                    incidents.append(text)
        except Exception:
            pass  # Fail gracefully if CSV is malformed
    return incidents

def _tokenize(text: str) -> list[str]:
    """Simple tokenizer for naive scoring."""
    return [w.strip(".,;:()[]{}!") for w in text.lower().split() if len(w) > 2]

class KnowledgeRetriever:
    """Retrieves relevant safety knowledge for a given query."""
    
    def __init__(self):
        self._corpus: list[str] = _STATIC_CORPUS + _load_incidents()
        self._tokenized_corpus = [_tokenize(doc) for doc in self._corpus]
        
        # Precompute IDF (Inverse Document Frequency)
        self._doc_count = len(self._corpus)
        df: Counter = Counter()
        for doc_tokens in self._tokenized_corpus:
            df.update(set(doc_tokens))
        
        self._idf: dict[str, float] = {
            term: math.log(1 + (self._doc_count - count + 0.5) / (count + 0.5))
            for term, count in df.items()
        }

    def retrieve(self, query: str, top_k: int = 2) -> tuple[str, ...]:
        """Score query against the corpus using naive BM25-like TF-IDF."""
        query_tokens = _tokenize(query)
        if not query_tokens:
            return ()
            
        scores = []
        for i, doc_tokens in enumerate(self._tokenized_corpus):
            if not doc_tokens:
                scores.append((0.0, self._corpus[i]))
                continue
                
            doc_tf = Counter(doc_tokens)
            doc_len = len(doc_tokens)
            
            score = 0.0
            for qt in query_tokens:
                if qt in doc_tf:
                    # Simplified BM25-like term frequency scoring
                    tf = doc_tf[qt] / doc_len
                    idf = self._idf.get(qt, 0.0)
                    score += tf * idf
                    
            scores.append((score, self._corpus[i]))
            
        # Sort by score descending
        scores.sort(key=lambda x: x[0], reverse=True)
        
        # Return top_k docs that have a non-zero score
        results = [doc for score, doc in scores if score > 0.0][:top_k]
        return tuple(results)
