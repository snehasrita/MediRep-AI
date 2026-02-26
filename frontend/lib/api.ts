import {
  PatientContext,
  Message,
  ChatResponse,
  SessionSummary,
  DrugInfo,
  RepModeContext,
  SessionShareLink,
  SharedSessionDetail,
  SharedSessionContinueResponse,
} from "@/types";
import { createClient } from "@/lib/supabase/client";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "https://medirep-ai-production.up.railway.app").replace(/\/+$/, "");

/**
 * Get authentication headers with the current user's access token
 */
async function getAuthHeaders(includeJsonContentType: boolean = true): Promise<HeadersInit> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: HeadersInit = {};
  if (includeJsonContentType) {
    headers["Content-Type"] = "application/json";
  }

  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }

  return headers;
}

/**
 * Handle API response errors consistently
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    if (response.status === 401) {
      // Token expired or invalid - trigger re-auth
      const supabase = createClient();
      await supabase.auth.refreshSession();
      throw new Error("Session expired. Please try again.");
    }

    if (response.status === 403) {
      throw new Error("You don't have permission to access this resource.");
    }

    if (response.status === 429) {
      throw new Error("Too many requests. Please wait a moment and try again.");
    }

    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.detail || `Request failed: ${response.statusText}`,
    );
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

/**
 * Authenticated fetch wrapper
 */
async function authFetch<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = await getAuthHeaders();

  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  });

  return handleResponse<T>(response);
}

/**
 * Public fetch wrapper for endpoints that don't require auth.
 */
async function publicFetch<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, options);
  return handleResponse<T>(response);
}

export async function sendMessage(
  message: string,
  patientContext?: PatientContext,
  history?: Message[],
  sessionId?: string,
  webSearchMode: boolean = false,
  images?: string[],
  signal?: AbortSignal,
  voiceMode?: boolean,
  chatMode?: string
): Promise<ChatResponse> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      message,
      patient_context: patientContext,
      history: [], // Backend uses DB history now; sending empty to save bandwidth
      session_id: sessionId,
      web_search_mode: webSearchMode,
      images: images || [],
      voice_mode: voiceMode || false,
      chat_mode: chatMode || "normal",
    }),
    signal, // AbortController signal for cancellation
  });

  return handleResponse<ChatResponse>(response);
}

export async function transcribeVoiceAudio(
  audioBlob: Blob,
  language: string = "auto"
): Promise<string> {
  const headers = await getAuthHeaders(false);
  const formData = new FormData();
  const fileType = audioBlob.type || "audio/webm";
  const extension = fileType.includes("mp4")
    ? "mp4"
    : fileType.includes("ogg")
      ? "ogg"
      : fileType.includes("wav")
        ? "wav"
        : "webm";

  formData.append("file", audioBlob, `voice_input.${extension}`);
  formData.append("language", language);

  const response = await fetch(`${API_URL}/api/voice/transcribe`, {
    method: "POST",
    headers,
    body: formData,
  });

  const data = await handleResponse<{ text: string }>(response);
  return (data.text || "").trim();
}

