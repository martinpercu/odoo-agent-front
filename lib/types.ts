// Message metadata types for structured responses
export interface ActionSuccessMetadata {
  type: "action_success";
  action: string;
  recordId: string | number;
  recordName?: string;
  model?: string;
  odooUrl?: string;
  actionType?: "method_call" | "crud";
  actionMessage?: string;
}

export interface ValidationErrorMetadata {
  type: "validation_error";
  action: string;
  missingFields: string[];
  providedData?: Record<string, unknown>;
}

export interface ActionPromptMetadata {
  type: "action_prompt";
  action: string;
  actionLabel: string;
  action_btn?: string;
  recordId?: string | number;
  context?: Record<string, unknown>;
}

// Backend action proposal format (from SSE)
export interface ActionContext {
  action: "create" | "update" | "method_call" | "report" | "report_combined";
  model: string;
  vals: Record<string, unknown>;
  target_ids: number[] | null;
  method: string | null;
  canonical_verb: string | null;
  status: "pending_confirmation";
  // report_combined carries `sections` — re-forwarded to /action verbatim.
  sections?: unknown;
  // report_offer: domain-based report (no target_ids — backend resolves ids from domain).
  domain?: unknown[];
  total_count?: number;
}

export interface ActionLabelValue {
  label: string;
  value: string;
}

export interface ActionLabels {
  confirm_btn: string;
  cancel_btn: string;
  action_btn: string;
  cancelled_msg: string;
  values?: ActionLabelValue[];
}

export interface ActionProposalMetadata {
  type: "action_proposal";
  action: ActionContext;
  labels: ActionLabels;
}

// Selection prompt for ambiguity resolution (from SSE)
export interface SelectionOption {
  index: number;
  id: number;
  name: string;
}

// Entity-disambiguation variant (no `kind` field).
export interface SelectionPromptMetadata {
  type: "selection_prompt";
  field: string;
  searchValue: string;
  options: SelectionOption[];
}

// Report-type disambiguation variant (`kind: "report_type"`). The user clicks a
// button → the `value` is sent as a normal chat message to /chat/{id}/stream.
export interface ReportTypeOption {
  value: string;
  label: string;
}

export interface ReportTypeSelectionMetadata {
  type: "selection_prompt";
  kind: "report_type";
  options: ReportTypeOption[];
}

export interface PartnerFilterSelectionMetadata {
  type: "selection_prompt";
  kind: "partner_filter";
  options: ReportTypeOption[];
}

export interface SalespersonTypeSelectionMetadata {
  type: "selection_prompt";
  kind: "salesperson_type";
  options: ReportTypeOption[];
}

export interface ContactTypeSelectionMetadata {
  type: "selection_prompt";
  kind: "contact_type";
  options: ReportTypeOption[];
}

export interface PersonDisambiguationSelectionMetadata {
  type: "selection_prompt";
  kind: "person_disambiguation";
  role?: string;
  tooMany?: boolean;
  options: ReportTypeOption[];
}

export interface PersonRoleSelectionMetadata {
  type: "selection_prompt";
  kind: "person_role";
  options: ReportTypeOption[];
}

// Report offer: a single "Generar PDF" button that POSTs to /action directly.
// Clicking must NOT send the option as a chat message.
export interface ReportOfferOption {
  value: string;
  label: string;
  /**
   * `report` = el PDF plano de siempre. `report_listing_excel` = el mismo listado
   * con TODAS sus columnas en un .xlsx (quick-wins §6): un PDF no se filtra, no se
   * ordena y no se pega en otra planilla.
   */
  action: "report" | "report_listing_excel";
  model: string;
  vals: Record<string, unknown>;
  domain: unknown[];
  total_count: number;
}

export interface ReportOfferSelectionMetadata {
  type: "selection_prompt";
  kind: "report_offer";
  options: ReportOfferOption[];
}

// Aggregation report offer: two buttons (PDF + Excel) that POST to /action directly.
// Clicking must NOT send the option as a chat message — the card is non-blocking.
// `payload` is the canonical chart payload round-tripped verbatim as the action context.
export interface AggReportOption {
  label: string;
  value: "__agg_report_pdf__" | "__agg_report_excel__";
  action: "report_grouped";
  format: "pdf" | "excel";
  payload: unknown;
}

export interface AggReportSelectionMetadata {
  type: "selection_prompt";
  kind: "agg_report";
  reason: "too_many" | "explicit";
  groupCount: number;
  options: AggReportOption[];
}

// Stage drill-down: one chip per CRM stage. Clicking sends `value` as a normal
// chat message (verbatim) — the same non-blocking pattern as report_offer.
// `stageId`/`count` are informational only (React key / analytics) and must
// never be sent to the backend.
export interface StageDrilldownOption {
  label: string;
  value: string;
  stageId: number;
  count: number;
}

export interface StageDrilldownSelectionMetadata {
  type: "selection_prompt";
  kind: "stage_drilldown";
  options: StageDrilldownOption[];
}

// All `selection_prompt` variants that carry a `kind` field and button options.
export type KindedSelectionMetadata =
  | ReportTypeSelectionMetadata
  | PartnerFilterSelectionMetadata
  | SalespersonTypeSelectionMetadata
  | ContactTypeSelectionMetadata
  | PersonDisambiguationSelectionMetadata
  | PersonRoleSelectionMetadata
  | ReportOfferSelectionMetadata
  | AggReportSelectionMetadata
  | StageDrilldownSelectionMetadata;

