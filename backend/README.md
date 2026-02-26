# MediRep AI Backend

A powerful medical representative AI backend powered by the **Google Gemini API**. Provides strict-context medical Q&A, drug information, interaction checking, pill identification, and FDA alerts via a RESTful API.

## 🚀 Key Features

| Feature                     | Description                                                                 |
| --------------------------- | --------------------------------------------------------------------------- |
| **💬 Context-Aware Chat**   | Medical Q&A with strict context enforcement (Insurance, MOA, Rep modes)     |
| **🧠 "Rep" Engine**         | Enhanced intent detection pipeline for high-fidelity responses              |
| **💊 Indian Medicines DB**  | Access to 250,000+ Indian brand/generic drugs via **Turso**                 |
| **🔍 Semantic Search (RAG)**| Vector-based retrieval using **Qdrant** for precise medical guidelines      |
| **🎙️ Voice AI**             | Low-latency STT/TTS via **Groq**, with Gemini fallback for transcription     |
| **🏢 Pharma Rep Mode**      | Simulate brand-specific interactions with company portfolio constraints     |
| **⚖️ Comparison Engine**    | Comparative analysis of drugs on price, efficacy, and side effects          |
| **⚠️ Interaction Checker**  | AI-powered drug-drug interaction analysis                                   |
| **📸 Pill Identification**  | Vision AI to identify pills from photos                                     |
| **🌐 Web Search**           | Real-time medical web search integration                                    |

## 📋 Tech Stack

- **Framework**: FastAPI (Python 3.10+)
- **AI Engine**: Google Gemini API (configured via `GEMINI_MODEL`)
- **Primary Data Store**: Supabase (PostgreSQL + pgvector)
- **Specialized DB**: Turso (LibSQL for Indian Medicines)
- **Vector Search**: Qdrant (Local/Cloud)
- **External APIs**: openFDA (labels, enforcement), Tavily (Web Search)

## 🛠️ Setup

### 1. Clone and Install

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Linux/Mac
# Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure Environment

Copy `.env.example` to `.env` and configure the following keys:

**Core AI & Cloud:**
- `GEMINI_API_KEY`: Google AI Studio Key
- `SUPABASE_URL`: Supabase Project URL
- `SUPABASE_KEY`: Supabase Service Role Key

**Databases:**
- `TURSO_DATABASE_URL`: Connection string for Turso DB (Indian Medicines)
- `TURSO_AUTH_TOKEN`: Auth token for Turso
- `QDRANT_URL`: Qdrant instance URL (or leave blank for local mode)
- `QDRANT_API_KEY`: Qdrant API Key

**Server:**
- `PORT`: Server port (default: `8000`)
- `GEMINI_MODEL`: Target Gemini model ID (code default: `gemini-3-flash-preview`)

### 3. Run the Server

```bash
uvicorn main:app --reload --port 8000
```

## 📡 API Endpoints

### 💬 Chat & Context

**POST** `/api/chat`
Strict mode handling for tailored execution.

```json
{
  "message": "Explain the MOA of Ozempic",
  "chat_mode": "moa",          // Options: normal, insurance, moa, rep, rep:pfizer
  "voice_mode": false,
  "web_search_mode": false
}
```

### 💊 Drug Intelligence

- **GET** `/api/drugs/search?q={query}`: Fuzzy search across Indian & FDA databases.
- **GET** `/api/drugs/{name}`: Detailed clinical info.
- **GET** `/api/drugs/substitutes?drug_name={name}`: Find cheaper generic alternatives.
- **POST** `/api/drugs/interactions`: Check interactions between multiple drugs.

### 🏢 Pharma Rep Services

- **GET** `/api/user/rep-mode/companies`: List available pharmaceutical companies.
- **POST** `/api/user/rep-mode/set`: Set user's active company context.

### 🎙️ Voice & Vision

- **POST** `/api/voice/transcribe`: Transcribe audio using Groq (Gemini fallback).
- **POST** `/api/vision/identify-pill`: Identify pill from image.

## 🔐 Strict Mode Enforcement

The backend enforces strict boundaries based on `chat_mode`:

1.  **Insurance Mode**: Rejects clinical queries. Focuses on PMJAY/Ayushman Bharat, package rates, and reimbursement codes.
2.  **MOA Mode**: Rejects insurance/pricing queries. Focuses on molecular mechanisms, pathways, and pharmacodynamics.
3.  **Rep Mode**: Simulates a brand representative.
    - **General**: Promotes generic product benefits.
    - **Company Specific (`rep:company`)**: Strictly adheres to the selected company's portfolio, refusing to promote competitors.

## 📁 Project Structure

```
backend/
├── main.py              # FastAPI app entry
├── routers/             # API Route Handlers
│   ├── chat.py          # Core Chat Logic (Strict Mode Pipeline)
│   ├── drugs.py         # Drug Search & Interactions
│   ├── voice.py         # Voice STT/TTS Integration
│   ├── vision.py        # Pill ID
│   ├── user.py          # Rep Mode & Profile
│   └── ...
├── services/            # Business Logic Layers
│   ├── enhanced_context_service.py # "Track 2" Context Engine
│   ├── moa_service.py              # Mechanism of Action Logic
│   ├── insurance_service.py        # Insurance/PMJAY Logic
│   ├── pharma_rep_service.py       # Rep Mode Logic
│   ├── turso_service.py            # Indian Medicines DB Client
│   ├── qdrant_service.py           # Vector Search Client
│   └── ...
└── services/gemini_service.py      # LLM Integration
```

## 📄 License

MIT

---

**Built with ❤️ for accessible medical intelligence**
