import re
from dataclasses import dataclass
from typing import Literal


PolicyAction = Literal["allow", "refuse", "triage"]


@dataclass(frozen=True)
class PolicyDecision:
    action: PolicyAction
    response_override: str = ""
    extra_instructions: str = ""
    reason: str = ""


class PolicyService:
    """
    Lightweight safety layer.

    This is intentionally heuristic (fast + deterministic). For higher accuracy
    we can add a secondary LLM-based classifier later, but this keeps the core
    assistant safe even when the LLM drifts.
    """

    _EMERGENCY_PATTERNS = [
        r"\b(chest pain|pressure in chest)\b",
        r"\b(can't breathe|cannot breathe|difficulty breathing|shortness of breath)\b",
        r"\b(unconscious|passed out|faint(ed|ing))\b",
        r"\b(seizure|convulsion)\b",
        r"\b(stroke|face droop|slurred speech|one[- ]sided weakness|sudden weakness)\b",
        r"\b(anaphylaxis|severe allergic reaction)\b",
        r"\b(swelling (of )?(face|lips|tongue)|throat swelling)\b",
        r"\b(overdose|took too much|poison(ing)?)\b",
        r"\b(severe bleeding|vomiting blood|blood in stool|black tarry stool)\b",
    ]

    _REFUSAL_PATTERNS = [
        r"\b(how to (make|cook|synthesize|extract))\b",
        r"\b(without (a )?(prescription|rx))\b",
        r"\b(fake (a )?(prescription|rx))\b",
        r"\b(get high|recreational|abuse)\b",
        r"\b(sell|traffic|ship)\b.*\b(opioid|oxycodone|fentanyl|morphine|codeine|hydrocodone|tramadol)\b",
        r"\b(self[- ]harm|suicide|kill myself)\b",
    ]

    def evaluate(self, message: str) -> PolicyDecision:
        text = (message or "").strip()
        if not text:
            return PolicyDecision(action="allow")

        lowered = text.lower()

        for pat in self._REFUSAL_PATTERNS:
            if re.search(pat, lowered):
                return PolicyDecision(
                    action="refuse",
                    response_override=(
                        "I can’t help with that. If you’re asking about medication safety or legitimate use, "
                        "tell me the drug name, dose, route, and your clinical context, and I can help with "
                        "general, safety-focused information."
                    ),
                    reason="refusal_pattern",
                )

        for pat in self._EMERGENCY_PATTERNS:
            if re.search(pat, lowered):
                return PolicyDecision(
                    action="triage",
                    response_override=(
                        "Important: this may be an emergency. Please seek urgent medical care now "
                        "(local emergency services/ER) or contact a clinician immediately. "
                        "If you can share age, key symptoms, current meds, allergies, and timing, "
                        "I can provide general, non‑emergency guidance while you seek care."
                    ),
                    reason="emergency_pattern",
                )

        return PolicyDecision(
            action="allow",
            extra_instructions=(
                "Safety rules:\n"
                "- Add a brief 'not a substitute for clinical judgment' disclaimer when giving patient-specific advice.\n"
                "- If user asks for dosing changes, emphasize verification against local guidelines/labeling.\n"
                "- Avoid definitive diagnosis; recommend escalation when red flags appear.\n"
            ),
        )


policy_service = PolicyService()