// File attachment for PDF reports (from action response).
// The PDF now arrives in-memory as base64 (no persisted URL) and is downloaded
// "al aire" via a Blob — see downloadActionReport in odoo-file-card.tsx.
export interface FileAttachmentMetadata {
  type: "file_attachment";
  filename: string;
  pdf_base64?: string; // new: the whole PDF, base64 (live download)
  mimetype?: string; // new: e.g. "application/pdf"
  file_url?: string; // legacy: static /static/reports/<id>.pdf (pre-base64 pins only)
}

// Action response result types
export type ActionResult =
  | { action: "create"; model: string; id: number }
  | { action: "update"; model: string; ids: number[]; success: boolean }
  | { action: "method_call"; model: string; method: string; ids: number[]; method_result: unknown }
  | { action: "report"; model: string; ids: number[]; pdf_base64: string; filename: string; mimetype: string }
  | { action: "report_combined"; model?: string; ids?: number[]; pdf_base64: string; filename: string; mimetype: string }
  | { action: "report_grouped"; format: "pdf" | "excel"; pdf_base64?: string; xlsx_base64?: string; filename: string; mimetype: string };

export interface ExcelExportMetadata {
  type: "excel_export";
  export_url: string;
  filename: string;
}

export interface NoCredentialsMetadata {
  type: "no_credentials";
  config_id: string;
}

export type MessageMetadata =
  | ActionSuccessMetadata
  | ValidationErrorMetadata
  | ActionPromptMetadata
  | ActionProposalMetadata
  | SelectionPromptMetadata
  | ReportTypeSelectionMetadata
  | PartnerFilterSelectionMetadata
  | SalespersonTypeSelectionMetadata
  | ContactTypeSelectionMetadata
  | PersonDisambiguationSelectionMetadata
  | PersonRoleSelectionMetadata
  | ReportOfferSelectionMetadata
  | AggReportSelectionMetadata
  | StageDrilldownSelectionMetadata
  | FileAttachmentMetadata
  | ExcelExportMetadata
  | NoCredentialsMetadata;

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  metadata?: MessageMetadata;
  charts?: ChartSSEEvent[];
  recordLinks?: RecordLinksEvent[];
  imageUrl?: string;
  /** Whether to show "Powered by The Odoo Agent" watermark. Undefined = show (safe default). */
  watermark?: boolean;
}

export interface Chat {
  id: string;
  /** DB conversation ID — needed for DELETE and other endpoints that use the real DB id, not thread_id */
  conversationId?: string;
  /**
   * La instancia Odoo contra la que se habló este chat, estampada por el backend en el
   * primer mensaje. Abrir el chat SELECCIONA esta instancia (ver `AppShell`), así que el
   * cartel del sidebar y el `config_id` del stream siempre coinciden con lo que se está
   * leyendo. ⚠️ `null`/`undefined` es "no sabemos" (chats anteriores al estampado, o demo),
   * NO "ninguna": esos no cambian la instancia activa y se listan siempre.
   */
  configId?: string | null;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatGroup {
  label: string;
  chats: Chat[];
}

export interface Plan {
  id: string;
  name: string;
  price: number | null;
  priceLabel: string;
  description: string;
  features: string[];
  highlighted: boolean;
  cta: string;
}

export interface OdooConfig {
  url: string;
  db: string;
  login: string;
  apiKey: string;
}

// Chart types for analytics visualization (from SSE)
export interface ChartDataPoint {
  label: string;
  value: number;
}

export interface ChartMeta {
  value_label: string;
  value_format: "currency" | "number" | "integer" | "decimal";
  currency_symbol: string;
  currency_iso: string | null;
  no_decimals: boolean;
  group_by: string;
  model: string;
  period: string | null;
  total: number;
}

export type PinVolatility = "variable" | "static";

export interface PinQueryContext {
  primary_model?: string;
  dynamic_domain?: unknown[];
  date_filter?: { start?: string; end?: string; field?: string; period?: string };
  groupby_fields?: string[];
  classified_areas?: string[];
  volatility?: PinVolatility;
}

/**
 * El período global del Tablero (Fase 5 · §3.1). Rango ABSOLUTO, nunca una frase: el
 * selector lo resuelve acá y el backend lo aplica tal cual. Mandar "este trimestre"
 * obligaría al backend a interpretar texto en un endpoint que no pasa por el agente.
 */
export interface DashboardPeriod {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
}

/**
 * Qué se puede hacer con una tarjeta, **decidido por el backend** (`pin_refresh.describe`).
 *
 * ⚠️ No recalcular esto en el front. `date_dependent: false` no es "no tiene fecha": es
 * el veredicto de que reparametrizar este pin daría un número silenciosamente
 * equivocado (un dominio con operadores lógicos no se puede reescribir sin romperlo).
 * Duplicar la regla en TypeScript es cómo la UI termina prometiendo una
 * reparametrización que el backend ignora.
 */
export interface PinRefreshability {
  /** Se puede volver a ejecutar y rearmar el gráfico. */
  refreshable?: boolean;
  /** El selector de período global lo afecta. */
  date_dependent?: boolean;
}

/** El resultado de refrescar UNA tarjeta dentro de "actualizar todo". */
export interface DashboardRefreshResult {
  pin_id: string;
  status: "ok" | "skipped" | "error";
  /** Código, no frase: `static` · `no_context` · `no_groupby` · `odoo_error` … */
  reason?: string;
  date_dependent?: boolean;
  override_applied?: boolean;
  payload?: ChartSSEEvent;
  refreshed_at?: string;
}

export interface ChartSSEEvent {
  type: "chart";
  // "table" is a user-requested format ("mostrámelo en tabla") — the backend
  // sends the same aggregation payload and the card renders rows instead of a
  // chart. Requested via helpers/chart_request.py on the backend.
  chart_type: "bar" | "pie" | "line" | "table";
  title: string;
  data: ChartDataPoint[];
  meta: ChartMeta;
  export_url?: string;
  query_context?: PinQueryContext;
}

export interface ExportSSEEvent {
  type: "export";
  export_url: string;
  filename: string;
}

// Clickable links to the underlying Odoo records the agent just listed
// (record-links.md contract). Generic across models — `model` is technical
// and must never be shown to the user; `url` is absolute and used verbatim.
export interface OdooRecordLink {
  id: number;
  name: string;
  url: string;
}

export interface RecordLinksEvent {
  type: "record_links";
  model: string; // technical — never display
  tooltip: string; // already localized by the backend
  records: OdooRecordLink[];
}

/** TTS audio chunk SSE event — see PLAN_STT_TTS.md Etapa 5. Emitted only when
 * the request carried a `tts` param AND the caller is entitled; sequence is
 * 1-based and monotonically increasing (chunks always arrive in order). */
export interface AudioSSEEvent {
  type: "audio";
  sequence: number;
  audio_b64: string;
  mime: string; // "audio/mpeg"
}

export interface TtsVoice {
  id: string;
  label: string;
  lang: string;
}

export interface TtsVoicesResult {
  provider: string;
  default_voice: string;
  voices: TtsVoice[];
}

export type ConnectionStatus = "idle" | "loading" | "success" | "error";

// Entity search result for autocomplete (from name_search)
export interface EntitySearchResult {
  id: number;
  name: string;
}

// ---- Pinned Insights ----

export interface PinnedChart extends PinRefreshability {
  kind: "chart";
  id: string;
  pinnedAt: string;
  chatId: string;
  messageId: string;
  chartIndex: number;
  chart: ChartSSEEvent;
  query_context?: PinQueryContext;
}

export interface PinnedFile {
  kind: "file";
  id: string;
  pinnedAt: string;
  chatId: string;
  messageId: string;
  metadata: FileAttachmentMetadata;
}

export interface PinnedExcel {
  kind: "excel";
  id: string;
  pinnedAt: string;
  chatId: string;
  messageId: string;
  metadata: ExcelExportMetadata;
}

export type PinnedInsight = PinnedChart | PinnedFile | PinnedExcel;

// ---- Notifications ----

export type NotificationSeverity = "critical" | "warning" | "info" | "success";
export type NotificationCategory = "sales" | "stock" | "invoices" | "general";

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  severity: NotificationSeverity;
  category: NotificationCategory;
  read: boolean;
  createdAt: string;
  chatPrompt: string;
}

