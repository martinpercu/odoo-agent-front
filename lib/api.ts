import type {
  OdooConfig,
  ActionContext,
  ActionResult,
  AggReportOption,
  PinnedInsight,
  DashboardPeriod,
  DashboardRefreshResult,
  ChartSSEEvent,
  FileAttachmentMetadata,
  ExcelExportMetadata,
  AppNotification,
  NotificationSettings,
  Message,
  EntitySearchResult,
  MeResponse,
  ServerConversation,
  OdooConfigItem,
  OdooConfigSummary,
  OrgUser,
  Invitation,
  UserRole,
  OrgType,
  UserOdooCredential,
  OdooCredentialSummary,
  AdminUserCredential,
  SubscriptionTier,
  BillingState,
  SuperAdminOrgsResponse,
  SuperAdminUsersResponse,
  SuperAdminOrgDetail,
  FeedbackReport,
  FeedbackListResponse,
  FeedbackStats,
  FeedbackCategory,
  FeedbackStatus,
  AnalyticsEventsListResponse,
  AnalyticsEventsStats,
  ValidateResult,
  ValidateErrorCode,
  InstanceDetail,
  SeatType,
  InvitationMode,
  OdooConnectionStatus,
  TtsVoicesResult,
  Routine,
  RoutineRunDetail,
  RoutineRunSummary,
  RoutineConversationReview,
  RoutineDryRun,
  RoutineGrant,
  RoutineGrantsMatrix,
  RoutineScope,
  RoutineStepReview,
  RoutineCadence,
  RoutineSchedule,
  ReportOfferOption,
} from "@/lib/types";
import { getAccessToken } from "@/lib/supabase";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

/** Sentinel value for network errors — consumers should map this to an i18n key. */
export const NETWORK_ERROR = "__NETWORK_ERROR__";

/** Thrown (not returned) when the backend returns 402. Caught by callers to show the limit modal. */
export class LimitReachedError extends Error {
  constructor() {
    super("LIMIT_REACHED");
    this.name = "LimitReachedError";
  }
}

/**
 * Centralized fetch wrapper.
 * - Adds Authorization header when a Supabase token is available.
 * - 401 → clears auth state (via window event) and redirects to /login.
 * - 402 → throws LimitReachedError (non-crashing, caught by callers).
 */
export async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getAccessToken();

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    // Signal the auth context to clear session and redirect
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("auth:unauthorized"));
    }
    throw new Error("UNAUTHORIZED");
  }

  if (res.status === 402) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("auth:limit_reached"));
    }
    throw new LimitReachedError();
  }

  return res;
}

/** Normalizes FastAPI `detail` which can be a string or a 422 array of validation objects. */
function extractError(detail: unknown, fallback: string): string {
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((e) => (typeof e === "object" && e !== null && "msg" in e ? String((e as Record<string, unknown>).msg) : String(e))).join(", ");
  }
  return fallback;
}

/** Maps frontend OdooConfig fields to the backend's expected format. */
export function toBackendConfig(config: OdooConfig) {
  return {
    url: config.url,
    db: config.db,
    username: config.login,
    api_key: config.apiKey,
  };
}

// ---- /me endpoints ----

export interface FetchMeResult {
  success: boolean;
  data?: MeResponse;
  error?: string;
}

