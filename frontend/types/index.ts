export interface PatientContext {
  age: number;
  sex: "male" | "female" | "other";
  weight?: number;
  preExistingDiseases: string[];
  currentMeds: string[];
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  timestamp: string;
  track2?: Track2Data;
  images?: string[];
}

export interface Citation {
  source: string;
  title: string;
  url: string;
}

export interface DrugInteraction {
  drug1: string;
  drug2: string;
  severity: "major" | "moderate" | "minor";
  description: string;
  recommendation?: string;
}

// Enhanced Drug Interaction Types (AUC-based Mathematics)
export interface DrugChemistry {
  name: string;
  formula: string;  // e.g., "C9H8O4"
  formula_display: string;  // Unicode subscript: "C₉H₈O₄"
  smiles: string;
  molecular_weight: number;
  metabolism: string;
}

export interface InteractionMathematics {
  auc_ratio_r: number;
  inhibitor_concentration_um: number;
  ki_value_um: number;
  formula: string;
  calculation: string;
  severity: "none" | "minor" | "moderate" | "major";
  mechanism: string;
  affected_enzyme: string;
}

export interface MetabolicPathway {
  victim_normal: string;
  victim_inhibited: string;
  result: string;
  affected_metabolite_name?: string;
  affected_metabolite_formula?: string;
  affected_metabolite_smiles?: string;
}

export interface ReactionImage {
  url: string;
  prompt: string;
  generated_at?: string;
}

export interface ClinicalImpact {
  description: string;
  recommendation: string;
  severity: string;
}

export interface EnhancedInteraction {
  victim_drug: DrugChemistry;
  perpetrator_drug: DrugChemistry;
  interaction_mathematics: InteractionMathematics;
  metabolic_pathway: MetabolicPathway;
  clinical_impact: ClinicalImpact;
  reaction_image?: ReactionImage;
}

export interface DrugInfo {
  name: string;
  generic_name?: string;
  manufacturer?: string;
  price_raw?: string;
  pack_size?: string;
  indications?: string[];
  dosage?: string[];
  warnings?: string[];
  contraindications?: string[];
  side_effects?: string[];
  interactions?: string[];
  substitutes?: string[];
  therapeutic_class?: string;
  action_class?: string;
  formula?: string;
  smiles?: string;
}

export interface PillIdentification {
  name: string;
  confidence: number;
  description: string;
  color?: string;
  shape?: string;
  imprint?: string;
}



export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

// ============================================================================
// TRACK 2 TYPES (Digital Medical Representative)
// ============================================================================

export interface InsuranceProcedureMatch {
  package_code: string;
  procedure_name: string;
  rate_inr: number;
  rate_display: string;
  category?: string;
  sub_category?: string;
  includes_implants: boolean;
  special_conditions?: string;
  data_source?: string;
}

export interface InsuranceSchemeInfo {
  scheme_code: string;
  scheme_name: string;
  source_url?: string;
  last_verified_at?: string;
}

export interface InsuranceContext {
  query?: string;
  scheme?: InsuranceSchemeInfo;
  matched_procedure?: InsuranceProcedureMatch;
  other_matches: InsuranceProcedureMatch[];
  no_match_reason?: string;
  note?: string;
}

export interface MoAContext {
  drug_name: string;
  mechanism?: string;
  drug_class?: string;
  pharmacodynamics?: string;
  targets: string[];
  pathway_equation?: string;
  sources: string[];
}

export interface CompareAlternative {
  name: string;
  generic_name?: string;
  therapeutic_class?: string;
  price_raw?: string;
}

export interface CompareContext {
  drug_name: string;
  therapeutic_class?: string;
  alternatives: CompareAlternative[];
  comparison_factors: string[];
  sources: string[];
}

export interface RepModeContext {
  active: boolean;
  company_key?: string;
  company_name?: string;
  company_id?: string;
}

export interface Track2Data {
  insurance?: InsuranceContext;
  moa?: MoAContext;
  compare?: CompareContext;
  rep_mode?: RepModeContext;
  needs_web_search?: boolean;
  web_search_query?: string;
}

export interface ChatResponse {
  response: string;
  citations?: Citation[];
  suggestions?: string[];
  session_id: string;
  web_sources?: WebSearchResult[];
  track2?: Track2Data;
}

export interface SessionSummary {
  id: string;
  title: string;
  message_count: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  last_message_at: string;
}

export interface SessionShareLink {
  session_id: string;
  share_token: string;
  share_path: string;
  created_at?: string;
}

export interface SharedSessionMessage {
  role: "user" | "assistant";
  content: string;
  created_at?: string;
  timestamp?: string;
}

export interface SharedSessionDetail {
  share_token: string;
  title: string;
  message_count: number;
  created_at: string;
  updated_at: string;
  last_message_at: string;
  messages: SharedSessionMessage[];
  is_view_only: boolean;
  can_continue: boolean;
}

export interface SharedSessionContinueResponse {
  session_id: string;
  title: string;
  message_count: number;
}