export interface NotificationSettings {
  salesAlerts: boolean;
  stockAlerts: boolean;
  invoiceAlerts: boolean;
  dailySummary: boolean;
}

// ---- Multi-Tenancy & Auth ----

export type UserRole = "ADMIN" | "CLIENT_USER" | "SUPERADMIN";
export type OrgType = "PARTNER" | "SOLITARY";

/**
 * Lifecycle of a user's Odoo Connection (per instance), spec §4.
 * - `unset`: row exists (user assigned to the instance) but no valid apikey yet → blocking.
 * - `active`: apikey validated against Odoo OK.
 * - `invalid`: a query failed by auth → backend marks it (isolated per user).
 */
export type OdooConnectionStatus = "unset" | "active" | "invalid";
export type SeatType = "paid" | "free";
export type InvitationMode = "invite_only" | "precreds";
export type InvitationStatus = "pending" | "accepted" | "cancelled";
export type SubscriptionTier =
  | "FREE"
  | "STARTER"
  | "IMPLEMENTOR_S"
  | "IMPLEMENTOR_M"
  | "IMPLEMENTOR_L"
  | "IMPLEMENTOR_XL"
  | "IMPLEMENTOR_XXL";

export interface MeUser {
  id: string;
  email: string;
  role: UserRole;
  is_free_license: boolean;
  allow_feedback: boolean;
  /** Admin-granted entitlement flags (voice features). See VoiceFeatures. */
  stt_enabled?: boolean;
  tts_enabled?: boolean;
  /**
   * IANA timezone the user PICKED (Fase 4). `null` = they never picked one and
   * inherit the org's default — which is NOT the same as picking UTC. Read the
   * resolved value from `MeResponse.timezone`, not from here.
   */
  timezone?: string | null;
  /**
   * RAW admin-granted flag: may this user WRITE Routines? Same shape as
   * `stt_enabled`/`tts_enabled` — gate the UI on the RESOLVED
   * `MeResponse.routines.can_author`, which also covers the implementer's
   * role-based access. This one is only for rendering the admin's own toggle.
   */
  can_author_routines?: boolean;
}

/**
 * Effective voice entitlements for the caller (role bypass + global kill
 * switch already applied server-side — this is what the UI should gate on,
 * NOT `user.stt_enabled`/`user.tts_enabled` directly, which are the raw
 * admin-granted flags before SUPERADMIN bypass / kill switch).
 */
export interface VoiceFeatures {
  stt: boolean;
  tts: boolean;
}