export async function synthesizeVoiceAudio(
  text: string,
  responseFormat: "wav" | "mp3" = "wav"
): Promise<Blob> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/voice/tts`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      text,
      response_format: responseFormat,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `TTS failed: ${response.statusText}`);
  }

  return response.blob();
}

export async function searchDrugs(query: string) {
  const encodedQuery = encodeURIComponent(query);
  return authFetch(`${API_URL}/api/drugs/search?q=${encodedQuery}`);
}

export async function getDrugInfo(drugName: string) {
  const encodedName = encodeURIComponent(drugName);
  return authFetch<DrugInfo>(`${API_URL}/api/drugs/${encodedName}`);
}

export async function checkInteractions(drugs: string[], patientContext?: any) {
  return authFetch(`${API_URL}/api/drugs/interactions`, {
    method: "POST",
    body: JSON.stringify({ drugs, patient_context: patientContext }),
  });
}

// === Enhanced Drug Interaction with AUC Mathematics ===
export async function getEnhancedInteraction(
  drug1: string,
  drug2: string,
  patientContext?: any
) {
  return authFetch(`${API_URL}/api/drugs/interactions/enhanced`, {
    method: "POST",
    body: JSON.stringify({
      drug1,
      drug2,
      patient_context: patientContext,
    }),
  });
}
// =====================================================

// === NEW: Reaction Image Generation API ===
export interface ReactionImageRequest {
  drug1: string;
  drug2: string;
  drug1_formula?: string;
  drug2_formula?: string;
  mechanism?: string;
}

export interface ReactionImageResponse {
  url?: string;
  error?: string;
}

export async function generateReactionImage(
  request: ReactionImageRequest
): Promise<ReactionImageResponse> {
  try {
    const response = await authFetch<ReactionImageResponse>(`${API_URL}/api/drugs/reaction-image`, {
      method: "POST",
      body: JSON.stringify(request),
    });
    return response;
  } catch (error) {
    console.error("Failed to generate reaction image:", error);
    return { error: String(error) };
  }
}
// ==========================================

// === NEW: Price Compare API ===
export async function comparePrices(drugName: string) {
  const encoded = encodeURIComponent(drugName);
  return authFetch(`${API_URL}/api/prices/compare?drug_name=${encoded}`);
}
// =============================

// === NEW: User Profile API ===
export async function getPatientContext() {
  return authFetch<any>(`${API_URL}/api/user/profile/context`);
}

export async function savePatientContext(context: any) {
  return authFetch(`${API_URL}/api/user/profile/context`, {
    method: "POST",
    body: JSON.stringify(context),
  });
}
// =============================

// === NEW: Saved Drugs API ===
export async function getSavedDrugs() {
  return authFetch<any[]>(`${API_URL}/api/drugs/saved`);
}

export async function saveDrug(drugName: string, notes?: string) {
  return authFetch(`${API_URL}/api/drugs/saved`, {
    method: "POST",
    body: JSON.stringify({ drug_name: drugName, notes }),
  });
}
// =============================

export async function identifyPill(imageFile: File) {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const formData = new FormData();
  formData.append("image", imageFile);

  const headers: HeadersInit = {};
  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }

  const response = await fetch(`${API_URL}/api/vision/identify-pill`, {
    method: "POST",
    headers,
    body: formData,
  });

  return handleResponse(response);
}



export async function getSessionMessages(sessionId: string): Promise<Message[]> {
  const messages = await authFetch<any[]>(`${API_URL}/api/sessions/${sessionId}/messages`);
  // Transform backend messages to frontend format if needed
  return messages.map(msg => ({
    role: msg.role,
    content: msg.content,
    timestamp: msg.created_at || new Date().toISOString()
  }));
}

export async function getUserSessions(limit = 20, offset = 0): Promise<SessionSummary[]> {
  return authFetch<SessionSummary[]>(`${API_URL}/api/sessions?limit=${limit}&offset=${offset}`);
}

export async function createSessionShareLink(sessionId: string): Promise<SessionShareLink> {
  return authFetch<SessionShareLink>(`${API_URL}/api/sessions/${sessionId}/share`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function getSharedSession(shareToken: string): Promise<SharedSessionDetail> {
  const data = await publicFetch<SharedSessionDetail>(`${API_URL}/api/sessions/shared/${encodeURIComponent(shareToken)}`);

  // Normalize timestamp shape for existing chat components.
  return {
    ...data,
    messages: (data.messages || []).map((msg) => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.created_at || msg.timestamp || new Date().toISOString(),
    })),
  };
}

export async function continueSharedSession(shareToken: string): Promise<SharedSessionContinueResponse> {
  return authFetch<SharedSessionContinueResponse>(`${API_URL}/api/sessions/shared/${encodeURIComponent(shareToken)}/continue`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function deleteSession(sessionId: string) {
  return authFetch(`${API_URL}/api/sessions/${sessionId}`, {
    method: "DELETE",
  });
}

export async function renameSession(sessionId: string, title: string) {
  return authFetch(`${API_URL}/api/sessions/${sessionId}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

export async function getRepModeStatus(): Promise<RepModeContext> {
  try {
    return await authFetch<RepModeContext>(`${API_URL}/api/user/rep-mode`);
  } catch (error) {
    // Non-critical endpoint: fail closed to "inactive" so chat UI still works.
    console.warn("Rep mode status unavailable, defaulting to inactive:", error);
    return { active: false };
  }
}

export async function clearRepModeStatus(): Promise<{ success: boolean; message?: string }> {
  return authFetch<{ success: boolean; message?: string }>(`${API_URL}/api/user/rep-mode/clear`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function getAvailableCompanies(): Promise<{ companies: { key: string; name: string; focus: string }[] }> {
  return authFetch<{ companies: { key: string; name: string; focus: string }[] }>(`${API_URL}/api/user/rep-mode/companies`);
}

export async function setRepModeStatus(company: string): Promise<RepModeContext> {
  return authFetch<RepModeContext>(`${API_URL}/api/user/rep-mode/set`, {
    method: "POST",
    body: JSON.stringify({ company }),
  });
}

/**
 * Check if the current user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return !!session;
}

/**
 * Get current user's access token
 */
export async function getAccessToken(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || null;
}

// NOTE: Speech-to-text is now handled client-side via Web Speech API
// See: components/ai-prompt-box.tsx (no server roundtrip needed)

export async function analyzePatientText(text: string): Promise<PatientContext> {
  return authFetch<PatientContext>(`${API_URL}/api/context/analyze`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}
