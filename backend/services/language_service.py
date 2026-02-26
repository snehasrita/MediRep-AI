"""
Multi-language support for Indian languages.
Handles language detection and response instructions.
"""
import re
import logging

logger = logging.getLogger(__name__)

# Supported Indian languages with BCP-47 codes for Web Speech API
SUPPORTED_LANGUAGES = {
    "en": {"name": "English", "bcp47": "en-IN", "native": "English"},
    "hi": {"name": "Hindi", "bcp47": "hi-IN", "native": "हिन्दी"},
    "ta": {"name": "Tamil", "bcp47": "ta-IN", "native": "தமிழ்"},
    "te": {"name": "Telugu", "bcp47": "te-IN", "native": "తెలుగు"},
    "bn": {"name": "Bengali", "bcp47": "bn-IN", "native": "বাংলা"},
    "mr": {"name": "Marathi", "bcp47": "mr-IN", "native": "मराठी"},
    "gu": {"name": "Gujarati", "bcp47": "gu-IN", "native": "ગુજરાતી"},
    "pa": {"name": "Punjabi", "bcp47": "pa-IN", "native": "ਪੰਜਾਬੀ"},
    "kn": {"name": "Kannada", "bcp47": "kn-IN", "native": "ಕನ್ನಡ"},
    "ml": {"name": "Malayalam", "bcp47": "ml-IN", "native": "മലയാളം"},
    "or": {"name": "Odia", "bcp47": "or-IN", "native": "ଓଡ଼ିଆ"},
    "as": {"name": "Assamese", "bcp47": "as-IN", "native": "অসমীয়া"},
    "ur": {"name": "Urdu", "bcp47": "ur-IN", "native": "اردو"},
}

# Unicode ranges for script detection
SCRIPT_RANGES = {
    "hi": (0x0900, 0x097F),  # Devanagari (Hindi, Marathi, Sanskrit)
    "mr": (0x0900, 0x097F),  # Devanagari
    "ta": (0x0B80, 0x0BFF),  # Tamil
    "te": (0x0C00, 0x0C7F),  # Telugu
    "bn": (0x0980, 0x09FF),  # Bengali
    "gu": (0x0A80, 0x0AFF),  # Gujarati
    "pa": (0x0A00, 0x0A7F),  # Gurmukhi (Punjabi)
    "kn": (0x0C80, 0x0CFF),  # Kannada
    "ml": (0x0D00, 0x0D7F),  # Malayalam
    "or": (0x0B00, 0x0B7F),  # Odia
    "as": (0x0980, 0x09FF),  # Bengali script (also used for Assamese)
    "ur": (0x0600, 0x06FF),  # Arabic (Urdu uses Nastaliq Arabic script)
}


def detect_language(text: str) -> str:
    """
    Detect language from text using Unicode script detection.
    Returns language code (e.g., 'hi', 'ta', 'en').

    This is fast and works offline - no API calls needed.
    """
    if not text:
        return "en"

    # Count characters in each script
    script_counts = {lang: 0 for lang in SCRIPT_RANGES}
    latin_count = 0
    total_alpha = 0

    for char in text:
        code_point = ord(char)

        # Check if Latin (English)
        if (0x0041 <= code_point <= 0x007A) or (0x00C0 <= code_point <= 0x00FF):
            latin_count += 1
            total_alpha += 1
            continue

        # Check each Indian script
        for lang, (start, end) in SCRIPT_RANGES.items():
            if start <= code_point <= end:
                script_counts[lang] += 1
                total_alpha += 1
                break

    if total_alpha == 0:
        return "en"

    # Find dominant script
    max_script = max(script_counts, key=script_counts.get)
    max_count = script_counts[max_script]

    # If more than 30% is Indic script, use that language
    if max_count > 0 and (max_count / total_alpha) > 0.3:
        # Special case: Devanagari could be Hindi or Marathi
        # Default to Hindi as it's more common
        if max_script == "mr":
            max_script = "hi"
        return max_script

    # Default to English
    return "en"


def get_language_instruction(language: str) -> str:
    """
    Generate language instruction to append to the prompt.
    This is appended to user message, NOT changing the system prompt.
    """
    if language == "en" or language not in SUPPORTED_LANGUAGES:
        return ""  # No instruction needed for English

    lang_info = SUPPORTED_LANGUAGES[language]

    return f"""

[LANGUAGE INSTRUCTION]
The user is communicating in {lang_info['name']} ({lang_info['native']}).
- Respond ENTIRELY in {lang_info['name']}.
- Keep medical terms in English for clarity, but explain them in {lang_info['name']}.
- Match the user's tone and formality level.
- If user mixes languages (like Hinglish), you may respond similarly."""


def is_language_supported_by_groq(language: str) -> bool:
    """
    Check if Groq (gpt-oss-120b) can handle this language well.
    Based on user reports, Groq has poor multi-language support.
    Only English is reliable.
    """
    return language == "en"


def get_supported_languages_list() -> list:
    """Return list of supported languages for frontend."""
    return [
        {"code": code, "name": info["name"], "native": info["native"], "bcp47": info["bcp47"]}
        for code, info in SUPPORTED_LANGUAGES.items()
    ]