export async function fetchMe(): Promise<FetchMeResult> {
  try {
    const res = await authFetch(`${API_BASE}/me`);
    const data = await res.json();
    if (res.ok) return { success: true, data };
    return { success: false, error: data.detail || "Failed to fetch session" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export interface FetchConversationsResult {
  success: boolean;
  conversations?: ServerConversation[];
  /** Cuántas vinieron en ESTA página (no el total). */
  count?: number;
  /** Cuántas matchean el filtro en total — de acá sale si hay más páginas. */
  total?: number;
  /** Cuántas quedaron afuera por ser de OTRA instancia (0 sin filtro). */
  otherCount?: number;
  error?: string;
}

/**
 * Historial lateral del usuario.
 *
 * ⚠️ **El filtro por instancia lo hace el backend**, no este cliente: la lista se pagina de
 * a 50, así que filtrar la página ya traída deja el sidebar vacío teniendo chats (los 50 más
 * recientes pueden ser todos de otra instancia) y rompe "cargar más". Mandar `configId` en
 * la query es la única forma de que las 50 sean 50 útiles.
 *
 * `"demo"` no es un UUID: el backend lo ignora y devuelve todo, que es lo correcto.
 */
export async function fetchMyConversations(
  limit = 50,
  offset = 0,
  configId?: string | null
): Promise<FetchConversationsResult> {
  try {
    const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (configId) qs.set("config_id", configId);
    const res = await authFetch(`${API_BASE}/me/conversations?${qs.toString()}`);
    const data = await res.json();
    if (res.ok)
      return {
        success: true,
        conversations: data.conversations ?? data,
        count: data.count,
        total: data.total,
        otherCount: data.other_count,
      };
    return { success: false, error: data.detail || "Failed to fetch conversations" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export async function deleteChat(chatId: string): Promise<BasicResult> {
  try {
    const res = await authFetch(`${API_BASE}/chat/${chatId}`, { method: "DELETE" });
    if (res.ok) return { success: true };
    const data = await res.json().catch(() => ({}));
    return { success: false, error: data.detail || "Failed to delete chat" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

// ---- Admin: Org ----

export interface OrgResult {
  success: boolean;
  org?: MeResponse["org"];
  error?: string;
}

export async function createOrg(
  name: string,
  slug: string,
  type: OrgType = "SOLITARY"
): Promise<OrgResult> {
  try {
    const res = await authFetch(`${API_BASE}/admin/orgs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, slug, type }),
    });
    const data = await res.json();
    if (res.ok) return { success: true, org: data };
    return { success: false, error: extractError(data.detail, "Failed to create org") };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export interface OnboardingPayload {
  org_name: string;
  org_slug: string;
  odoo_url: string;
  odoo_db: string;
  odoo_username: string;
  odoo_api_key: string;
  odoo_label?: string;
}

export interface OnboardingResult {
  success: boolean;
  error?: string;
  slugConflict?: boolean;
}

export async function submitOnboarding(
  payload: OnboardingPayload
): Promise<OnboardingResult> {
  try {
    const res = await authFetch(`${API_BASE}/me/onboarding`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok) return { success: true };
    if (res.status === 409) {
      return {
        success: false,
        error: data.detail || "Conflict",
        slugConflict: typeof data.detail === "string" && data.detail.toLowerCase().includes("slug"),
      };
    }
    return { success: false, error: extractError(data.detail, "Failed to complete onboarding") };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export async function updateOrg(
  orgId: string,
  payload: { name?: string; slug?: string; type?: OrgType; brand_name?: string | null; brand_logo_url?: string | null }
): Promise<OrgResult> {
  try {
    const res = await authFetch(`${API_BASE}/admin/orgs/${orgId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok) return { success: true, org: data };
    return { success: false, error: data.detail || "Failed to update org" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export type UploadLogoResult =
  | { url: string; errorCode?: never }
  | { url?: never; errorCode: "413" | "415" | "422" | "generic" };

export async function uploadBrandLogo(orgId: string, file: File): Promise<UploadLogoResult> {
  try {
    const formData = new FormData();
    formData.append("file", file);

    const token = await getAccessToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/admin/orgs/${orgId}/brand-logo`, {
      method: "POST",
      headers,
      body: formData,
    });

    if (res.status === 401) {
      if (typeof window !== "undefined")
        window.dispatchEvent(new CustomEvent("auth:unauthorized"));
      return { errorCode: "generic" };
    }
    if (res.status === 413) return { errorCode: "413" };
    if (res.status === 415) return { errorCode: "415" };
    if (res.status === 422) return { errorCode: "422" };

    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { errorCode: "generic" };

    return { url: data.brand_logo_url };
  } catch {
    return { errorCode: "generic" };
  }
}

// ---- Admin: Odoo Configs ----

export interface OdooConfigsResult {
  success: boolean;
  /** Enriched on the instances-list endpoint (company_name, counts, seats, my_connection_status). */
  configs?: OdooConfigSummary[];
  error?: string;
}

export interface OdooConfigResult {
  success: boolean;
  config?: OdooConfigItem;
  error?: string;
  /** Discriminated validation failure (422) when creating against Odoo. */
  errorCode?: ValidateErrorCode;
  /** True when a SOLITARY org tried to add a 2nd instance (409). */
  solitaryBlocked?: boolean;
}

export async function listOdooConfigs(orgId: string): Promise<OdooConfigsResult> {
  try {
    const res = await authFetch(`${API_BASE}/admin/orgs/${orgId}/configs`);
    const data = await res.json();
    if (res.ok) return { success: true, configs: data.configs ?? data };
    return { success: false, error: data.detail || "Failed to list configs" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export async function createOdooConfig(
  orgId: string,
  payload: {
    label?: string;
    url: string;
    db_name: string;
    // Optional creator credentials (spec §2.2). Required on the 1st instance, optional from the 2nd.
    odoo_username?: string;
    odoo_apikey?: string;
  }
): Promise<OdooConfigResult> {
  try {
    const res = await authFetch(`${API_BASE}/admin/orgs/${orgId}/configs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok) return { success: true, config: data };
    // 422 → validation failed against Odoo (error_code discriminated). 409 → SOLITARY rejects instance N.
    return {
      success: false,
      error: extractError(data.detail, "Failed to create config"),
      errorCode: (data.error_code ?? data.detail?.error_code) as ValidateErrorCode | undefined,
      solitaryBlocked: res.status === 409,
    };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export interface InstanceDetailResult {
  success: boolean;
  detail?: InstanceDetail;
  error?: string;
}

/** Instance detail with its users ∩ this instance + pending invitations (spec §2.4). */
export async function fetchInstanceDetail(
  orgId: string,
  configId: string
): Promise<InstanceDetailResult> {
  try {
    const res = await authFetch(`${API_BASE}/admin/orgs/${orgId}/configs/${configId}`);
    const data = await res.json();
    if (res.ok) {
      // Backend wraps the config under a `config` key: { status, config: {...} }.
      // Fall back to `data` directly for forward-compatibility if the shape changes.
      const raw = data.config ?? data;
      const detail: InstanceDetail = {
        ...raw,
        id: raw.id ?? configId,
        users: raw.users ?? [],
        invitations: raw.invitations ?? [],
        counts: raw.counts ?? { active: 0, unset: 0, invalid: 0, pending: 0 },
      };
      return { success: true, detail };
    }
    return { success: false, error: extractError(data.detail, "Failed to load instance") };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export async function updateOdooConfig(
  orgId: string,
  configId: string,
  payload: Partial<{ label: string | null; url: string; db_name: string; is_active: boolean }>
): Promise<OdooConfigResult> {
  try {
    const res = await authFetch(
      `${API_BASE}/admin/orgs/${orgId}/configs/${configId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    const data = await res.json();
    if (res.ok) return { success: true, config: data };
    return { success: false, error: extractError(data.detail, "Failed to update config") };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export interface BasicResult {
  success: boolean;
  error?: string;
}

export async function deleteOdooConfig(
  orgId: string,
  configId: string
): Promise<BasicResult> {
  try {
    const res = await authFetch(
      `${API_BASE}/admin/orgs/${orgId}/configs/${configId}`,
      { method: "DELETE" }
    );
    if (res.ok) return { success: true };
    const data = await res.json();
    return { success: false, error: data.detail || "Failed to delete config" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

// ---- Admin: Users ----

export interface OrgUsersResult {
  success: boolean;
  users?: OrgUser[];
  error?: string;
}

export async function listOrgUsers(orgId: string): Promise<OrgUsersResult> {
  try {
    const res = await authFetch(`${API_BASE}/admin/orgs/${orgId}/users`);
    const data = await res.json();
    if (res.ok) return { success: true, users: data.users ?? data };
    return { success: false, error: data.detail || "Failed to list users" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export interface UpdateOrgUserResult extends BasicResult {
  /** 409 + error_code "sttLimitReached" — org's STT quota is exhausted. */
  sttLimitReached?: boolean;
  /** 409 + error_code "ttsLimitReached" — org's TTS quota is exhausted. */
  ttsLimitReached?: boolean;
}

export async function updateOrgUser(
  orgId: string,
  userId: string,
  payload: {
    role?: UserRole;
    is_free_license?: boolean;
    allow_feedback?: boolean;
    stt_enabled?: boolean;
    tts_enabled?: boolean;
    /** Routines: may this user WRITE them? No org quota behind it (unlike
     *  STT/TTS) — it consumes nothing, it is an attribution. */
    can_author_routines?: boolean;
  }
): Promise<UpdateOrgUserResult> {
  try {
    const res = await authFetch(
      `${API_BASE}/admin/orgs/${orgId}/users/${userId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    if (res.ok) return { success: true };
    const data = await res.json();
    const code = (data.detail?.error_code ?? data.error_code) as string | undefined;
    return {
      success: false,
      sttLimitReached: code === "sttLimitReached",
      ttsLimitReached: code === "ttsLimitReached",
      error: extractError(data.detail, "Failed to update user"),
    };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export async function removeOrgUser(
  orgId: string,
  userId: string
): Promise<BasicResult> {
  try {
    const res = await authFetch(
      `${API_BASE}/admin/orgs/${orgId}/users/${userId}`,
      { method: "DELETE" }
    );
    if (res.ok) return { success: true };
    const data = await res.json();
    return { success: false, error: data.detail || "Failed to remove user" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

// ---- Credentials: User manages own ----

export interface CredentialResult {
  success: boolean;
  credential?: UserOdooCredential;
  error?: string;
  notFound?: boolean;
  /** Set when the save was rejected by Odoo validation (422). Usually "auth_failed". */
  errorCode?: ValidateErrorCode;
}

export interface AllCredentialsResult {
  success: boolean;
  credentials?: OdooCredentialSummary[];
  error?: string;
}

export async function fetchAllMyCredentials(): Promise<AllCredentialsResult> {
  try {
    const res = await authFetch(`${API_BASE}/me/odoo-credentials`);
    const data = await res.json();
    if (res.ok) return { success: true, credentials: data };
    return { success: false, error: data.detail || "Failed to fetch credentials" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export async function fetchMyCredential(configId: string): Promise<CredentialResult> {
  try {
    const res = await authFetch(`${API_BASE}/me/odoo-credentials/${configId}`);
    if (res.status === 404) return { success: false, notFound: true };
    const data = await res.json();
    if (res.ok) return { success: true, credential: data };
    return { success: false, error: data.detail || "Failed to fetch credential" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export async function saveMyCredential(
  configId: string,
  payload: { odoo_username: string; odoo_api_key: string }
): Promise<CredentialResult> {
  try {
    const res = await authFetch(`${API_BASE}/me/odoo-credentials/${configId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok) return { success: true, credential: data.credential ?? data };
    return {
      success: false,
      error: extractError(data.detail, "Failed to save credential"),
      errorCode: (data.error_code ?? data.detail?.error_code) as ValidateErrorCode | undefined,
    };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

/** Re-validate the current user's stored credential for a config (spec §2.6). */
export async function revalidateMyCredential(configId: string): Promise<CredentialResult> {
  try {
    const res = await authFetch(`${API_BASE}/me/odoo-credentials/${configId}/revalidate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const data = await res.json();
    if (res.ok) return { success: true, credential: data.credential ?? data };
    return {
      success: false,
      error: extractError(data.detail, "Failed to revalidate"),
      errorCode: (data.error_code ?? data.detail?.error_code) as ValidateErrorCode | undefined,
    };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

// ---- Credentials: Admin manages any user ----

export async function fetchUserCredential(
  orgId: string,
  userId: string,
  configId: string
): Promise<CredentialResult> {
  try {
    const res = await authFetch(
      `${API_BASE}/admin/orgs/${orgId}/users/${userId}/odoo-credentials/${configId}`
    );
    if (res.status === 404) return { success: false, notFound: true };
    const data = await res.json();
    if (res.ok) return { success: true, credential: data };
    return { success: false, error: data.detail || "Failed to fetch credential" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export async function assignUserInstance(
  orgId: string,
  userId: string,
  configId: string
): Promise<BasicResult> {
  try {
    const res = await authFetch(
      `${API_BASE}/admin/orgs/${orgId}/users/${userId}/odoo-credentials/${configId}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ odoo_username: "", odoo_api_key: "" }),
      }
    );
    if (res.ok) return { success: true };
    const data = await res.json();
    return { success: false, error: extractError(data.detail, "Failed to assign instance") };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export async function saveUserCredential(
  orgId: string,
  userId: string,
  configId: string,
  payload: { odoo_username: string; odoo_api_key: string }
): Promise<CredentialResult> {
  try {
    const res = await authFetch(
      `${API_BASE}/admin/orgs/${orgId}/users/${userId}/odoo-credentials/${configId}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    const data = await res.json();
    if (res.ok) return { success: true, credential: data.credential ?? data };
    return {
      success: false,
      error: extractError(data.detail, "Failed to save credential"),
      errorCode: (data.error_code ?? data.detail?.error_code) as ValidateErrorCode | undefined,
    };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

/** Admin: re-validate a user's stored credential for a config (spec §2.6). */
export async function revalidateUserCredential(
  orgId: string,
  userId: string,
  configId: string
): Promise<CredentialResult> {
  try {
    const res = await authFetch(
      `${API_BASE}/admin/orgs/${orgId}/users/${userId}/odoo-credentials/${configId}/revalidate`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
    );
    const data = await res.json();
    if (res.ok) return { success: true, credential: data.credential ?? data };
    return {
      success: false,
      error: extractError(data.detail, "Failed to revalidate"),
      errorCode: (data.error_code ?? data.detail?.error_code) as ValidateErrorCode | undefined,
    };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export async function deleteUserCredential(
  orgId: string,
  userId: string,
  configId: string
): Promise<BasicResult> {
  try {
    const res = await authFetch(
      `${API_BASE}/admin/orgs/${orgId}/users/${userId}/odoo-credentials/${configId}`,
      { method: "DELETE" }
    );
    if (res.ok) return { success: true };
    const data = await res.json();
    return { success: false, error: data.detail || "Failed to delete credential" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export interface AllUserCredentialsResult {
  success: boolean;
  credentials?: AdminUserCredential[];
  error?: string;
}

export async function fetchAllUserCredentials(
  orgId: string,
  userId: string
): Promise<AllUserCredentialsResult> {
  try {
    const res = await authFetch(
      `${API_BASE}/admin/orgs/${orgId}/users/${userId}/odoo-credentials`
    );
    const data = await res.json();
    if (res.ok) return { success: true, credentials: data };
    return { success: false, error: data.detail || "Failed to fetch credentials" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

// ---- Admin: Pending credentials for invitations ----

export interface PendingCredential {
  odoo_config_id: string;
  odoo_username: string;
  created_at: string;
  config_label?: string | null;
  config_url?: string | null;
}

export interface PendingCredentialsResult {
  success: boolean;
  pending_credentials?: PendingCredential[];
  error?: string;
}

export interface SavePendingCredentialResult {
  success: boolean;
  pending_credential?: PendingCredential;
  error?: string;
}

export async function fetchPendingCredentials(
  orgId: string,
  invitationId: string
): Promise<PendingCredentialsResult> {
  try {
    const res = await authFetch(
      `${API_BASE}/admin/orgs/${orgId}/invitations/${invitationId}/pending-credentials`
    );
    const data = await res.json();
    if (res.ok) return { success: true, pending_credentials: data.pending_credentials };
    return { success: false, error: data.detail || "Failed to fetch pending credentials" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export async function savePendingCredential(
  orgId: string,
  invitationId: string,
  configId: string,
  payload: { odoo_username: string; odoo_api_key: string }
): Promise<SavePendingCredentialResult> {
  try {
    const res = await authFetch(
      `${API_BASE}/admin/orgs/${orgId}/invitations/${invitationId}/pending-credentials/${configId}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    const data = await res.json();
    if (res.ok) return { success: true, pending_credential: data.pending_credential };
    return { success: false, error: data.detail || "Failed to save pending credential" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export async function deletePendingCredential(
  orgId: string,
  invitationId: string,
  configId: string
): Promise<BasicResult> {
  try {
    const res = await authFetch(
      `${API_BASE}/admin/orgs/${orgId}/invitations/${invitationId}/pending-credentials/${configId}`,
      { method: "DELETE" }
    );
    if (res.ok) return { success: true };
    const data = await res.json();
    return { success: false, error: data.detail || "Failed to delete pending credential" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

// ---- Admin: Invitations ----

export interface InvitationsResult {
  success: boolean;
  invitations?: Invitation[];
  error?: string;
}

export interface InvitationResult {
  success: boolean;
  invitation?: Invitation;
  error?: string;
  /** 409 + error_code "seatLimitReached" — no free seat of the chosen type. */
  seatLimitReached?: boolean;
  /** 409 + error_code "email_has_account" — the email already belongs to a user (spec §2.8, blocked). */
  emailHasAccount?: boolean;
}

export interface CreateInvitationOptions {
  role?: UserRole;
  /** Instance the invitee is assigned to (spec §2.8). Required when the org has >1 instance. */
  instance_id?: string;
  seat_type?: SeatType;
  mode?: InvitationMode;
  /** Only for mode = "precreds" — admin pre-loads the invitee's Odoo credentials. */
  prefilled_username?: string;
  prefilled_apikey?: string;
}

export async function createInvitation(
  orgId: string,
  email: string,
  roleOrOptions: UserRole | CreateInvitationOptions = "CLIENT_USER"
): Promise<InvitationResult> {
  const opts: CreateInvitationOptions =
    typeof roleOrOptions === "string" ? { role: roleOrOptions } : roleOrOptions;
  const body: Record<string, unknown> = {
    email,
    role: opts.role ?? "CLIENT_USER",
    seat_type: opts.seat_type ?? "paid",
    mode: opts.mode ?? "invite_only",
  };
  if (opts.instance_id) body.instance_id = opts.instance_id;
  if (opts.prefilled_username) body.prefilled_username = opts.prefilled_username;
  if (opts.prefilled_apikey) body.prefilled_apikey = opts.prefilled_apikey;

  try {
    const res = await authFetch(
      `${API_BASE}/admin/orgs/${orgId}/invitations`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    const data = await res.json();
    if (res.ok) return { success: true, invitation: data.invitation ?? data };
    const code = (data.error_code ?? data.detail?.error_code) as string | undefined;
    return {
      success: false,
      seatLimitReached: code === "seatLimitReached" || (res.status === 409 && code !== "email_has_account"),
      emailHasAccount: code === "email_has_account",
      error: extractError(data.detail, "Failed to create invitation"),
    };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export interface SendInvitationEmailParams {
  token: string;
  email: string;
  orgName: string;
  brandName?: string | null;
  companyName?: string | null;
  role?: UserRole;
  lang?: string;
  expiresAt?: string;
}

/**
 * Sends the localized invitation email via the Next.js route handler
 * (app/api/send-invitation), which talks to Zoho SMTP server-side.
 * Best-effort: the invitation already exists on the backend, so a failed
 * email is non-fatal — the admin can still copy the link manually.
 */
export async function sendInvitationEmail(
  params: SendInvitationEmailParams
): Promise<BasicResult> {
  try {
    const authToken = await getAccessToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

    const res = await fetch(`/api/send-invitation`, {
      method: "POST",
      headers,
      body: JSON.stringify(params),
    });
    if (res.ok) return { success: true };
    const data = await res.json().catch(() => ({}));
    return { success: false, error: extractError(data.error, "Failed to send invitation email") };
  } catch {
    return { success: false, error: NETWORK_ERROR };
  }
}

export async function cancelInvitation(
  orgId: string,
  invitationId: string
): Promise<BasicResult> {
  try {
    const res = await authFetch(
      `${API_BASE}/admin/orgs/${orgId}/invitations/${invitationId}`,
      { method: "DELETE" }
    );
    if (res.ok) return { success: true };
    const data = await res.json();
    return { success: false, error: extractError(data.detail, "Failed to cancel invitation") };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export async function listInvitations(orgId: string): Promise<InvitationsResult> {
  try {
    const res = await authFetch(
      `${API_BASE}/admin/orgs/${orgId}/invitations`
    );
    const data = await res.json();
    if (res.ok) return { success: true, invitations: data.invitations ?? data };
    return { success: false, error: data.detail || "Failed to list invitations" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export interface InvitationOdooInstance {
  company_name: string;
  label: string;
  display_name: string;
}

export interface InvitationInfoResult {
  success: boolean;
  email?: string;
  org_name?: string;
  role?: string;
  expires_at?: string;
  brand_name?: string | null;
  brand_logo_url?: string | null;
  odoo_instance?: InvitationOdooInstance | null;
  status?: number;
  error?: string;
}

export async function fetchInvitationInfo(token: string): Promise<InvitationInfoResult> {
  try {
    const res = await fetch(`${API_BASE}/admin/invitations/${token}/preview`);
    const data = await res.json();
    if (res.ok) return { success: true, ...data };
    return { success: false, status: res.status };
  } catch {
    return { success: false, error: NETWORK_ERROR };
  }
}

export interface AcceptInvitationResult {
  success: boolean;
  status?: number;
  error?: string;
  /** The instance the new user was assigned to (spec §2.9). */
  instanceId?: string | null;
  /** Connection status after accept: "active" (precreds) or "unset" (invite_only). */
  connectionStatus?: OdooConnectionStatus | null;
}

export async function acceptInvitation(
  token: string,
  accessToken?: string
): Promise<AcceptInvitationResult> {
  try {
    const authToken = accessToken ?? await getAccessToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

    const res = await fetch(`${API_BASE}/admin/invitations/accept`, {
      method: "POST",
      headers,
      body: JSON.stringify({ token }),
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return {
        success: true,
        instanceId: data.instance_id ?? null,
        connectionStatus: (data.connection_status ?? null) as OdooConnectionStatus | null,
      };
    }
    return { success: false, status: res.status };
  } catch {
    return { success: false, error: NETWORK_ERROR };
  }
}

// ---- Connection Test ----

/**
 * Discriminated connection validation (spec §7).
 * - Without credentials → only checks the instance exists (reachable URL + DB found).
 * - With credentials → also validates auth; `auth_failed` when the apikey is wrong.
 * Backend accepts both field schemes (db/db_name, username/odoo_username, api_key/odoo_apikey).
 */
export async function validateConnection(payload: {
  url: string;
  db_name: string;
  odoo_username?: string;
  odoo_apikey?: string;
}): Promise<ValidateResult> {
  try {
    const res = await authFetch(`${API_BASE}/test-connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: payload.url,
        db_name: payload.db_name,
        odoo_username: payload.odoo_username || undefined,
        odoo_apikey: payload.odoo_apikey || undefined,
      }),
    });
    const data = await res.json();
    // New shape: { ok, company_name, odoo_version, error_code, field_errors }.
    // Fall back to legacy keys (status/company/version) for resilience.
    const ok = data.ok ?? data.status === "ok";
    if (res.ok && ok) {
      return {
        ok: true,
        company_name: data.company_name ?? data.company ?? null,
        odoo_version: data.odoo_version ?? data.version ?? null,
      };
    }
    const error_code = (data.error_code ?? "unreachable") as ValidateErrorCode;
    return { ok: false, error_code, field_errors: data.field_errors };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { ok: false, error_code: "unreachable" };
  }
}

export interface OdooModule {
  name: string;
  state: string;
  installed_version?: string;
  display_name?: string;
}

export interface InspectInstanceResult {
  success: boolean;
  modules?: OdooModule[];
  error?: string;
}

export async function inspectInstance(
  config: OdooConfig
): Promise<InspectInstanceResult> {
  try {
    const res = await authFetch(`${API_BASE}/inspect-instance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toBackendConfig(config)),
    });

    const data = await res.json();

    if (res.ok && data.modules) {
      return { success: true, modules: data.modules };
    }

    return {
      success: false,
      error: data.detail || data.error || undefined,
    };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export async function inspectSavedOdooConfig(
  orgId: string,
  configId: string
): Promise<InspectInstanceResult> {
  try {
    const res = await authFetch(
      `${API_BASE}/admin/orgs/${orgId}/configs/${configId}/inspect`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
    );
    const data = await res.json();
    if (res.ok && data.modules) {
      return { success: true, modules: data.modules };
    }
    return { success: false, error: data.detail || data.error || undefined };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export interface ExecuteActionResult {
  success: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  result?: ActionResult;
  queue_next?: { text: string };
}

export async function executeAction(
  chatId: string,
  actionContext: ActionContext,
  configId: string,
  locale: string,
  /** Vista previa de audiencia. Sólo `"client"` se honra del lado del server. */
  audience?: "client"
): Promise<ExecuteActionResult> {
  try {
    const res = await authFetch(`${API_BASE}/chat/${chatId}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        config_id: configId,
        action: "confirm_action",
        context: actionContext,
        language: locale,
        // Confirmar una acción es parte de la MISMA conversación: sin esto, el
        // visitante pregunta en vista cliente y recibe la confirmación con voz de
        // implementador, en la misma pantalla.
        ...(audience ? { audience } : {}),
      }),
    });

    const data = await res.json();

    if (data.status === "ok") {
      return {
        success: true,
        message: data.message,
        result: data.result,
        queue_next: data.queue_next,
      };
    }

    let errorMessage = data.detail || data.message || "Action failed";

    if (res.status === 400) {
      errorMessage = `Validation error: ${errorMessage}`;
    } else if (res.status === 422) {
      const fieldErrors: Record<string, string> | undefined =
        data.errors && typeof data.errors === "object" ? data.errors : undefined;
      return { success: false, error: errorMessage, fieldErrors };
    } else if (res.status === 500) {
      errorMessage = `Execution error: ${errorMessage}`;
    }

    return { success: false, error: errorMessage };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: "Network error: Could not connect to backend" };
  }
}

export async function executeAggReportAction(
  chatId: string,
  opt: AggReportOption,
  configId: string,
  locale: string
): Promise<{ success: boolean; result?: ActionResult & { action: "report_grouped" }; error?: string }> {
  try {
    const res = await authFetch(`${API_BASE}/chat/${chatId}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        config_id: configId,
        language: locale,
        action: "report_grouped",
        context: { action: "report_grouped", format: opt.format, payload: opt.payload },
      }),
    });
    const data = await res.json();
    if (data.status === "ok") {
      return { success: true, result: data.result };
    }
    return { success: false, error: data.detail || data.message || "Action failed" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: "Network error" };
  }
}

// ---- Pinned Insights API ----

export interface FetchPinsResult {
  success: boolean;
  pins?: PinnedInsight[];
  error?: string;
}

/**
 * Backend stores pins in a raw shape (content_type, timestamp, payload, chat_id, ...).
 * Normalize to the discriminated-union `PinnedInsight` the rest of the app consumes.
 * Backward-compatible: if the row already arrives in the parsed shape (has `kind`), it's returned as-is.
 * Defensive: rows that don't match any known content_type are dropped (returns null → filtered).
 *
 * `fallbackChatId` lets callers inject the chatId for endpoints where it's omitted in the response
 * (e.g. `/chat/{chatId}/pins` — the backend skips it because the URL already carries it).
 */
function normalizePin(raw: unknown, fallbackChatId?: string): PinnedInsight | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  // Already in the parsed shape — pass through.
  if (typeof r.kind === "string") return raw as PinnedInsight;

  const contentType = r.content_type as string | undefined;
  const id = r.id as string | undefined;
  const chatId =
    (r.chat_id as string | undefined) ?? (r.chatId as string | undefined) ?? fallbackChatId;
  const messageId = (r.message_id as string | undefined) ?? (r.messageId as string | undefined);
  const pinnedAt =
    (r.timestamp as string | undefined) ??
    (r.pinnedAt as string | undefined) ??
    new Date().toISOString();

  if (!id || !chatId || !messageId || !contentType) return null;

  const payload = r.payload;

  if (contentType === "chart") {
    if (!payload) return null;
    const chartIndex =
      (r.chart_index as number | undefined) ?? (r.chartIndex as number | undefined) ?? 0;
    const queryContext = r.query_context as import("@/lib/types").PinQueryContext | undefined;
    return {
      kind: "chart",
      id,
      pinnedAt,
      chatId,
      messageId,
      chartIndex,
      chart: payload as ChartSSEEvent,
      ...(queryContext && { query_context: queryContext }),
      // Fase 5 — el veredicto viene resuelto del backend (`pin_refresh.describe`);
      // acá sólo se transporta. Sólo `/me/pins` los manda: en el resto quedan
      // `undefined` y el consumidor cae a su default.
      ...(typeof r.refreshable === "boolean" && { refreshable: r.refreshable }),
      ...(typeof r.date_dependent === "boolean" && { date_dependent: r.date_dependent }),
    };
  }

  if (contentType === "file") {
    if (!payload) return null;
    return {
      kind: "file",
      id,
      pinnedAt,
      chatId,
      messageId,
      metadata: payload as FileAttachmentMetadata,
    };
  }

  if (contentType === "excel") {
    if (!payload) return null;
    return {
      kind: "excel",
      id,
      pinnedAt,
      chatId,
      messageId,
      metadata: payload as ExcelExportMetadata,
    };
  }

  return null;
}

function normalizePinList(raw: unknown, fallbackChatId?: string): PinnedInsight[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => normalizePin(item, fallbackChatId))
    .filter((p): p is PinnedInsight => p !== null);
}

export async function fetchPins(chatId: string): Promise<FetchPinsResult> {
  try {
    const res = await authFetch(`${API_BASE}/chat/${chatId}/pins`);
    const data = await res.json();
    // Backend omits chat_id in per-chat response (already in the URL) — inject it here.
    if (res.ok) return { success: true, pins: normalizePinList(data.pins ?? data, chatId) };
    return { success: false, error: extractError(data.detail, "Failed to fetch pins") };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: "Network error: Could not connect to backend" };
  }
}

export async function fetchAllMyPins(): Promise<FetchPinsResult> {
  try {
    const res = await authFetch(`${API_BASE}/me/pins`);
    const data = await res.json();
    if (res.ok) return { success: true, pins: normalizePinList(data.pins ?? data) };
    return { success: false, error: extractError(data.detail, "Failed to fetch pins") };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: "Network error: Could not connect to backend" };
  }
}

export interface CreatePinResult {
  success: boolean;
  pin?: PinnedInsight;
  error?: string;
}

export async function createPin(
  chatId: string,
  payload: Record<string, unknown>
): Promise<CreatePinResult> {
  try {
    const res = await authFetch(`${API_BASE}/chat/${chatId}/pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok) return { success: true, pin: data.pin ?? data };
    return { success: false, error: extractError(data.detail, "Failed to create pin") };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: "Network error: Could not connect to backend" };
  }
}

export interface DeletePinResult {
  success: boolean;
  error?: string;
}

export async function deletePin(chatId: string, pinId: string): Promise<DeletePinResult> {
  try {
    const res = await authFetch(`${API_BASE}/chat/${chatId}/pin/${pinId}`, {
      method: "DELETE",
    });
    // 404 = pin already gone (or stale pin from previous schema). End state is what we wanted.
    if (res.ok || res.status === 404) return { success: true };
    const data = await res.json();
    return { success: false, error: extractError(data.detail, "Failed to delete pin") };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: "Network error: Could not connect to backend" };
  }
}

export async function deleteAllPins(chatId: string): Promise<DeletePinResult> {
  try {
    const res = await authFetch(`${API_BASE}/chat/${chatId}/pins`, {
      method: "DELETE",
    });
    if (res.ok) return { success: true };
    const data = await res.json();
    return { success: false, error: extractError(data.detail, "Failed to clear pins") };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: "Network error: Could not connect to backend" };
  }
}

export async function deleteAllMyPins(): Promise<DeletePinResult> {
  try {
    const res = await authFetch(`${API_BASE}/me/pins`, {
      method: "DELETE",
    });
    if (res.ok) return { success: true };
    const data = await res.json();
    return { success: false, error: extractError(data.detail, "Failed to clear all pins") };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: "Network error: Could not connect to backend" };
  }
}

// ---- Image Upload API ----

export interface UploadImageResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

export async function uploadImage(
  chatId: string,
  file: File,
  configId: string,
  locale: string
): Promise<UploadImageResult> {
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("config_id", configId);
    formData.append("language", locale);

    // Use authFetch but let it build headers naturally (no Content-Type for FormData)
    const token = await getAccessToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/chat/${chatId}/upload`, {
      method: "POST",
      headers,
      body: formData,
    });

    if (res.status === 401) {
      if (typeof window !== "undefined")
        window.dispatchEvent(new CustomEvent("auth:unauthorized"));
      throw new Error("UNAUTHORIZED");
    }
    if (res.status === 402) {
      if (typeof window !== "undefined")
        window.dispatchEvent(new CustomEvent("auth:limit_reached"));
      throw new LimitReachedError();
    }

    const data = await res.json();
    if (res.ok) return { success: true, data };
    return { success: false, error: data.detail || "Upload failed" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: "Network error: Could not connect to backend" };
  }
}

// ---- Voice — STT (transcription) ----

export interface TranscribeResult {
  success: boolean;
  text?: string;
  error?: string;
}

/**
 * Records the mic locally, sends the audio blob for transcription, and
 * returns the plain text. The caller is responsible for putting it in the
 * chat input / sending it — this endpoint never touches the LangGraph agent.
 * `language` should be omitted unless it's one of the agent's 6 languages
 * (es/en/fr/de/pt/it) — see STT_FORCEABLE_LANGUAGES in the backend.
 */
export async function transcribeAudio(blob: Blob, language?: string): Promise<TranscribeResult> {
  try {
    const formData = new FormData();
    const ext = blob.type.includes("mp4") ? "audio.mp4" : "audio.webm";
    formData.append("file", blob, ext);
    if (language) formData.append("language", language);

    // Manual fetch (not authFetch) so we control headers precisely — same
    // pattern as uploadImage: no Content-Type override, browser sets the
    // multipart boundary itself.
    const token = await getAccessToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/transcribe`, {
      method: "POST",
      headers,
      body: formData,
    });

    if (res.status === 401) {
      if (typeof window !== "undefined")
        window.dispatchEvent(new CustomEvent("auth:unauthorized"));
      throw new Error("UNAUTHORIZED");
    }
    if (res.status === 402) {
      if (typeof window !== "undefined")
        window.dispatchEvent(new CustomEvent("auth:limit_reached"));
      throw new LimitReachedError();
    }
    if (res.status === 403) {
      return { success: false, error: "STT_NOT_ENTITLED" };
    }

    const data = await res.json();
    if (res.ok) return { success: true, text: data.text };
    return { success: false, error: extractError(data.detail, "Transcription failed") };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

// ---- Voice — TTS catalog + preview ----

export interface FetchTtsVoicesResult {
  success: boolean;
  data?: TtsVoicesResult;
  error?: string;
}

export async function fetchTtsVoices(): Promise<FetchTtsVoicesResult> {
  try {
    const res = await authFetch(`${API_BASE}/voice/tts/voices`);
    if (!res.ok) return { success: false };
    return { success: true, data: await res.json() };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

/** Short preview for the voice picker. Returns an MP3 Blob, or null on failure. */
export async function fetchTtsPreview(text: string, voice: string, speed = 1.0): Promise<Blob | null> {
  try {
    const formData = new FormData();
    formData.append("text", text);
    formData.append("voice", voice);
    formData.append("speed", String(speed));

    const token = await getAccessToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/voice/tts/preview`, {
      method: "POST",
      headers,
      body: formData,
    });
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

// ---- Refresh Pin API ----

export interface RefreshPinResult {
  success: boolean;
  new_payload?: ChartSSEEvent;
  refreshed_at?: string;
  /** §3.1 — si es `false`, el período global NO afecta a esta tarjeta. */
  dateDependent?: boolean;
  /** ¿Se llegó a aplicar el override en ESTE refresh? */
  overrideApplied?: boolean;
  error?: string;
}

export async function refreshPin(
  chatId: string,
  pinId: string,
  configId: string,
  language: string,
  /** Fase 5 — el período global del Tablero. Se ignora en un pin atemporal. */
  period?: DashboardPeriod
): Promise<RefreshPinResult> {
  try {
    const res = await authFetch(`${API_BASE}/chat/${chatId}/pin/${pinId}/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        config_id: configId,
        language,
        ...(period && { date_override: period }),
      }),
    });

    const data = await res.json();

    if (res.ok && data.status === "ok") {
      // ⚠️ El payload viene bajo `pin`, no en la raíz. Leerlo de `data.new_payload`
      // (como hacía esta función) devolvía `undefined` con `success: true`: el
      // hook no encontraba nada que setear y el botón de refrescar giraba y no
      // cambiaba el número. Un refresh que dice que anduvo y no anduvo es peor
      // que uno que falla.
      return {
        success: true,
        new_payload: data.pin?.payload ?? data.new_payload,
        refreshed_at: data.pin?.refreshed_at ?? data.refreshed_at,
        dateDependent: data.pin?.date_dependent,
        overrideApplied: data.pin?.override_applied,
      };
    }

    return { success: false, error: extractError(data.detail, "Refresh failed") };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: "Network error: Could not connect to backend" };
  }
}

// ---- Tablero (PLAN_RUTINAS Fase 5) ----

export interface RefreshAllPinsResult {
  success: boolean;
  results?: DashboardRefreshResult[];
  ok?: number;
  skipped?: number;
  error?: string;
}

/**
 * "Actualizar todo" — un solo viaje para el Tablero entero.
 *
 * ⚠️ El backend responde **200 con el detalle por tarjeta**, no un error global: un pin
 * roto no interrumpe a los demás. `success: false` acá significa que falló el pedido
 * entero (auth, instancia inalcanzable), no que falló una tarjeta.
 */
export async function refreshAllPins(
  configId: string,
  language: string,
  period?: DashboardPeriod,
  pinIds?: string[]
): Promise<RefreshAllPinsResult> {
  try {
    const res = await authFetch(`${API_BASE}/me/pins/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        config_id: configId,
        language,
        ...(period && { date_override: period }),
        ...(pinIds && { pin_ids: pinIds }),
      }),
    });
    const data = await res.json();
    if (res.ok && data.status === "ok") {
      return { success: true, results: data.results ?? [], ok: data.ok, skipped: data.skipped };
    }
    return { success: false, error: extractError(data.detail, "Refresh failed") };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: "Network error: Could not connect to backend" };
  }
}

export interface ExportDashboardResult {
  success: boolean;
  base64?: string;
  filename?: string;
  mimetype?: string;
  error?: string;
}

/**
 * Exportar el Tablero. **No consulta Odoo**: compone lo que ya está guardado en cada
 * tarjeta (misma división que A7 hace con las Rutinas — *Actualizar* trae números
 * nuevos, *Exportar* imprime los que hay).
 */
export async function exportDashboard(
  format: "pdf" | "excel",
  language: string,
  pinIds?: string[]
): Promise<ExportDashboardResult> {
  try {
    const res = await authFetch(`${API_BASE}/me/pins/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format, language, ...(pinIds && { pin_ids: pinIds }) }),
    });
    const data = await res.json();
    if (res.ok && data.status === "ok") {
      return {
        success: true,
        base64: format === "pdf" ? data.pdf_base64 : data.xlsx_base64,
        filename: data.filename,
        mimetype: data.mimetype,
      };
    }
    return { success: false, error: extractError(data.detail, "Export failed") };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: "Network error: Could not connect to backend" };
  }
}

// ---- Notifications API ----

export interface FetchNotificationsResult {
  success: boolean;
  notifications?: AppNotification[];
  error?: string;
}

export async function fetchNotifications(
  chatId: string,
  params?: { unreadOnly?: boolean; since?: string; limit?: number }
): Promise<FetchNotificationsResult> {
  try {
    const query = new URLSearchParams();
    if (params?.unreadOnly) query.set("unread_only", "true");
    if (params?.since) query.set("since", params.since);
    if (params?.limit) query.set("limit", String(params.limit));
    const qs = query.toString() ? `?${query.toString()}` : "";
    const res = await authFetch(`${API_BASE}/chat/${chatId}/notifications${qs}`);
    const data = await res.json();
    if (res.ok) return { success: true, notifications: data.notifications ?? data };
    return { success: false, error: data.detail || "Failed to fetch notifications" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: "Network error: Could not connect to backend" };
  }
}

export interface MarkReadResult {
  success: boolean;
  error?: string;
}

export async function markNotificationRead(
  chatId: string,
  notificationId: string
): Promise<MarkReadResult> {
  try {
    const res = await authFetch(
      `${API_BASE}/chat/${chatId}/notifications/${notificationId}/read`,
      { method: "PATCH" }
    );
    if (res.ok) return { success: true };
    const data = await res.json();
    return { success: false, error: data.detail || "Failed to mark as read" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: "Network error: Could not connect to backend" };
  }
}

export async function markAllNotificationsRead(chatId: string): Promise<MarkReadResult> {
  try {
    const res = await authFetch(
      `${API_BASE}/chat/${chatId}/notifications/read-all`,
      { method: "PATCH" }
    );
    if (res.ok) return { success: true };
    const data = await res.json();
    return { success: false, error: data.detail || "Failed to mark all as read" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: "Network error: Could not connect to backend" };
  }
}

// ---- Chat History API ----

export interface FetchChatHistoryResult {
  success: boolean;
  messages?: Message[];
  error?: string;
}

export async function fetchChatHistory(
  chatId: string,
  configId: string
): Promise<FetchChatHistoryResult> {
  try {
    const params = new URLSearchParams({ config_id: configId });
    const res = await authFetch(`${API_BASE}/chat/${chatId}/history?${params}`);
    const data = await res.json();
    if (res.ok) {
      const messages: Message[] = (data.messages ?? data).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (m: any) => ({
          ...m,
          role: m.role === "human" ? "user" : m.role === "ai" ? "assistant" : m.role,
          timestamp: new Date(m.timestamp ?? m.created_at ?? Date.now()),
        })
      );
      return { success: true, messages };
    }
    return { success: false, error: data.detail || "Failed to fetch chat history" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

// ---- Audit History API ----

/** Un campo que el usuario editó sobre la propuesta del agente (sólo Builder). */
export interface AuditChange {
  field: string;
  label: string;
  from: unknown;
  to: unknown;
  description: string;
}

/**
 * La entrada técnica: modelo, método y cambios campo a campo.
 *
 * ⚠️ Estas son las claves que el backend manda DE VERDAD (`api/audit.py`). El tipo que
 * había acá antes describía un contrato que el backend nunca implementó — `action` por
 * `action_type`, `user_edits` por `changes`, y `record_id`/`vals`/`status`/`error_message`
 * que no existen en ninguna respuesta.
 */
export interface AuditEntryBuilder {
  id: string;
  thread_id: string;
  user_id: number | null;
  model: string;
  action_type: string;
  original_vals: Record<string, unknown>;
  final_vals: Record<string, unknown>;
  changes: AuditChange[];
  has_edits: boolean;
  created_at: string;
}

/**
 * La entrada de audiencia Client (`_client_audit_entry` en el back): **otra forma, no la
 * misma con campos vacíos** — sin modelo, sin método, sin nombres de campo, y con las
 * claves en camelCase. Es el recorte que un cliente final tiene que ver.
 */
export interface AuditEntryClient {
  ts: string;
  summary: string;
  recordId: number | null;
  recordName: string | null;
}

export type AuditEntry = AuditEntryBuilder | AuditEntryClient;

/** Discriminador de las dos formas. `summary` sólo existe en la del cliente. */
export function isClientAuditEntry(entry: AuditEntry): entry is AuditEntryClient {
  return "summary" in entry;
}

export interface FetchAuditResult {
  success: boolean;
  entries?: AuditEntry[];
  error?: string;
}

export async function fetchAuditHistory(
  chatId: string,
  /** Vista previa de audiencia. Sólo `"client"` se honra del lado del server. */
  audience?: "client"
): Promise<FetchAuditResult> {
  try {
    // ⚠️ Es un GET, así que la vista previa viaja como QUERY PARAM — única diferencia
    // con `/stream` y `/action`, que la reciben en el cuerpo. La regla sigue siendo del
    // server (`_audience_for_request` sólo honra la bajada a `client`).
    const qs = audience ? `?audience=${audience}` : "";
    const res = await authFetch(`${API_BASE}/chat/${chatId}/audit${qs}`);
    const data = await res.json();
    if (res.ok) {
      // ⚠️ La clave es `audit_logs`. Antes acá se leía `data.entries`, que el backend
      // **no manda en ninguna respuesta**: el popover devolvía [] siempre y se veía como
      // "aún no se han ejecutado acciones" — indistinguible de no tener historial.
      const entries = Array.isArray(data?.audit_logs)
        ? data.audit_logs
        : Array.isArray(data)
          ? data
          : [];
      return { success: true, entries };
    }
    return { success: false, error: data.detail || "Failed to fetch audit history" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

// ---- Entity Search API (Odoo name_search) ----

export interface SearchEntitiesResult {
  success: boolean;
  results?: EntitySearchResult[];
  error?: string;
}

export async function searchEntities(
  chatId: string,
  model: string,
  query: string,
  configId: string
): Promise<SearchEntitiesResult> {
  try {
    const res = await authFetch(`${API_BASE}/chat/${chatId}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        query,
        config_id: configId,
      }),
    });
    const data = await res.json();
    if (res.ok) return { success: true, results: data.results ?? data };
    return { success: false, error: data.detail || "Search failed" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

// ---- Billing API ----

export interface BillingCheckoutResult {
  success: boolean;
  checkout_url?: string;
  error?: string;
}

export async function createBillingCheckout(
  tier: Exclude<SubscriptionTier, "FREE">
): Promise<BillingCheckoutResult> {
  try {
    const res = await authFetch(`${API_BASE}/billing/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier }),
    });
    const data = await res.json();
    if (res.ok) return { success: true, checkout_url: data.checkout_url ?? data.url };
    return { success: false, error: extractError(data.detail, "Failed to create checkout session") };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

/**
 * Beta defaults for the Founding Partners phase (spec §0). Used as a fallback
 * when `GET /billing/state` is unavailable so the front degrades gracefully —
 * the numbers still come from a single source, never sprinkled across the UI.
 */
export const BETA_BILLING_DEFAULTS: BillingState = {
  phase: "beta_founder",
  price_anchor: 7,
  founder_rate: 1,
  beta_free: true,
  founder_rate_locked: false,
};

/**
 * Render-only billing/founder context (Surface I, spec §5/§6). Returns the
 * backend state, or `BETA_BILLING_DEFAULTS` if the endpoint is missing/errors —
 * during beta everyone is a founding partner, so a safe default is correct.
 */
export async function getBillingState(): Promise<BillingState> {
  try {
    const res = await authFetch(`${API_BASE}/billing/state`);
    if (!res.ok) return BETA_BILLING_DEFAULTS;
    const data = await res.json();
    return { ...BETA_BILLING_DEFAULTS, ...data } as BillingState;
  } catch {
    return BETA_BILLING_DEFAULTS;
  }
}

export interface BillingPortalResult {
  success: boolean;
  portal_url?: string;
  error?: string;
}

export async function createBillingPortalSession(): Promise<BillingPortalResult> {
  try {
    const res = await authFetch(`${API_BASE}/billing/portal`, { method: "POST" });
    const data = await res.json();
    if (res.ok) return { success: true, portal_url: data.portal_url ?? data.url };
    return { success: false, error: extractError(data.detail, "Failed to open billing portal") };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

// ---- SuperAdmin API ----

export interface SuperAdminOrgsResult {
  success: boolean;
  data?: SuperAdminOrgsResponse;
  error?: string;
}

export async function superadminListOrgs(
  limit = 100,
  offset = 0
): Promise<SuperAdminOrgsResult> {
  try {
    const res = await authFetch(
      `${API_BASE}/admin/superadmin/orgs?limit=${limit}&offset=${offset}`
    );
    const data = await res.json();
    if (res.ok) return { success: true, data };
    return { success: false, error: data.detail || "Failed to list orgs" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export interface SuperAdminUsersResult {
  success: boolean;
  data?: SuperAdminUsersResponse;
  error?: string;
}

export async function superadminListUsers(
  limit = 100,
  offset = 0
): Promise<SuperAdminUsersResult> {
  try {
    const res = await authFetch(
      `${API_BASE}/admin/superadmin/users?limit=${limit}&offset=${offset}`
    );
    const data = await res.json();
    if (res.ok) return { success: true, data };
    return { success: false, error: data.detail || "Failed to list users" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export interface SuperAdminOrgDetailResult {
  success: boolean;
  org?: SuperAdminOrgDetail;
  error?: string;
}

export async function superadminGetOrg(orgId: string): Promise<SuperAdminOrgDetailResult> {
  try {
    const res = await authFetch(`${API_BASE}/admin/orgs/${orgId}`);
    const data = await res.json();
    if (res.ok) return { success: true, org: data };
    return { success: false, error: data.detail || "Org not found" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export async function superadminSuspendOrg(orgId: string): Promise<BasicResult> {
  try {
    const res = await authFetch(
      `${API_BASE}/admin/superadmin/orgs/${orgId}/suspend`,
      { method: "PATCH" }
    );
    if (res.ok) return { success: true };
    const data = await res.json();
    return { success: false, error: data.detail || "Failed to suspend org" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export async function superadminActivateOrg(orgId: string): Promise<BasicResult> {
  try {
    const res = await authFetch(
      `${API_BASE}/admin/superadmin/orgs/${orgId}/activate`,
      { method: "PATCH" }
    );
    if (res.ok) return { success: true };
    const data = await res.json();
    return { success: false, error: data.detail || "Failed to activate org" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export interface UpdateOrgSubscriptionPayload {
  tier?: string;
  paid_slots_limit?: number;
  free_slots_limit?: number;
  show_watermark?: boolean;
  /** Voice feature quotas (-1 = unlimited, 0 = not contracted). */
  stt_slots_limit?: number;
  tts_slots_limit?: number;
}

export async function superadminUpdateSubscription(
  orgId: string,
  payload: UpdateOrgSubscriptionPayload
): Promise<BasicResult> {
  try {
    const res = await authFetch(`${API_BASE}/admin/orgs/${orgId}/subscription`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) return { success: true };
    const data = await res.json();
    return { success: false, error: extractError(data.detail, "Failed to update subscription") };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export async function superadminSuspendUser(userId: string): Promise<BasicResult> {
  try {
    const res = await authFetch(
      `${API_BASE}/admin/superadmin/users/${userId}/suspend`,
      { method: "PATCH" }
    );
    if (res.ok) return { success: true };
    const data = await res.json();
    return { success: false, error: data.detail || "Failed to suspend user" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export async function superadminActivateUser(userId: string): Promise<BasicResult> {
  try {
    const res = await authFetch(
      `${API_BASE}/admin/superadmin/users/${userId}/activate`,
      { method: "PATCH" }
    );
    if (res.ok) return { success: true };
    const data = await res.json();
    return { success: false, error: data.detail || "Failed to activate user" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export async function superadminUpdateUser(
  userId: string,
  payload: { role?: UserRole; is_free_license?: boolean; allow_feedback?: boolean }
): Promise<BasicResult> {
  try {
    const res = await authFetch(
      `${API_BASE}/admin/superadmin/users/${userId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    if (res.ok) return { success: true };
    const data = await res.json();
    return { success: false, error: extractError(data.detail, "Failed to update user") };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export interface PromoteUserResult {
  success: boolean;
  data?: { org_id: string; role: UserRole };
  error?: string;
}

export async function superadminPromoteUser(userId: string): Promise<PromoteUserResult> {
  try {
    const res = await authFetch(
      `${API_BASE}/admin/superadmin/users/${userId}/promote`,
      { method: "POST" }
    );
    const data = await res.json();
    if (res.ok) return { success: true, data };
    return { success: false, error: extractError(data.detail, "Failed to promote user") };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export interface DeleteUserResult {
  status: "ok";
  user_id: string;
  email: string | null;
  tenant_existed: boolean;
  deleted: {
    tenant_user: boolean;
    conversations: number;
    user_odoo_credentials: number;
    pinned_insights: number;
    notifications: number;
    audit_logs: number;
    checkpoints: number;
    feedback_reports: number;
    analytics_events: number;
  };
  org_deleted: string | null;
  supabase_auth: "deleted" | "not_found" | "skipped_not_configured" | "failed";
  supabase_error: string | null;
}

export async function superadminDeleteUser(
  userId: string,
  opts: { deleteEmptyOrg?: boolean } = {}
): Promise<{ success: boolean; data?: DeleteUserResult; error?: string }> {
  try {
    const qs = opts.deleteEmptyOrg ? "?delete_empty_org=true" : "";
    const res = await authFetch(
      `${API_BASE}/admin/superadmin/users/${userId}${qs}`,
      { method: "DELETE" }
    );
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { success: true, data: data as DeleteUserResult };
    return { success: false, error: extractError(data.detail, "Failed to delete user") };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export async function superadminUpdateOrgType(
  orgId: string,
  type: OrgType
): Promise<BasicResult> {
  try {
    const res = await authFetch(`${API_BASE}/admin/orgs/${orgId}/type`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    });
    if (res.ok) return { success: true };
    const data = await res.json();
    return { success: false, error: extractError(data.detail, "Failed to update org type") };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

/**
 * SUPERADMIN: extend (or shorten) a founder org's free-beta window (Fase 0).
 * `days` > 0 adds days, < 0 removes them. Returns the updated clock + the
 * recomputed `days_left` so the caller can refresh its row without a reload.
 * Endpoint: POST /admin/orgs/{orgId}/founder/extend-beta  body: { days }
 */
export interface ExtendBetaResult {
  success: boolean;
  error?: string;
  founder_since?: string | null;
  beta_ends_at?: string | null;
  days_left?: number | null;
}

export async function superadminExtendFounderBeta(
  orgId: string,
  days: number
): Promise<ExtendBetaResult> {
  try {
    const res = await authFetch(`${API_BASE}/admin/orgs/${orgId}/founder/extend-beta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      return {
        success: true,
        founder_since: data.founder_since ?? null,
        beta_ends_at: data.beta_ends_at ?? null,
        days_left: typeof data.days_left === "number" ? data.days_left : null,
      };
    }
    return { success: false, error: extractError(data.detail, "Failed to extend beta window") };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

// ---- Feedback API ----

export interface SubmitFeedbackPayload {
  config_id: string;
  message_id?: string;
  user_comment?: string;
  category?: FeedbackCategory;
  expected_response?: string;
}

export interface SubmitFeedbackResult {
  success: boolean;
  id?: string;
  error?: string;
}

export async function submitFeedback(
  chatId: string,
  payload: SubmitFeedbackPayload
): Promise<SubmitFeedbackResult> {
  try {
    const res = await authFetch(`${API_BASE}/chat/${chatId}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok) return { success: true, id: data.id };
    return { success: false, error: data.detail || "Failed to submit feedback" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export interface FetchFeedbackParams {
  status?: FeedbackStatus;
  category?: FeedbackCategory;
  org_id?: string;
  include_hidden?: boolean;
  limit?: number;
  offset?: number;
}

export interface FetchFeedbackResult {
  success: boolean;
  data?: FeedbackListResponse;
  error?: string;
}

export async function fetchAdminFeedback(
  params?: FetchFeedbackParams
): Promise<FetchFeedbackResult> {
  try {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.category) query.set("category", params.category);
    if (params?.org_id) query.set("org_id", params.org_id);
    if (params?.include_hidden) query.set("include_hidden", "true");
    if (params?.limit != null) query.set("limit", String(params.limit));
    if (params?.offset != null) query.set("offset", String(params.offset));
    const qs = query.toString() ? `?${query.toString()}` : "";
    const res = await authFetch(`${API_BASE}/admin/feedback${qs}`);
    const data = await res.json();
    if (res.ok) return { success: true, data };
    return { success: false, error: data.detail || "Failed to fetch feedback" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export interface UpdateFeedbackPayload {
  status?: FeedbackStatus;
  admin_notes?: string;
  is_hidden?: boolean;
}

export interface UpdateFeedbackResult {
  success: boolean;
  report?: FeedbackReport;
  error?: string;
}

export async function updateFeedbackReport(
  reportId: string,
  payload: UpdateFeedbackPayload
): Promise<UpdateFeedbackResult> {
  try {
    const res = await authFetch(`${API_BASE}/admin/feedback/${reportId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok) return { success: true, report: data.report };
    return { success: false, error: data.detail || "Failed to update report" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export async function deleteFeedbackReport(reportId: string): Promise<BasicResult> {
  try {
    const res = await authFetch(`${API_BASE}/admin/feedback/${reportId}`, {
      method: "DELETE",
    });
    if (res.ok) return { success: true };
    const data = await res.json();
    return { success: false, error: data.detail || "Failed to delete report" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export interface FetchFeedbackStatsResult {
  success: boolean;
  data?: FeedbackStats;
  error?: string;
}

export async function fetchFeedbackStats(orgId?: string): Promise<FetchFeedbackStatsResult> {
  try {
    const query = new URLSearchParams();
    if (orgId) query.set("org_id", orgId);
    const qs = query.toString() ? `?${query.toString()}` : "";
    const res = await authFetch(`${API_BASE}/admin/feedback/stats${qs}`);
    const data = await res.json();
    if (res.ok) return { success: true, data };
    return { success: false, error: data.detail || "Failed to fetch stats" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

// ---- Analytics events (superadmin) ----

export interface FetchEventsParams {
  event?: string;
  session_id?: string;
  utm_source?: string;
  utm_campaign?: string;
  date_from?: string;
  date_to?: string;
  has_user?: boolean;
  limit?: number;
  offset?: number;
}

export interface FetchEventsListResult {
  success: boolean;
  data?: AnalyticsEventsListResponse;
  error?: string;
}

export async function fetchAdminEvents(
  params?: FetchEventsParams
): Promise<FetchEventsListResult> {
  try {
    const query = new URLSearchParams();
    if (params?.event) query.set("event", params.event);
    if (params?.session_id) query.set("session_id", params.session_id);
    if (params?.utm_source) query.set("utm_source", params.utm_source);
    if (params?.utm_campaign) query.set("utm_campaign", params.utm_campaign);
    if (params?.date_from) query.set("date_from", params.date_from);
    if (params?.date_to) query.set("date_to", params.date_to);
    if (params?.has_user != null) query.set("has_user", String(params.has_user));
    if (params?.limit != null) query.set("limit", String(params.limit));
    if (params?.offset != null) query.set("offset", String(params.offset));
    const qs = query.toString() ? `?${query.toString()}` : "";
    const res = await authFetch(`${API_BASE}/admin/events${qs}`);
    const data = await res.json();
    if (res.ok) return { success: true, data };
    return { success: false, error: data.detail || "Failed to fetch events" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export interface FetchEventsStatsParams {
  date_from?: string;
  date_to?: string;
  utm_source?: string;
  utm_campaign?: string;
}

export interface FetchEventsStatsResult {
  success: boolean;
  data?: AnalyticsEventsStats;
  error?: string;
}

export async function fetchEventsStats(
  params?: FetchEventsStatsParams
): Promise<FetchEventsStatsResult> {
  try {
    const query = new URLSearchParams();
    if (params?.date_from) query.set("date_from", params.date_from);
    if (params?.date_to) query.set("date_to", params.date_to);
    if (params?.utm_source) query.set("utm_source", params.utm_source);
    if (params?.utm_campaign) query.set("utm_campaign", params.utm_campaign);
    const qs = query.toString() ? `?${query.toString()}` : "";
    const res = await authFetch(`${API_BASE}/admin/events/stats${qs}`);
    const data = await res.json();
    if (res.ok) return { success: true, data };
    return { success: false, error: data.detail || "Failed to fetch event stats" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export interface FetchFeedbackReportResult {
  success: boolean;
  report?: FeedbackReport;
  error?: string;
}

export async function updateTenantNotes(
  chatId: string,
  feedbackId: string,
  tenantNotes: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await authFetch(`${API_BASE}/chat/${chatId}/feedback/${feedbackId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_notes: tenantNotes }),
    });
    if (res.ok) return { success: true };
    const data = await res.json();
    return { success: false, error: data.detail || "Failed to save note" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export async function fetchFeedbackReport(reportId: string): Promise<FetchFeedbackReportResult> {
  try {
    const res = await authFetch(`${API_BASE}/admin/feedback/${reportId}`);
    const data = await res.json();
    if (res.ok) return { success: true, report: data.report };
    return { success: false, error: data.detail || "Failed to fetch report" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

// ---------------------------------------------------------------------------
// Rutinas (PLAN_RUTINAS Fase 1)
// ---------------------------------------------------------------------------

export interface ListRoutinesResult {
  success: boolean;
  routines?: Routine[];
  /** Las que esta instancia NO puede correr, con su motivo (§9). */
  unavailable?: Routine[];
  error?: string;
}

/**
 * El catálogo visible para el usuario.
 *
 * Pasar `configId` es importante: el backend filtra contra el `CapabilityProfile` real
 * de esa instancia (invariante #7 del programa — nada se oferta si la instancia no lo
 * soporta). Sin él devuelve todo, porque no hay instancia contra la cual medir.
 */
export async function listRoutines(
  configId?: string,
  language = "es"
): Promise<ListRoutinesResult> {
  try {
    const params = new URLSearchParams({ language });
    if (configId) params.set("config_id", configId);
    const res = await authFetch(`${API_BASE}/routines?${params}`);
    const data = await res.json();
    // `unavailable` son las Rutinas que ESTA instancia no puede correr, con su
    // motivo (§9: el catálogo explica lo que oculta). No se mezclan con las
    // disponibles: no se ofertan, se explican.
    if (res.ok)
      return {
        success: true,
        routines: data.routines ?? [],
        unavailable: data.unavailable ?? [],
      };
    return { success: false, error: data.detail || "Failed to fetch routines" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export interface RunRoutineResult {
  success: boolean;
  runId?: string;
  /** `429` = tope de corridas simultáneas (A8). Es una espera, no una falla. */
  rateLimited?: boolean;
  /** `409` = la instancia elegida no cumple el `requires` de la Rutina. */
  notAvailable?: boolean;
  error?: string;
}

export async function runRoutine(
  routineId: string,
  configId: string,
  params: Record<string, unknown> = {},
  language = "es"
): Promise<RunRoutineResult> {
  try {
    const res = await authFetch(`${API_BASE}/routines/${routineId}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config_id: configId, params, language }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { success: true, runId: data.run_id };
    if (res.status === 429) return { success: false, rateLimited: true, error: "too_many_runs" };
    // 409 = la instancia no cumple el `requires` de la Rutina. Se distingue del error
    // genérico porque desde que se puede ELEGIR instancia al ejecutar es un desenlace
    // esperable —el catálogo se filtró contra la instancia activa, no contra la elegida—
    // y el mensaje tiene que nombrar la instancia, no decir "no se pudo iniciar".
    if (res.status === 409) return { success: false, notAvailable: true, error: "not_available" };
    const detail = typeof data.detail === "string" ? data.detail : data.detail?.error_code;
    return { success: false, error: detail || "Failed to start routine" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export interface RoutineRunResult {
  success: boolean;
  run?: RoutineRunDetail;
  error?: string;
}

/** Estado + progreso de una corrida. Es lo que el front pollea cada 2s. */
export async function fetchRoutineRun(runId: string): Promise<RoutineRunResult> {
  try {
    const res = await authFetch(`${API_BASE}/routines/runs/${runId}`);
    const data = await res.json();
    if (res.ok) return { success: true, run: data };
    return { success: false, error: data.detail || "Failed to fetch run" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export interface ListRoutineRunsResult {
  success: boolean;
  runs?: RoutineRunSummary[];
  error?: string;
}

export async function listRoutineRuns(limit = 20): Promise<ListRoutineRunsResult> {
  try {
    const res = await authFetch(`${API_BASE}/routines/runs?limit=${limit}`);
    const data = await res.json();
    if (res.ok) return { success: true, runs: data.runs ?? [] };
    return { success: false, error: data.detail || "Failed to fetch runs" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

/**
 * Borra UNA corrida del historial. El backend la scopea por org Y usuario, así
 * que un id ajeno devuelve 404 — no confirma ni que exista.
 *
 * ⚠️ Es irreversible y arrastra los checkpoints de LangGraph de esa corrida. NO
 * toca los pins que la Rutina haya publicado en el Tablero: esos viven por
 * Rutina, no por corrida, y borrarlos acá haría que el Tablero se vacíe solo.
 */
export async function deleteRoutineRun(
  runId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await authFetch(`${API_BASE}/routines/runs/${runId}`, {
      method: "DELETE",
    });
    if (res.ok) return { success: true };
    const data = await res.json().catch(() => ({}));
    return { success: false, error: data.detail || "Failed to delete run" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

/**
 * Vacía el historial del usuario. **Sólo el suyo** — no existe "borrar el de la
 * org": una corrida se ejecutó con las credenciales de una persona, así que sus
 * números son los que Odoo le deja ver a ella.
 */
export async function deleteAllRoutineRuns(): Promise<{
  success: boolean;
  deleted?: number;
  error?: string;
}> {
  try {
    const res = await authFetch(`${API_BASE}/routines/runs`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { success: true, deleted: data.deleted };
    return { success: false, error: data.detail || "Failed to clear history" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export interface RegenerateRunResult {
  success: boolean;
  pdfBase64?: string;
  filename?: string;
  error?: string;
}

/**
 * Rearma el entregable **desde los resultados guardados** — instantáneo, sin tocar Odoo
 * (decisión A7). Es el botón *Regenerar*, distinto de *Volver a correr*: los archivos
 * viven ~10 minutos, los resultados quedan.
 */
export async function regenerateRoutineRun(
  runId: string,
  language = "es"
): Promise<RegenerateRunResult> {
  try {
    const res = await authFetch(`${API_BASE}/routines/runs/${runId}/regenerate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok)
      return { success: true, pdfBase64: data.pdf_base64, filename: data.filename };
    return { success: false, error: data.detail || "Failed to regenerate" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export interface FetchRoutineResult {
  success: boolean;
  routine?: Routine;
  error?: string;
}

/**
 * Definición de una Rutina, **con sus pasos localizados**.
 *
 * El catálogo (`listRoutines`) no los trae a propósito: con 20 Rutinas × 12 pasos sería
 * una carga inútil en una pantalla que sólo muestra tarjetas. La barra de progreso sí los
 * necesita — sin ellos muestra las claves crudas (`clientes_sin_vat`) en vez de "Clientes
 * sin identificación fiscal", y el progreso paso a paso deja de comunicar nada.
 */
export async function fetchRoutine(
  routineId: string,
  configId?: string,
  language = "es"
): Promise<FetchRoutineResult> {
  try {
    const params = new URLSearchParams({ language });
    if (configId) params.set("config_id", configId);
    const res = await authFetch(`${API_BASE}/routines/${routineId}?${params}`);
    const data = await res.json();
    if (res.ok) return { success: true, routine: data };
    return { success: false, error: data.detail || "Failed to fetch routine" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

/**
 * Excel de un LISTADO crudo (quick-wins §6) → `{xlsx_base64, filename, mimetype}`.
 *
 * Hermano de `executeAggReportAction`: mismo endpoint `/action`, misma descarga
 * directa por Blob. No pasa por el flujo de tarjeta de éxito — el usuario pidió un
 * archivo, no una confirmación.
 */
export async function executeListingExcelAction(
  chatId: string,
  opt: ReportOfferOption,
  configId: string,
  locale: string
): Promise<{
  success: boolean;
  result?: { xlsx_base64: string; filename: string; mimetype: string; record_count: number };
  error?: string;
}> {
  try {
    const res = await authFetch(`${API_BASE}/chat/${chatId}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        config_id: configId,
        language: locale,
        action: "report_listing_excel",
        context: {
          action: "report_listing_excel",
          model: opt.model,
          vals: {},
          domain: opt.domain,
          total_count: opt.total_count,
        },
      }),
    });
    const data = await res.json();
    if (data.status === "ok") return { success: true, result: data.result };
    return { success: false, error: data.detail || data.message || "Action failed" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

/**
 * `{modelo: cantidad}` de la instancia (quick-wins §7) — para filtrar las
 * sugerencias del chat contra lo que el tenant realmente usa.
 *
 * **Best-effort y no bloqueante:** un fallo devuelve `{}`, que el filtro
 * interpreta como "no lo sabemos" y muestra todas las sugerencias. Sugerir de más
 * es mucho mejor que esconderle al usuario algo que sí podía preguntar.
 */
export async function fetchInstanceUsage(
  configId: string
): Promise<Record<string, number>> {
  try {
    const res = await authFetch(
      `${API_BASE}/routines/instance-usage?config_id=${encodeURIComponent(configId)}`
    );
    if (!res.ok) return {};
    const data = await res.json();
    return (data.usage ?? {}) as Record<string, number>;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Rutinas — autoría y permisos (PLAN_RUTINAS Fase 3)
// ---------------------------------------------------------------------------

/**
 * Resultado de un endpoint de autoría.
 *
 * ⚠️ `rejected` NO es un error: es la lista de frases que no pueden ser un paso, **con su
 * motivo**. La Rutina se creó igual con las que sí sirven. El front las muestra como
 * aviso, nunca como falla — descartar la creación entera porque una de cinco preguntas
 * era un follow-up sería el peor final posible para el camino primario de la fase.
 */
export interface RoutineMutationResult {
  success: boolean;
  routine?: Routine;
  rejected?: RoutineStepReview[];
  /** `422` con ningún paso utilizable: acá viaja el porqué de cada uno. */
  rejectedAll?: RoutineStepReview[];
  errorCode?: string;
  error?: string;
}

async function routineMutation(
  path: string,
  init: RequestInit
): Promise<RoutineMutationResult> {
  try {
    const res = await authFetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      const { rejected, ...routine } = data ?? {};
      return { success: true, routine: routine as Routine, rejected: rejected ?? [] };
    }
    const detail = data?.detail;
    if (detail && typeof detail === "object") {
      return {
        success: false,
        errorCode: detail.error_code,
        rejectedAll: detail.rejected ?? undefined,
        error: detail.message ?? detail.error_code,
      };
    }
    return { success: false, error: detail || "Routine request failed" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export interface CreateRoutineOptions {
  name: string;
  steps: string[];
  description?: string;
  icon?: string;
  scope?: RoutineScope;
  language?: string;
  /** Informativo: contra qué instancia se escribió. **Nunca** filtra ni gatea (D6). */
  configId?: string;
}

/** Crea una Rutina. **Cualquiera de la org puede** — `CLIENT_USER` incluido (D3). */
export async function createRoutine(
  opt: CreateRoutineOptions
): Promise<RoutineMutationResult> {
  return routineMutation("/routines", {
    method: "POST",
    body: JSON.stringify({
      name: opt.name,
      steps: opt.steps,
      description: opt.description ?? "",
      icon: opt.icon ?? "Compass",
      scope: opt.scope ?? "private",
      language: opt.language ?? "es",
      config_id: opt.configId ?? null,
    }),
  });
}

/**
 * Dictamina cada mensaje de un chat **sin crear nada** (F1).
 *
 * Se llama al ABRIR el selector, no al guardar: enterarse de que la mitad de lo que
 * seleccionaste no servía después de ponerle nombre a la Rutina es la peor secuencia
 * posible. Con esto los checkboxes ya salen deshabilitados y con su motivo.
 */
export async function reviewConversationForRoutine(
  chatId: string,
  language = "es"
): Promise<{ success: boolean; review?: RoutineConversationReview; error?: string }> {
  try {
    const res = await authFetch(`${API_BASE}/routines/review-conversation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, language }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { success: true, review: data };
    return { success: false, error: data?.detail || "Failed to review conversation" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

/** Guarda una conversación como Rutina — el camino primario de la fase (§3.1). */
export async function createRoutineFromConversation(opt: {
  chatId: string;
  name: string;
  messageIds: string[];
  scope?: RoutineScope;
  language?: string;
  configId?: string;
}): Promise<RoutineMutationResult> {
  return routineMutation("/routines/from-conversation", {
    method: "POST",
    body: JSON.stringify({
      chat_id: opt.chatId,
      name: opt.name,
      message_ids: opt.messageIds,
      scope: opt.scope ?? "private",
      language: opt.language ?? "es",
      config_id: opt.configId ?? null,
    }),
  });
}

/** Edita una Rutina (autor o ADMIN). Mandar `steps` **incrementa la versión** (§10). */
export async function updateRoutine(
  routineId: string,
  patch: {
    name?: string;
    steps?: string[];
    description?: string;
    icon?: string;
    scope?: RoutineScope;
    language?: string;
  }
): Promise<RoutineMutationResult> {
  return routineMutation(`/routines/${routineId}`, {
    method: "PATCH",
    body: JSON.stringify({ language: "es", ...patch }),
  });
}

export async function deleteRoutine(
  routineId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await authFetch(`${API_BASE}/routines/${routineId}`, {
      method: "DELETE",
    });
    if (res.ok) return { success: true };
    const data = await res.json().catch(() => ({}));
    return { success: false, error: data?.detail || "Failed to delete routine" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

/**
 * Clona una Rutina en una copia propia (§3.2).
 *
 * ⚠️ La copia queda **independiente para siempre** ([D8]): cuando mejoremos la del
 * catálogo, las copias no se tocan. No existe "actualizar desde la original" y no está
 * previsto que exista — sorprender a alguien cambiándole una Rutina que funcionaba es
 * peor que dejarla vieja.
 */
export async function forkRoutine(
  routineId: string,
  name?: string,
  language = "es"
): Promise<RoutineMutationResult> {
  return routineMutation(`/routines/${routineId}/fork`, {
    method: "POST",
    body: JSON.stringify({ name: name ?? null, language }),
  });
}

/**
 * Compartir = pasar de `private` a `org`. Lo puede hacer el autor **o el ADMIN**.
 *
 * Recién compartida es **visible para todos** salvo que el admin la restrinja: el
 * default deliberado de §3.4 — restringir por defecto haría que compartir no sirva de
 * nada.
 */
export async function shareRoutine(
  routineId: string,
  shared: boolean
): Promise<{ success: boolean; scope?: RoutineScope; error?: string }> {
  try {
    const res = await authFetch(`${API_BASE}/routines/${routineId}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shared }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { success: true, scope: data.scope };
    return { success: false, error: data?.detail || "Failed to share routine" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

/** Autoría asistida (B7): el agente propone pasos para un objetivo en prosa. */
export async function proposeRoutineSteps(
  goal: string,
  language = "es"
): Promise<{ success: boolean; steps?: RoutineStepReview[]; assisted?: boolean }> {
  try {
    const res = await authFetch(`${API_BASE}/routines/propose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal, language }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok)
      return { success: true, steps: data.steps ?? [], assisted: data.assisted };
    return { success: false };
  } catch {
    // Sin LLM disponible la lista vuelve vacía: la autoría asistida es el
    // COMPLEMENTO, nunca el camino crítico (§3.3).
    return { success: false };
  }
}

/**
 * Corre los pasos sin persistir nada y devuelve qué daría cada uno HOY (B5, §3.3).
 *
 * Es la salvaguarda que hace segura la autoría: convierte "esta frase parece razonable"
 * en "esta frase devuelve esto". **Toma un lugar de concurrencia** igual que una corrida
 * real (A8), así que puede dar `429`.
 */
export async function dryRunRoutine(opt: {
  configId: string;
  routineId?: string;
  steps?: string[];
  params?: Record<string, unknown>;
  language?: string;
}): Promise<{
  success: boolean;
  result?: RoutineDryRun;
  rateLimited?: boolean;
  error?: string;
}> {
  try {
    const res = await authFetch(`${API_BASE}/routines/dry-run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        config_id: opt.configId,
        routine_id: opt.routineId ?? null,
        steps: opt.steps ?? [],
        params: opt.params ?? {},
        language: opt.language ?? "es",
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { success: true, result: data };
    if (res.status === 429) return { success: false, rateLimited: true };
    return { success: false, error: data?.detail?.message || "Dry-run failed" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

/** La matriz Rutina × usuario del ADMIN (F4). */
export async function fetchRoutineGrants(
  orgId: string,
  language = "es"
): Promise<{ success: boolean; matrix?: RoutineGrantsMatrix; error?: string }> {
  try {
    const res = await authFetch(
      `${API_BASE}/admin/orgs/${orgId}/routines/grants?language=${language}`
    );
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { success: true, matrix: data };
    return { success: false, error: data?.detail || "Failed to fetch grants" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

/**
 * Habilita/deshabilita una Rutina para un usuario, o para toda la org.
 *
 * ⚠️ `enabled: null` **borra** el grant en vez de apagarlo — el usuario vuelve a heredar
 * el default de la org y, si no hay, el `scope`. Son tres estados distintos; no los
 * colapses en un booleano al llamar.
 */
export async function setRoutineGrant(opt: {
  orgId: string;
  routineId: string;
  userId?: string | null;
  enabled: boolean | null;
}): Promise<{ success: boolean; grants?: RoutineGrant[]; errorCode?: string }> {
  try {
    const res = await authFetch(
      `${API_BASE}/admin/orgs/${opt.orgId}/routines/${opt.routineId}/grants`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: opt.userId ?? null, enabled: opt.enabled }),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { success: true, grants: data.grants ?? [] };
    return { success: false, errorCode: data?.detail?.error_code };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false };
  }
}

/**
 * Dictamina frases sueltas mientras se escriben (F3) — sin crear nada.
 *
 * El hermano de `reviewConversationForRoutine` para el editor. Es puro del lado del
 * backend (sin red, sin Odoo, sin LLM), así que es barato llamarlo con debounce.
 */
export async function reviewRoutineSteps(
  steps: string[],
  language = "es"
): Promise<RoutineStepReview[]> {
  try {
    const res = await authFetch(`${API_BASE}/routines/review-steps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ steps, language }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.steps ?? []) as RoutineStepReview[];
  } catch {
    // Un fallo de red no puede bloquear el editor: se guarda igual y el backend
    // revalida — la validación de acá es una ayuda, no la puerta.
    return [];
  }
}

// ---------------------------------------------------------------------------
// Agendado de Rutinas (Fase 4)
// ---------------------------------------------------------------------------

export interface RoutineSchedulesResult {
  success: boolean;
  schedules?: RoutineSchedule[];
  error?: string;
}

export interface RoutineScheduleResult {
  success: boolean;
  schedule?: RoutineSchedule;
  error?: string;
  /** La instancia dejó de cumplir `requires` (409) — no se puede agendar. */
  notAvailable?: boolean;
}

/** "Mis agendados". Sólo los del llamador: cada uno corre con SUS credenciales. */
export async function listMyRoutineSchedules(
  routineId?: string
): Promise<RoutineSchedulesResult> {
  try {
    const qs = routineId ? `?routine_id=${encodeURIComponent(routineId)}` : "";
    const res = await authFetch(`${API_BASE}/routines/schedules${qs}`);
    const data = await res.json();
    if (res.ok) return { success: true, schedules: data.schedules ?? [] };
    return { success: false, error: data.detail || "Failed to fetch schedules" };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

/**
 * Agenda una Rutina.
 *
 * ⚠️ **No mandar `timezone` es lo normal**: sin ese campo el backend resuelve la del
 * perfil del usuario (`resolve_user_timezone`). Mandar la del browser
 * (`Intl.DateTimeFormat().resolvedOptions().timeZone`) haría que agendar desde un
 * aeropuerto fijara el digest en la zona del aeropuerto.
 */
export async function createRoutineSchedule(opt: {
  routineId: string;
  configId: string;
  cadence: RoutineCadence;
  hourLocal: number;
  params?: Record<string, unknown>;
  language?: string;
  weekday?: number | null;
  dayOfMonth?: number | null;
  timezone?: string;
}): Promise<RoutineScheduleResult> {
  try {
    const res = await authFetch(
      `${API_BASE}/routines/${encodeURIComponent(opt.routineId)}/schedule`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config_id: opt.configId,
          cadence: opt.cadence,
          hour_local: opt.hourLocal,
          params: opt.params ?? {},
          language: opt.language ?? "es",
          weekday: opt.weekday ?? null,
          day_of_month: opt.dayOfMonth ?? null,
          ...(opt.timezone ? { timezone: opt.timezone } : {}),
        }),
      }
    );
    const data = await res.json();
    if (res.ok) return { success: true, schedule: data };
    if (res.status === 409) return { success: false, notAvailable: true };
    return { success: false, error: extractError(data.detail, "Failed to save schedule") };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

/** Edita un agendado propio. Incluye el on/off (`isActive`). */
export async function updateRoutineSchedule(
  scheduleId: string,
  patch: {
    cadence?: RoutineCadence;
    hourLocal?: number;
    params?: Record<string, unknown>;
    language?: string;
    weekday?: number | null;
    dayOfMonth?: number | null;
    timezone?: string;
    isActive?: boolean;
  }
): Promise<RoutineScheduleResult> {
  try {
    const res = await authFetch(`${API_BASE}/routines/schedules/${scheduleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(patch.cadence !== undefined ? { cadence: patch.cadence } : {}),
        ...(patch.hourLocal !== undefined ? { hour_local: patch.hourLocal } : {}),
        ...(patch.params !== undefined ? { params: patch.params } : {}),
        ...(patch.language !== undefined ? { language: patch.language } : {}),
        ...(patch.weekday !== undefined ? { weekday: patch.weekday } : {}),
        ...(patch.dayOfMonth !== undefined ? { day_of_month: patch.dayOfMonth } : {}),
        ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}),
        ...(patch.isActive !== undefined ? { is_active: patch.isActive } : {}),
      }),
    });
    const data = await res.json();
    if (res.ok) return { success: true, schedule: data };
    return { success: false, error: extractError(data.detail, "Failed to save schedule") };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

export async function deleteRoutineSchedule(
  scheduleId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await authFetch(`${API_BASE}/routines/schedules/${scheduleId}`, {
      method: "DELETE",
    });
    if (res.ok) return { success: true };
    const data = await res.json().catch(() => ({}));
    return { success: false, error: extractError(data.detail, "Failed to save schedule") };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}

/**
 * Fija (o limpia, con `null`) la zona horaria del usuario.
 *
 * Es lo que decide a qué hora llega un digest. `null` NO es "UTC": devuelve al usuario
 * al default de su organización, que es un estado distinto y visible en el selector.
 */
export async function setMyTimezone(
  timezone: string | null
): Promise<{ success: boolean; timezone?: string | null; effective?: string; error?: string }> {
  try {
    const res = await authFetch(`${API_BASE}/me/timezone`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone }),
    });
    const data = await res.json();
    if (res.ok) {
      return { success: true, timezone: data.timezone, effective: data.effective_timezone };
    }
    return { success: false, error: extractError(data.detail, "Failed to save schedule") };
  } catch (err) {
    if (err instanceof LimitReachedError) throw err;
    return { success: false, error: NETWORK_ERROR };
  }
}