export interface MeOrg {
  id: string;
  name: string;
  slug: string;
  /** Capability axis — gates invites & client management (PARTNER only). */
  type: OrgType;
  /**
   * Identity axis — whether this org joined as a founding partner (Fase 0).
   * Convenience mirror of `/billing/state`; pricing's source of truth stays
   * `getBillingState()`. Stamped at org creation from the global phase, then
   * immutable. Absent on older payloads → treated as founder during beta.
   */
  is_founding_partner?: boolean;
  /** Mirror of `BillingState.founder_rate_locked` (set true at graduation). */
  founder_rate_locked?: boolean;
  /**
   * Founder free-beta clock (Fase 0). Per-org window that starts when the
   * founder connects + validates their first instance (the promotion moment).
   * `null` before they connect — the clock hasn't started. Mirror of
   * `/billing/state`; same values.
   */
  founder_since?: string | null;
  beta_ends_at?: string | null;
  /** Whole days left in the free-beta window (0 if expired, null if no clock). */
  days_left?: number | null;
  /** White-label brand name shown to clients (distinct from the internal org name). */
  brand_name?: string | null;
  /** White-label logo URL shown to clients. */
  brand_logo_url?: string | null;
  /**
   * Default IANA timezone for members who never picked their own (Fase 4).
   * ADMIN-set. `null` = no default → the backend's global fallback applies.
   */
  default_timezone?: string | null;
}

export interface MeSubscription {
  tier: SubscriptionTier;
  show_watermark: boolean;
  paid_slots_limit: number;
  free_slots_limit: number;
  is_active: boolean;
  /** Voice feature quotas (-1 = unlimited, 0 = not contracted). SUPERADMIN-managed. */
  stt_slots_limit?: number;
  tts_slots_limit?: number;
}

export interface SlotsUsed {
  paid: number;
  free: number;
}

/** Per-instance status counts (spec §2.3 / §6 InstanceHealthSummary). */
export interface InstanceCounts {
  active: number;
  unset: number;
  invalid: number;
  pending: number;
}

/** Org-level seat usage, surfaced alongside instances. */
export interface InstanceSeats {
  paid_used: number;
  paid_total: number;
  free_used: number;
  free_total: number;
}

export interface OdooConfigSummary {
  id: string;
  label: string;
  url: string;
  db_name: string;
  is_active: boolean;
  has_credentials?: boolean;
  // Instance metadata captured on validation (spec §2.1/§2.3).
  /** User-facing name chosen by the implementer (P2.1). The backend has always sent
   *  it in `/me`; it was missing from this type, so every screen fell through to
   *  `company_name`. Read it via `instanceLabel()` (`lib/instance-label.ts`), never
   *  directly — that helper owns the one precedence shared with the backend. */
  display_name?: string | null;
  company_name?: string | null;
  odoo_version?: string | null;
  // Status of the *caller's own* Connection on this instance (null = no Connection).
  my_connection_status?: OdooConnectionStatus | null;
  // CLIENT_USER variant of /me exposes connection_status directly.
  connection_status?: OdooConnectionStatus | null;
  // Present on the instance-list endpoint for ADMIN.
  counts?: InstanceCounts;
  seats?: InstanceSeats;
  /**
   * Demo plural (PLAN_INSTANCIAS/05). **Dos flags, no uno**, y la diferencia importa:
   *
   * - `is_demo`  — los datos son nuestros, de mentira, y la instancia se restaura sola.
   *                Su credencial vive en la fila del backend, no en el usuario: por eso
   *                una instancia de demo llega siempre con `connection_status: "active"`
   *                y no hay Connection que armar.
   * - `is_public` — un anónimo la puede elegir en el landing. `caos` va a ser
   *                `is_demo` sin `is_public`: visible para implementadores, no en el landing.
   *
   * ⚠️ `isDemoMode` sale de ACÁ (`activeConfig?.is_demo`) y no de `activeConfigId === "demo"`.
   * El literal identificaba una instancia cuando había una sola; con cuatro no identifica
   * nada, y toda pantalla que siga comparando contra él va a tratar tres de las cuatro
   * como si fueran la instancia de un cliente real.
   */
  is_demo?: boolean;
  is_public?: boolean;
  /** Identidad estable de una instancia del parque ("comercial", "retail"). */
  demo_slug?: string | null;
  /** Orden en el selector del landing. */
  demo_order?: number | null;
}

export interface UserOdooCredential {
  id: string;
  user_id: string;
  odoo_config_id: string;
  odoo_username: string;
  created_at: string;
  updated_at: string;
  status?: OdooConnectionStatus;
  last_validated_at?: string | null;
}

/** Returned by GET /me/odoo-credentials — one entry per config that has credentials */
export interface OdooCredentialSummary {
  config_id: string;
  odoo_username: string;
  status?: OdooConnectionStatus;
  last_validated_at?: string | null;
}

/** Returned by GET /admin/orgs/{orgId}/users/{userId}/odoo-credentials */
export interface AdminUserCredential {
  id: string;
  user_id: string;
  odoo_config_id: string;
  odoo_username: string;
  created_at: string;
  updated_at: string;
  config_label?: string;
  config_url?: string;
  status?: OdooConnectionStatus;
  last_validated_at?: string | null;
}

export interface OdooConfigSummaryWithCreds extends OdooConfigSummary {
  hasCredentials: boolean;
  odoo_username?: string;
  connectionStatus?: OdooConnectionStatus | null;
}

// ---- Instance validation (spec §7) ----

