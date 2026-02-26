# MediRep AI Frontend 💊

Modern, responsiveness-first frontend for MediRep AI - your AI-powered digital medical representative. Built with **Next.js 16 (App Router)**, **React 19**, and **Tailwind CSS 4**.

## 🚀 Key Features

### 🖥️ "Clinical Speed" Interface
- **Visual Design**: "Paper & Ink" aesthetic with premium typography (Inter/Playfair Display).
- **Animations**: Fluid transitions using **Framer Motion** and scroll-linked effects with **GSAP**.
- **Responsive**: Mobile-first design optimized for tablets and desktops.

### 💬 Advanced Chat Console
- **Strict Modes**: Toggle between **Normal**, **Insurance**, **MOA**, and **Rep Mode**.
- **Dynamic Suggestions**: Context-aware prompts based on the current mode (e.g., "Check PMJAY rates" in Insurance mode).
- **Pharma Rep Dashboard**: Company-specific context loading (`rep:company_name`) to simulate brand detailing.
- **Voice Interface**: Real-time speech visualization and interaction via backend voice APIs (Groq STT/TTS, Gemini fallback).

### 📊 Clinical Dashboard
- **Patient Statistics**: Visual overview of patient demographics and vitals.
- **Drug Intelligence**: 
    - **Search**: Instant access to 250k+ Indian medicines.
    - **Interactions**: Force-directed graph visualization of drug-drug interactions.
    - **Pill ID**: Camera-based identification.
- **Pharmacist Portal**: Dedicated workspace for verified pharmacists to manage consultations.

## 🛠️ Tech Stack

- **Core**: Next.js 16, React 19, TypeScript 5
- **Styling**: Tailwind CSS 4, Shadcn/ui (Radix Primitives)
- **State Management**: React Hooks (`useChat`, `useProfile`)
- **Data Fetching**: SWR / Native Fetch
- **Auth**: Supabase Auth Helpers
- **Visuals**: Lucide Icons, Recharts (Graphs), D3.js (Force Graph)

## 📂 Project Structure

```
frontend/
├── app/
│   ├── auth/                 # Login/Signup (Supabase Auth)
│   ├── dashboard/            # Main Application Shell
│   │   ├── Chat/             # Chat Console & Mode Logic
│   │   ├── Pharmacist/       # Pharmacist-specific views
│   │   └── ...
│   ├── layout.tsx            # Global Providers (Theme, Auth, Toast)
│   └── page.tsx              # Landing Page v2
├── components/
│   ├── dashboard/            # Specialized Widgets (Vitals, Trends)
│   ├── ui/                   # Reusable Shadcn Components
│   ├── landing/              # Marketing Page Sections
│   └── visualization/        # Interaction Graphs
├── hooks/
│   ├── useChat.ts            # Chat State & API Integration
│   ├── useVoice.ts           # Audio Recording & Processing
│   └── useProfile.ts         # User Context
├── lib/
│   ├── api.ts                # Backend API Client
│   └── supabase/             # DB Clients
└── public/                   # Static Assets
```

## 🚀 Getting Started

### 1. Installation

```bash
cd frontend
npm install
```

### 2. Configuration

Create `.env.local`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

# Backend API
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 3. Run Development Server

```bash
npm run dev
# Open http://localhost:3000
```

## 🎨 Theme & Customization

The app uses a custom Tailwind theme defined in `index.css`:
- **Colors**: Semantic tokens (primary, destructive, muted) support dark/light modes.
- **Typography**: Optimized font stack for readability in clinical settings.

## 📄 License

MIT