export type ValidateErrorCode = "unreachable" | "db_not_found" | "auth_failed";

export type ValidateResult =
  | { ok: true; company_name: string | null; odoo_version: string | null }
  | { ok: false; error_code: ValidateErrorCode; field_errors?: Record<string, string> };

// ---- Instance detail (spec §2.4 — GET /admin/orgs/{id}/configs/{id}) ----

/** A user as seen from an instance's detail (users ∩ this instance). */
export interface InstanceUser {
  user_id: string;
  email: string;
  role: UserRole;
  seat_type: SeatType;
  connection_status: OdooConnectionStatus;
  odoo_username: string | null;
  last_validated_at: string | null;
}

/** A pending invitation scoped to an instance. */
export interface InstanceInvitation {
  id: string;
  email: string;
  seat_type: SeatType;
  mode: InvitationMode;
  status: InvitationStatus;
  expires_at: string;
}

export interface InstanceDetail {
  id: string;
  label: string;
  url: string;
  db_name: string;
  company_name: string | null;
  odoo_version: string | null;
  counts: InstanceCounts;
  seats?: InstanceSeats;
  users: InstanceUser[];
  invitations: InstanceInvitation[];
}

export interface MeResponse {
  user: MeUser;
  org: MeOrg | null;
  subscription: MeSubscription | null;
  slots_used: SlotsUsed | null;
  odoo_configs: OdooConfigSummary[];
  /**
   * @deprecated Lo reemplaza {@link MeResponse.demo_instances}. Se mantiene un release
   * para que el front viejo no se quede sin demo entre el deploy del back y el del front.
   */
  demo_available?: boolean;
  /**
   * Las instancias del parque que este usuario puede elegir (PLAN_INSTANCIAS/05).
   * Un anónimo y un CLIENT_USER reciben las públicas; un implementador recibe además
   * las de demo no públicas. **La lista no es el permiso**: quién puede usar cuál lo
   * decide el backend en `resolve_config_for`, así que no hay nada que re-chequear acá.
   */
  demo_instances?: OdooConfigSummary[];
  voice_features?: VoiceFeatures;
  /**
   * The EFFECTIVE timezone the backend will use to interpret "at 8:00" for this
   * user's schedules (own → org default → global). Always a resolvable IANA name.
   * Gate scheduling UI on this, never on `user.timezone` (which can be null).
   */
  timezone?: string;
  /** Routine access, resolved server-side. See {@link RoutinesAccess}. */
  routines?: RoutinesAccess;
}

/**
 * What the caller can do with Routines — **two independent axes**, both decided
 * by the backend (2026-08-12).
 *
 * ⚠️ Do NOT re-derive either one in TypeScript. `can_author` folds the role in
 * with the admin-granted flag, and `visible_count` runs the same
 * `resolve_visibility` the catalog runs (grants, scope, ownership). A second
 * implementation here is how the UI ends up offering a button the backend
 * answers with a 403, or hiding a section that does have content.
 *
 * `visible_count` exists so the nav can gate on it WITHOUT calling
 * `GET /routines` — that endpoint can trigger a usage measurement against the
 * client's own Odoo instance, and paying an ERP round-trip to decide whether to
 * draw a sidebar link is not a trade we make.
 *
 * `null` means "couldn't count" (a DB hiccup), NOT "zero". Treat it as
 * "show it" — hiding the section on an error would strand someone who does have
 * Routines. Same fail-open doctrine the catalog applies to grants.
 */
export interface RoutinesAccess {
  can_author: boolean;
  visible_count: number | null;
}

// ---- Billing state (Fase 0 — Founding Partners, spec §5/§6) ----

/**
 * Lifecycle phase of the product's commercial model.
 * - `beta_founder`: current — everyone is a founding partner, free during beta.
 * - `scale`: post-graduation — paid tiers active (founder rate locked in).
 * Kept open-ended so the backend can introduce new phases without a front release.
 */
export type BillingPhase = "beta_founder" | "scale" | (string & {});

/**
 * Render-only billing context (Surface I). The front renders these values; it
 * never computes pricing. Source of truth is `GET /billing/state`. When the
 * endpoint is unavailable, the front falls back to `BETA_BILLING_DEFAULTS`.
 */
export interface BillingState {
  phase: BillingPhase;
  /** List/anchor price per user (e.g. 7). */
  price_anchor: number;
  /** Locked-in founder rate per user (e.g. 1). */
  founder_rate: number;
  /** True during beta — usage is $0. */
  beta_free: boolean;
  /** Whether the founder rate is already locked for this org. */
  founder_rate_locked?: boolean;
  /** Active billable seats (render-only). `null` in dev / when there's no org yet. */
  active_seats?: number | null;
  seat_limit?: number | null;
  payment_status?: string;
  /** Founder free-beta clock — when it started (ISO) / when it ends / days left. */
  founder_since?: string | null;
  beta_ends_at?: string | null;
  days_left?: number | null;
}

export interface ServerConversation {
  id: string;
  thread_id: string;
  title: string | null;
  last_message_at: string;
  /** Instancia del chat. `null` = no se pudo determinar (chat viejo o demo) — se lista igual. */
  odoo_config_id?: string | null;
}

export interface OdooConfigItem {
  id: string;
  label: string;
  url: string;
  db_name: string;
  is_active: boolean;
}

export interface OrgUser {
  id: string;
  email: string;
  role: UserRole;
  is_free_license: boolean;
  allow_feedback: boolean;
  created_at: string;
  stt_enabled?: boolean;
  tts_enabled?: boolean;
  /** May this user WRITE Routines? Admin-granted, defaults to false. */
  can_author_routines?: boolean;
}

export interface Invitation {
  id: string;
  email: string;
  role: UserRole;
  token: string;
  accepted_at: string | null;
  expires_at: string;
  // Tenant refactor (spec §2.8): which instance, seat and mode the invite carries.
  instance_id?: string | null;
  seat_type?: SeatType;
  mode?: InvitationMode;
  status?: InvitationStatus;
}

// ---- SuperAdmin ----

export interface SuperAdminSubscription {
  tier: string;
  paid_slots_limit: number;
  free_slots_limit: number;
  show_watermark: boolean;
  is_active: boolean;
  /** Voice feature quotas (-1 = unlimited, 0 = not contracted). */
  stt_slots_limit?: number;
  tts_slots_limit?: number;
}

export interface SuperAdminOrg {
  id: string;
  name: string;
  slug: string;
  type: OrgType;
  is_active: boolean;
  created_at: string;
  subscription: SuperAdminSubscription;
  user_count: number;
  /**
   * Founder identity + free-beta clock (Fase 0). Surfaced so the superadmin can
   * see who's a founding partner and how many beta days remain. Absent on older
   * backend payloads — the front degrades gracefully (no founder column data).
   */
  is_founding_partner?: boolean;
  founder_since?: string | null;
  beta_ends_at?: string | null;
  days_left?: number | null;
}

export interface SuperAdminOrgsResponse {
  orgs: SuperAdminOrg[];
  count: number;
}

export interface SuperAdminOrgDetail extends SuperAdminOrg {
  slots: {
    paid_used: number;
    free_used: number;
    stt_used?: number;
    tts_used?: number;
  };
  odoo_configs?: OdooConfigItem[];
}

export interface SuperAdminUser {
  id: string;
  email: string;
  role: UserRole;
  is_free_license: boolean;
  allow_feedback: boolean;
  is_active: boolean;
  created_at: string;
  org: {
    id: string;
    name: string;
    slug: string;
  } | null;
}

export interface SuperAdminUsersResponse {
  users: SuperAdminUser[];
  count: number;
}

// ---- Feedback ----

export type FeedbackCategory = "wrong_answer" | "crash" | "misunderstood" | "other";
export type FeedbackStatus = "pending" | "reviewed" | "test_alpha" | "test_beta" | "resolved";

export interface FeedbackReport {
  // Identity
  id: string;
  thread_id: string;
  org_id: string | null;
  supabase_user_id: string | null;
  reported_at: string;
  resolved_at: string | null;

  // User input
  message_id: string | null;
  user_comment: string | null;
  category: FeedbackCategory | null;
  expected_response: string | null;

  // Admin workflow
  status: FeedbackStatus;
  is_hidden: boolean;
  admin_notes: string | null;
  tenant_notes: string | null;

  // Conversation snapshot
  last_messages: Array<{ role: "human" | "ai"; content: string; id: string | null }>;
  user_query: string | null;
  agent_response: string | null;

  // Classification snapshot
  language: string | null;
  primary_model: string | null;
  classified_areas: string[] | null;
  query_type: string | null;
  keyword_classification_done: boolean | null;
  needs_llm_classification: boolean | null;
  keyword_hints: string[] | null;

  // Domain snapshot
  dynamic_domain: unknown[] | null;
  date_filter: Record<string, unknown> | null;
  entity_filter: Record<string, unknown> | null;

  // Execution context
  odoo_total_count: number | null;
  odoo_was_truncated: boolean | null;
  is_followup_query: boolean | null;
  formatted_for_llm: string | null;

  // Errors
  odoo_error: string | null;
  write_error: string | null;

  // Write operation snapshot
  is_write_operation: boolean | null;
  write_vals: Record<string, unknown> | null;
  pending_action: Record<string, unknown> | null;

  // Clarification snapshot
  needs_clarification: boolean | null;
  clarification_question: string | null;

  // Raw data
  odoo_raw_data: unknown[] | null;
}

export interface FeedbackListResponse {
  reports: FeedbackReport[];
  total: number;
}

export interface FeedbackStats {
  total: number;
  last_24h: number;
  last_7d: number;
  by_status: Record<FeedbackStatus, number>;
  by_category: Record<string, number>;
  top_orgs: Array<{ org_id: string; count: number }>;
}

// ---- Analytics events (landing funnel — superadmin view) ----

export interface AnalyticsEvent {
  id: string;
  event: string;
  props: Record<string, unknown>;
  session_id: string | null;
  user_id: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  user_agent: string | null;
  client_ts: string | null;
  received_at: string;
}

export interface AnalyticsEventsListResponse {
  items: AnalyticsEvent[];
  total: number;
  limit: number;
  offset: number;
}

export interface AnalyticsEventsStats {
  total: number;
  last_24h: number;
  last_7d: number;
  unique_sessions: number;
  by_event: Record<string, number>;
  funnel: Record<string, number>;
  by_utm_source: Array<{ source: string; count: number }>;
  by_utm_campaign: Array<{ campaign: string; count: number }>;
  top_example_prompts: Array<{ prompt_id: string; count: number }>;
  dismissals_by_reason: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Rutinas (PLAN_RUTINAS Fase 1)
// ---------------------------------------------------------------------------
// Espejo del contrato del backend (`src/api/routines/models.py`). Si cambia allá,
// cambia acá: son las dos mitades de la misma cosa.

/** Un parámetro que el usuario elige al correr una Rutina. */
export interface RoutineParam {
  key: string;
  type: "period" | "compare_with" | "number" | "choice";
  default: unknown;
  label: Record<string, string>;
  choices?: string[] | null;
  /**
   * `valor → texto localizado`. El valor de un `choice` es una clave de MÁQUINA
   * (`"ventas"`): lo que se le muestra al usuario sale de acá, no del valor.
   */
  choice_labels?: Record<string, Record<string, string>> | null;
  choice_models?: Record<string, string> | null;
}

/**
 * Por qué la instancia NO puede correr una Rutina (§9: el catálogo explica lo que
 * oculta). Llega como **código + modelos**, no como frase: el backend habla 6
 * idiomas y el front 11, así que la redacción vive de este lado.
 */
export interface RoutineUnavailableReason {
  code: "missing_model" | "unused_model";
  models: string[];
}

/**
 * El alcance de una Rutina (Fase 3, §3.4). Determina el grupo del catálogo:
 * **Del sistema · De mi organización · Mías**.
 *
 * ⚠️ `private` NO significa "fuera de la organización": la Rutina pertenece igual a la
 * org ([D6](../../PLAN_RUTINAS/DECISIONES.md#d6)), con la visibilidad restringida al
 * autor. Por eso el ADMIN también la ve — administrarla es su atribución.
 */
export type RoutineScope = "system" | "org" | "private";

/** Una Rutina del catálogo, ya localizada por el backend. */
export interface Routine {
  id: string;
  version: number;
  scope: RoutineScope;
  audience: "builder" | "client";
  /** Nombre de un componente Lucide (ej. "TrendingUp"). Free-text: puede traer el
   *  emoji viejo de una Rutina de usuario ya guardada — resolver siempre vía
   *  `RoutineIcon` (components/routines/routine-icon.tsx), nunca renderizar crudo. */
  icon: string;
  name: string;
  description: string;
  step_count: number;
  params: RoutineParam[];
  /** Sólo presente cuando se pidió el catálogo con un `config_id`. */
  available?: boolean;
  unavailable_reason?: RoutineUnavailableReason;
  /** `ask` sólo viaja cuando el llamador puede EDITAR la Rutina (F3). */
  steps?: Array<{ key: string; kind: "ask" | "probe"; label: string; ask?: string }>;

  // -- Fase 3: autoría y permisos ------------------------------------------
  /** `tenant_user.id` del autor. `null` en las del sistema. */
  created_by?: string | null;
  /** La escribió el usuario que está mirando. Ordena el grupo "Mías". */
  is_mine?: boolean;
  /** Puede editarla / borrarla / compartirla: **autor o ADMIN** (§3.4). */
  can_manage?: boolean;
  updated_at?: string | null;
}

// --- Autoría (Fase 3, B4/B7) ------------------------------------------------

/**
 * Por qué un mensaje NO puede ser un paso.
 *
 * ⚠️ `followup` es el veredicto que implementa la decisión
 * [A9](../../PLAN_RUTINAS/DECISIONES.md#a9): un turno que depende del anterior
 * **se rechaza**, no se expande. Cada paso corre en su propio thread, sin historia.
 */
export type RoutineStepVerdict =
  | "ok"
  | "followup"
  | "not_business"
  | "write"
  | "unresolved"
  | "empty"
  | "too_long";

/**
 * El dictamen del backend sobre UN mensaje.
 *
 * `reason` ya viene redactado (ES/EN) y **dice qué hacer**, no sólo que no se puede —
 * es lo que A9 pide a cambio de haber elegido rechazar en vez de expandir. El front lo
 * muestra tal cual: reescribirlo acá en 11 locales garantizaría que diverja del criterio
 * real del validador.
 */
export interface RoutineStepReview {
  text: string;
  verdict: RoutineStepVerdict;
  usable: boolean;
  reason_code: string | null;
  reason: string | null;
  /** El modelo de Odoo que la frase resuelve. De acá sale el `requires` (§3.1.4). */
  model: string | null;
  area: string | null;
  classified_by: "keyword" | "llm" | null;
  warnings: string[];
  /** Sólo en `reviewConversation`: el id del mensaje del historial del chat. */
  message_id?: string;
}

export interface RoutineConversationReview {
  chat_id: string;
  messages: RoutineStepReview[];
  usable_count: number;
}

/** Lo que devuelve un `dry-run` por cada paso (B5, §3.3). */
export interface RoutineDryRunStep {
  key: string;
  label: string;
  status: RoutineStepStatus;
  reason: string | null;
  duration_ms: number | null;
  /** La respuesta en prosa, tal como la daría el chat. */
  answer: string | null;
  record_count: number | null;
  has_chart: boolean;
}

export interface RoutineDryRun {
  status: RoutineRunStatus;
  steps: RoutineDryRunStep[];
}

// --- Permisos (Fase 3, B1/B6) -----------------------------------------------

/**
 * Un grant **tal cual está guardado**.
 *
 * ⚠️ Que NO exista la fila y que exista en `false` son cosas distintas: sin fila el
 * usuario hereda el default de la org y, si tampoco hay, el `scope`. La matriz del
 * ADMIN tiene que poder expresar los tres estados, así que no colapses esto en un
 * booleano.
 */
export interface RoutineGrant {
  routine_id: string;
  org_id: string;
  /** `null` = el default para toda la organización. */
  user_id: string | null;
  enabled: boolean;
  updated_by: string | null;
  updated_at: string | null;
}

export interface RoutineGrantUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

export interface RoutineGrantsMatrix {
  org_id: string;
  /** `grantable: false` = es `private`; compartila primero (§3.4). */
  routines: Array<Routine & { grantable: boolean }>;
  users: RoutineGrantUser[];
  grants: RoutineGrant[];
  /**
   * ⚠️ `false` = **no se pudieron leer** los usuarios, que NO es lo mismo que "la org no
   * tiene otros usuarios" — y en pantalla se ven igual. Sin este flag, una matriz rota
   * se dibuja entera, sin una sola fila por usuario, y parece que funciona.
   */
  users_ok?: boolean;
}

/**
 * Estado de una corrida.
 *
 * ⚠️ `partial` es de PRIMERA CLASE, no un error: es el estado normal de una corrida
 * fail-open donde 7 de 8 pasos salieron bien. **La UI lo muestra como éxito con nota.**
 */
export type RoutineRunStatus = "queued" | "running" | "done" | "partial" | "error";

/** Estado de un paso. `skipped` = la instancia no lo soporta, no es una falla. */
export type RoutineStepStatus = "pending" | "ok" | "error" | "skipped";

export interface RoutineArtifact {
  filename?: string;
  mimetype?: string;
}

export interface RoutineRunSummary {
  id: string;
  routine_id: string;
  status: RoutineRunStatus;
  config_id: string;
  started_at: string | null;
  finished_at: string | null;
  step_total: number;
  step_done: number;
  artifacts: Record<string, RoutineArtifact>;
  error: string | null;
}

/**
 * Una entrada de `results`: un PASO o un DERIVADO. Comparten forma a propósito —
 * `compose` los referencia en el mismo espacio de nombres (`"actual+variacion"`).
 */
export interface RoutineResultEntry {
  key: string;
  kind: string;
  /** Sólo en los derivados: qué operación produjo el dato. */
  op?: string;
  status: RoutineStepStatus;
  data: Record<string, unknown>;
  reason: string | null;
  /** La frase de negocio ya armada por el backend (B7). El front NO la reescribe. */
  narrative?: string;
  /**
   * ⚠️ **`note` no es `reason`.** `reason` explica por qué NO hay número; `note`
   * acompaña a uno bien calculado que se puede leer mal — hoy el único caso es
   * comparar dos períodos de largo distinto, posible desde que los dos se eligen
   * por separado. Lo decide el backend (`params.comparison_mismatch`); el front lo
   * muestra y **no** recalcula la regla.
   */
  note?: string | null;
  duration_ms?: number;
}

/** El dato de un `pct_change`, tal como lo produce `routine_ops`. */
export interface RoutinePctChange {
  pct: number | null;
  /** `"nuevo"` = no había base contra la cual comparar. NO es "+100%". */
  direction: "up" | "down" | "flat" | "nuevo";
  abs_diff: number;
  previous: number;
  current: number;
}

/** Un contribuyente de una `attribution`. */
export interface RoutineContribution {
  label: string;
  delta: number;
  before: number;
  after: number;
  /** `alta` = empezó · `baja` = dejó · `cambio` = estaba en los dos períodos. */
  kind: "alta" | "baja" | "cambio";
}

export interface RoutineAttribution {
  total_delta: number;
  direction: "up" | "down" | "flat";
  top: RoutineContribution[];
  /** La cola AGREGADA. Omitirla haría parecer que los primeros son todo. */
  rest: { count: number; delta: number };
  group_count: number;
}

export interface RoutineRunDetail extends RoutineRunSummary {
  progress: Record<string, RoutineStepStatus>;
  results: Record<string, RoutineResultEntry>;
  params: Record<string, unknown>;
  routine_version?: number;
  /** El archivo sólo viaja en el detalle, nunca en el listado. */
  pdf_base64?: string;
  filename?: string;
}

// --- Agendado (Fase 4) ------------------------------------------------------

/**
 * Cadencias soportadas. `"event"` (alertas por umbral) está reservada en el backend
 * pero **no implementada** — no agregarla acá hasta que exista del otro lado.
 */
export type RoutineCadence = "daily" | "weekdays" | "weekly" | "monthly";

/**
 * Un agendado. **Es del USUARIO, no de la organización**: corre con SUS credenciales de
 * Odoo (invariante #3), así que dos personas que agendan la misma Rutina reciben lo que
 * su propio Odoo les deja ver. Por eso no existe una vista "los agendados de mi org".
 */
export interface RoutineSchedule {
  id: string;
  routine_id: string;
  org_id: string | null;
  user_id: string;
  odoo_config_id: string;
  params: Record<string, unknown>;
  language: string;
  cadence: RoutineCadence;
  /** 0-23 **en la zona horaria del agendado**, no en la del browser. */
  hour_local: number;
  /** 0 = lunes … 6 = domingo (convención de Python, la misma que usa el cálculo). */
  weekday: number | null;
  day_of_month: number | null;
  /** IANA, congelada al agendar: mudarse de zona no re-agenda lo ya creado. */
  timezone: string;
  channel: "email";
  is_active: boolean;
  last_run_at: string | null;
  last_run_id: string | null;
  /** El motivo del último envío fallido. `null` = la última corrida salió bien. */
  last_error: string | null;
  /** Precalculado por el backend, en UTC. El front lo muestra, no lo recalcula. */
  next_run_at: string;
  created_at: string;
  updated_at: string;
}
