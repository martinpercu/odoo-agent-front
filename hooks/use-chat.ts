"use client";

import { useState, useCallback, useRef } from "react";
import type {
  Message,
  MessageMetadata,
  Chat,
  ChatGroup,
  ActionContext,
  ActionSuccessMetadata,
  FileAttachmentMetadata,
  ChartSSEEvent,
  RecordLinksEvent,
  ExcelExportMetadata,
  NoCredentialsMetadata,
} from "@/lib/types";
import type { TraceEntry } from "@/components/chat/langgraph-trace-panel";
import { API_BASE, executeAction as executeActionAPI, uploadImage as uploadImageAPI, fetchChatHistory, fetchMyConversations, deleteChat as deleteChatAPI } from "@/lib/api";
import { getAccessToken } from "@/lib/supabase";
import { useOdooConfig } from "@/hooks/use-odoo-config";
import { useAudience } from "@/hooks/use-audience";
import { useLocale, useTranslations } from "next-intl";
import { IS_AUTH_ENABLED } from "@/lib/supabase";
import { useSession } from "@/hooks/use-session";
import { useAudioPlayer } from "@/hooks/use-audio-player";
import { getVoiceBoolPref, getVoicePref, getVoiceForLang } from "@/lib/voice-prefs";

function groupChatsByDate(chats: Chat[]): ChatGroup[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);

  const todayChats: Chat[] = [];
  const yesterdayChats: Chat[] = [];
  const weekChats: Chat[] = [];
  const olderChats: Chat[] = [];

  for (const chat of chats) {
    const chatDate = new Date(
      chat.updatedAt.getFullYear(),
      chat.updatedAt.getMonth(),
      chat.updatedAt.getDate()
    );
    if (chatDate.getTime() === today.getTime()) {
      todayChats.push(chat);
    } else if (chatDate.getTime() === yesterday.getTime()) {
      yesterdayChats.push(chat);
    } else if (chatDate.getTime() > today.getTime() - 86400000 * 7) {
      weekChats.push(chat);
    } else {
      olderChats.push(chat);
    }
  }

  const groups: ChatGroup[] = [];
  if (todayChats.length) groups.push({ label: "today", chats: todayChats });
  if (yesterdayChats.length) groups.push({ label: "yesterday", chats: yesterdayChats });
  if (weekChats.length) groups.push({ label: "last7Days", chats: weekChats });
  if (olderChats.length) groups.push({ label: "older", chats: olderChats });

  return groups;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * ¿Quedan más conversaciones después de esta página?
 *
 * Se decide con el TOTAL que manda el backend, no con el tamaño de la página: `count` es
 * cuántas vinieron (nunca más que el `limit`), así que compararlo contra el limit daba
 * siempre `false` y el botón "cargar más" no aparecía nunca. Sin `total` (backend viejo)
 * queda la única pista disponible: una página llena sugiere que hay más.
 */
function hasMoreAfter(total: number | undefined, pageSize: number, offset: number): boolean {
  const seen = offset + pageSize;
  return total != null ? total > seen : pageSize === 50;
}

export function useChat(chatId?: string, userId?: string) {
  const chatsRef = useRef<Chat[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  chatsRef.current = chats;
  const [currentChatId, setCurrentChatId] = useState<string | undefined>(chatId);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const loadedChatIdsRef = useRef<Set<string>>(new Set());
  const { activeConfigId, isConfigured } = useOdooConfig();
  const { isPreviewingAsClient } = useAudience();
  const locale = useLocale();
  const t = useTranslations("ChatMessages");
  const { meData } = useSession();
  const audioPlayer = useAudioPlayer();

  // Server-side conversation list
  const serverChatsRef = useRef<Chat[]>([]);
  const [serverChats, setServerChats] = useState<Chat[]>([]);
  serverChatsRef.current = serverChats;
  const [serverOffset, setServerOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [traceEntries, setTraceEntries] = useState<TraceEntry[]>([]);
  // Historial filtrado por instancia: cuántos chats quedaron afuera y si el usuario
  // pidió verlos igual. `showAllInstances` NO se persiste — es una mirada puntual
  // ("¿dónde había quedado eso del otro cliente?"), no un modo en el que se trabaja.
  const [otherInstancesCount, setOtherInstancesCount] = useState(0);
  const [showAllInstances, setShowAllInstances] = useState(false);

  const currentChat =
    chats.find((c) => c.id === currentChatId) ??
    serverChats.find((c) => c.id === currentChatId) ??
    null;

  // Update a chat by id in whichever list holds it (optimistic or server).
  const updateChat = useCallback((id: string, updater: (c: Chat) => Chat) => {
    setChats((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = updater(next[idx]);
      return next;
    });
    setServerChats((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = updater(next[idx]);
      return next;
    });
  }, []);

  // Display list: server list merged with any optimistic local-only chats.
  //
  // ⚠️ La lista del server ya viene filtrada por instancia, pero la optimista no la toca
  // nadie: sin este filtro, un chat empezado en esta sesión seguía visible después de
  // cambiar de instancia — el único de la lista que no pertenecía a la instancia que dice
  // el cartel, que es exactamente lo que este cambio viene a evitar. Se compara contra el
  // `configId` que se le estampa al crearlo (ver `createChat`); sin instancia conocida, o
  // en demo, no se esconde nada.
  const displayChats = (() => {
    const serverIds = new Set(serverChats.map((c) => c.id));
    const belongsHere = (c: Chat) =>
      showAllInstances || !c.configId || !activeConfigId || c.configId === activeConfigId;
    const optimistic = chats.filter((c) => !serverIds.has(c.id) && belongsHere(c));
    return [...optimistic, ...serverChats];
  })();
  const chatGroups = groupChatsByDate(displayChats);

  const deleteChat = useCallback(async (chatId: string) => {
    const target = chatsRef.current.find((c) => c.id === chatId)
      ?? serverChatsRef.current.find((c) => c.id === chatId);
    const idForApi = target?.conversationId ?? chatId;
    const result = await deleteChatAPI(idForApi);
    if (result.success) {
      setChats((prev) => prev.filter((c) => c.id !== chatId));
      setServerChats((prev) => prev.filter((c) => c.id !== chatId));
      if (currentChatId === chatId) {
        setCurrentChatId(undefined);
      }
    }
    return result;
  }, [currentChatId]);

  const loadServerConversations = useCallback(async (offset: number) => {
    if (!IS_AUTH_ENABLED || !userId) return;
    // Sin filtro cuando el usuario pidió ver todo. El backend ignora "demo" solo.
    const filterConfigId = showAllInstances ? null : activeConfigId;
    const result = await fetchMyConversations(50, offset, filterConfigId);
    if (!result.success || !result.conversations) return;
    setOtherInstancesCount(result.otherCount ?? 0);
    const loaded: Chat[] = result.conversations.map((c) => {
      // thread_id is "{org_id}:{localId}" — use only the localId part as the
      // navigation id so URLs stay clean (no encoded colons).
      const colonIdx = c.thread_id.indexOf(":");
      const navId = colonIdx !== -1 ? c.thread_id.slice(colonIdx + 1) : c.thread_id;
      return {
        id: navId,
        conversationId: c.id,
        configId: c.odoo_config_id ?? null,
        title: c.title ?? "",
        messages: [],
        createdAt: new Date(c.last_message_at),
        updatedAt: new Date(c.last_message_at),
      };
    });
    if (offset === 0) {
      // Preserve in-memory messages: check both optimistic (chats) and already-migrated (serverChats).
      const localById = new Map([
        ...serverChatsRef.current.map((c) => [c.id, c] as [string, Chat]),
        ...chatsRef.current.map((c) => [c.id, c] as [string, Chat]),
      ]);
      const merged = loaded.map((s) => {
        const local = localById.get(s.id);
        return local && local.messages.length > 0 ? { ...s, messages: local.messages } : s;
      });
      setChats((prev) => {
        const serverIds = new Set(loaded.map((c) => c.id));
        return prev.filter((c) => !serverIds.has(c.id));
      });
      setServerChats(merged);
      setServerOffset(0);
      setHasMore(hasMoreAfter(result.total, loaded.length, 0));
      return;
    }
    setServerChats((prev) => [...prev, ...loaded]);
    setHasMore(hasMoreAfter(result.total, loaded.length, offset));
  }, [userId, activeConfigId, showAllInstances]);

  const loadMoreConversations = useCallback(() => {
    const next = serverOffset + 50;
    setServerOffset(next);
    loadServerConversations(next);
  }, [serverOffset, loadServerConversations]);

  const createChat = useCallback(
    (firstMessage: string): string => {
      const id = Date.now().toString();
      const title = firstMessage.length > 50 ? firstMessage.slice(0, 47) + "..." : firstMessage;
      const newChat: Chat = {
        id,
        // La misma instancia que va a viajar en el stream. Se estampa acá para que el chat
        // ya pertenezca a algo mientras el backend todavía no lo devolvió en la lista.
        configId: activeConfigId,
        title,
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      setChats((prev) => [newChat, ...prev]);
      setCurrentChatId(id);
      return id;
    },
    [activeConfigId]
  );

  const sendMessage = useCallback(
    async (content: string, explicitChatIdOrImage?: string | File, maybeImage?: File) => {
      // Resolve overloaded args: sendMessage(content, chatId?, image?)
      let explicitChatId: string | undefined;
      let image: File | undefined;
      if (typeof explicitChatIdOrImage === "string") {
        explicitChatId = explicitChatIdOrImage;
        image = maybeImage;
      } else if (explicitChatIdOrImage instanceof File) {
        image = explicitChatIdOrImage;
      }

      let targetId = explicitChatId ?? currentChatId;
      if (!targetId) {
        targetId = createChat(content || "Image upload");
      }

      const userMessage: Message = {
        id: `msg-${Date.now()}`,
        role: "user",
        content,
        timestamp: new Date(),
        ...(image && { imageUrl: URL.createObjectURL(image) }),
      };

      const assistantId = `msg-${Date.now() + 1}`;

      // Add user message + empty assistant message
      updateChat(targetId, (c) => ({
        ...c,
        messages: [
          ...c.messages,
          userMessage,
          { id: assistantId, role: "assistant" as const, content: "", timestamp: new Date() },
        ],
        updatedAt: new Date(),
      }));

      setIsStreaming(true);
      setTraceEntries([]);

      // TTS: reset the previous turn's audio queue immediately so a stale
      // chunk from a cancelled/older turn never plays over the new one.
      // unlock() runs synchronously here (still within the click gesture's
      // callstack — this is the first statement of sendMessage, before any
      // `await`) so iOS/Chrome autoplay policies don't block later playback.
      const ttsEnabled = Boolean(meData?.voice_features?.tts) && getVoiceBoolPref("tts", false);
      audioPlayer.reset();
      if (ttsEnabled) audioPlayer.unlock();

      // Guard: require Odoo config before calling backend
      if (!isConfigured || !activeConfigId) {
        updateChat(targetId, (c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.id === assistantId ? { ...m, content: `⚠️ ${t("configNotSet")}` } : m
          ),
        }));
        setIsStreaming(false);
        return;
      }

      // Image upload flow: POST to /upload (not SSE)
      if (image) {
        try {
          const result = await uploadImageAPI(targetId, image, activeConfigId!, locale);

          if (!result.success) {
            updateChat(targetId, (c) => ({
              ...c,
              messages: c.messages.map((m) =>
                m.id === assistantId ? { ...m, content: `⚠️ ${result.error || "Upload failed"}` } : m
              ),
            }));
            return;
          }

          // Parse upload response — may contain text + action_proposal
          const data = result.data!;
          let metadata: MessageMetadata | undefined;
          const responseContent = (data.message as string) || (data.content as string) || "";

          if (data.type === "action_proposal" || data.action_proposal) {
            const proposal = data.type === "action_proposal" ? data : data.action_proposal;
            metadata = proposal as MessageMetadata;
          } else if (data.metadata) {
            metadata = data.metadata as MessageMetadata;
          }

          updateChat(targetId, (c) => ({
            ...c,
            messages: c.messages.map((m) =>
              m.id === assistantId
                ? { ...m, content: responseContent, ...(metadata && { metadata }) }
                : m
            ),
          }));
        } finally {
          setIsStreaming(false);
        }
        return;
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const token = await getAccessToken();
        const sseHeaders: Record<string, string> = { "Content-Type": "application/json" };
        if (token) sseHeaders["Authorization"] = `Bearer ${token}`;

        const ttsBody = ttsEnabled
          ? {
              tts: {
                voice: getVoiceForLang(locale) || undefined,
                speed: parseFloat(getVoicePref("speed", "1.0")) || 1.0,
              },
            }
          : {};

        const res = await fetch(`${API_BASE}/chat/${targetId}/stream`, {
          method: "POST",
          headers: sseHeaders,
          body: JSON.stringify({
            message: content,
            config_id: activeConfigId,
            language: locale,
            // Vista previa "como lo ve tu cliente" (PLAN_INSTANCIAS/07 Idea 3). Sólo
            // se manda cuando está encendida, y sólo puede pedir ver MENOS: el back
            // ignora un pedido de subir de audiencia (`_audience_for_request`), así
            // que esto no es la defensa sino la comodidad. Con esto la respuesta llega
            // con voz de concierge y sanitizada, no sólo con la cáscara achicada.
            ...(isPreviewingAsClient ? { audience: "client" } : {}),
            ...ttsBody,
          }),
          signal: controller.signal,
        });

        if (res.status === 401) {
          if (typeof window !== "undefined")
            window.dispatchEvent(new CustomEvent("auth:unauthorized"));
          return;
        }

        if (res.status === 402) {
          if (typeof window !== "undefined")
            window.dispatchEvent(new CustomEvent("auth:limit_reached"));
          updateChat(targetId, (c) => ({
            ...c,
            messages: c.messages.filter((m) => m.id !== assistantId),
          }));
          return;
        }

        if (!res.ok) {
          // Try to read the error body for NO_CREDENTIALS detection
          try {
            const errData = await res.json();
            const detail: string = typeof errData.detail === "string" ? errData.detail : "";
            if (detail.startsWith("NO_CREDENTIALS:")) {
              const noCredsMetadata: NoCredentialsMetadata = {
                type: "no_credentials",
                config_id: activeConfigId!,
              };
              updateChat(targetId, (c) => ({
                ...c,
                messages: c.messages.map((m) =>
                  m.id === assistantId ? { ...m, content: "", metadata: noCredsMetadata } : m
                ),
              }));
              return;
            }
          } catch { /* ignore parse errors */ }
          throw new Error(`API error: ${res.status}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let accumulated = "";
        let buffer = "";
        let charts: ChartSSEEvent[] = [];
        let recordLinks: RecordLinksEvent[] = [];
        // Watermark: safe default = not show. Only shows when backend explicitly sends show: true.
        let showWatermark: boolean | undefined = undefined;

        // Throttle state updates to once per animation frame to avoid
        // triggering a React re-render + ReactMarkdown re-parse on every SSE chunk.
        let pendingFlush = false;
        let lastMetadata: MessageMetadata | undefined = undefined;

        const flushToState = () => {
          pendingFlush = false;
          const snap = accumulated;
          const meta = lastMetadata;
          const chartSnap = charts;
          const recordLinksSnap = recordLinks;
          const wm = showWatermark;
          updateChat(targetId, (c) => ({
            ...c,
            messages: c.messages.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: snap,
                    ...(meta && { metadata: meta }),
                    ...(chartSnap.length > 0 && { charts: chartSnap }),
                    ...(recordLinksSnap.length > 0 && { recordLinks: recordLinksSnap }),
                    watermark: wm,
                  }
                : m
            ),
          }));
        };

        const scheduleFlush = () => {
          if (!pendingFlush) {
            pendingFlush = true;
            requestAnimationFrame(flushToState);
          }
        };

        let currentEventType = "message";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE lines: "event: <name>\n" + "data: <text>\n\n"
          const lines = buffer.split("\n");
          // Keep the last potentially incomplete line in the buffer
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              currentEventType = line.slice(7).trim();
              continue;
            }
            if (line.startsWith("data: ")) {
              const raw = line.slice(6);

              if (currentEventType === "trace") {
                currentEventType = "message";
                try {
                  const entry = JSON.parse(raw) as TraceEntry;
                  setTraceEntries((prev) => [...prev, { ts: entry.ts, level: entry.level, node: entry.node, message: entry.message }]);
                } catch { /* ignore malformed trace */ }
                continue;
              }
              currentEventType = "message";

              // Try to parse as JSON
              let text = "";
              let metadata: MessageMetadata | undefined = undefined;
              try {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === "object") {
                  // Skip step events like {"step":"..."}
                  if ("step" in parsed) continue;

                  // Handle backend format with explicit type field
                  if ("type" in parsed) {
                    if (parsed.type === "text") {
                      text = parsed.content || "";
                    } else if (parsed.type === "action_proposal") {
                      metadata = parsed as MessageMetadata;
                      text = "";
                    } else if (parsed.type === "selection_prompt") {
                      metadata = parsed as MessageMetadata;
                      text = "";
                    } else if (parsed.type === "action_prompt") {
                      metadata = parsed as MessageMetadata;
                      text = "";
                    } else if (parsed.type === "action_success") {
                      metadata = parsed as MessageMetadata;
                      text = "";
                    } else if (parsed.type === "chart") {
                      charts = [...charts, parsed as ChartSSEEvent];
                      text = "";
                    } else if (parsed.type === "record_links") {
                      recordLinks = [...recordLinks, parsed as RecordLinksEvent];
                      text = "";
                    } else if (parsed.type === "export") {
                      metadata = {
                        type: "excel_export",
                        export_url: parsed.export_url,
                        filename: parsed.filename,
                      } satisfies ExcelExportMetadata;
                      text = "";
                    } else if (parsed.type === "watermark") {
                      // Watermark event comes at the start. show: false = paid client.
                      showWatermark = typeof parsed.show === "boolean" ? parsed.show : false;
                      continue;
                    } else if (parsed.type === "audio") {
                      // TTS chunk — enqueue for gapless playback, never touches
                      // the visible chat content.
                      if (typeof parsed.sequence === "number" && typeof parsed.audio_b64 === "string") {
                        audioPlayer.enqueue(parsed.sequence, parsed.audio_b64);
                      }
                      continue;
                    } else if (parsed.type === "error") {
                      // Terminal error event: the backend graph failed mid-stream.
                      // `detail` is already localized + neutral — show it as-is.
                      // Status is still 200, so this is the only failure signal.
                      const detail =
                        typeof parsed.detail === "string" && parsed.detail
                          ? parsed.detail
                          : t("connectionError");
                      // Keep any partial text already streamed, append the error below.
                      const finalContent = accumulated
                        ? `${accumulated}\n\n⚠️ ${detail}`
                        : `⚠️ ${detail}`;
                      updateChat(targetId, (c) => ({
                        ...c,
                        messages: c.messages.map((m) =>
                          m.id === assistantId
                            ? {
                                ...m,
                                content: finalContent,
                                ...(charts.length > 0 && { charts }),
                                ...(recordLinks.length > 0 && { recordLinks }),
                                watermark: showWatermark,
                              }
                            : m
                        ),
                      }));
                      reader.cancel();
                      return;
                    } else {
                      continue;
                    }
                  } else if ("content" in parsed) {
                    // Backward compatibility: {"content": "..."} without type
                    text = parsed.content;
                    if ("metadata" in parsed && parsed.metadata) {
                      metadata = parsed.metadata;
                    }
                  } else {
                    continue;
                  }
                }
              } catch {
                // Not valid JSON — treat as plain text content
                text = raw;
              }

              accumulated += text;
              if (metadata) lastMetadata = metadata;

              // Detect NO_CREDENTIALS: prefix in streamed text
              if (accumulated.startsWith("NO_CREDENTIALS:")) {
                const noCredsMetadata: NoCredentialsMetadata = {
                  type: "no_credentials",
                  config_id: activeConfigId!,
                };
                updateChat(targetId, (c) => ({
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === assistantId ? { ...m, content: "", metadata: noCredsMetadata } : m
                  ),
                }));
                reader.cancel();
                return;
              }

              scheduleFlush();
            }
          }
        }

        // Flush any remaining buffered content after the stream ends
        if (pendingFlush) {
          pendingFlush = false;
          flushToState();
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          // User stopped streaming — keep what we have
        } else {
          // Show error in the assistant message
          const errorMsg = (err as Error).message || "Error de conexión";
          updateChat(targetId, (c) => ({
            ...c,
            messages: c.messages.map((m) =>
              m.id === assistantId ? { ...m, content: `⚠️ ${errorMsg}` } : m
            ),
          }));
        }
      } finally {
        abortControllerRef.current = null;
        setIsStreaming(false);
        // Reload server list so the new thread gets its real title from the backend
        loadServerConversations(0);
      }
    },
    [
      currentChatId,
      createChat,
      updateChat,
      activeConfigId,
      // Sin esto el callback captura el valor VIEJO: se cambia a vista cliente y el
      // primer mensaje siguiente todavía sale con audiencia de implementador.
      isPreviewingAsClient,
      isConfigured,
      locale,
      t,
      loadServerConversations,
      audioPlayer,
      meData?.voice_features?.tts,
    ]
  );

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
    audioPlayer.reset();
  }, [audioPlayer]);

  const executeAction = useCallback(
    async (actionContext: ActionContext) => {
      if (!currentChatId || !activeConfigId) return;

      const result = await executeActionAPI(
        currentChatId, actionContext, activeConfigId, locale,
        isPreviewingAsClient ? "client" : undefined
      );

      if (!result.success) {
        // If we have per-field validation errors (422), throw them back to the
        // ActionProposalButton so it can display inline error indicators.
        if (result.fieldErrors) {
          const err = new Error(result.error || "Validation failed");
          (err as Error & { fieldErrors: Record<string, string> }).fieldErrors = result.fieldErrors;
          throw err;
        }

        const errorMessage: Message = {
          id: `msg-${Date.now()}`,
          role: "assistant",
          content: `⚠️ ${result.error || "Action failed"}`,
          timestamp: new Date(),
        };
        updateChat(currentChatId, (c) => ({
          ...c,
          messages: [...c.messages, errorMessage],
        }));
        return;
      }

      // Build success metadata
      let metadata: ActionSuccessMetadata | FileAttachmentMetadata | undefined;

      if (
        result.result?.action === "report" ||
        result.result?.action === "report_combined"
      ) {
        // Report (single or combined): show file card. The PDF arrives in-memory
        // as base64 and is downloaded "al aire" — same path for both actions.
        metadata = {
          type: "file_attachment",
          pdf_base64: result.result.pdf_base64,
          filename: result.result.filename,
          mimetype: result.result.mimetype,
        } satisfies FileAttachmentMetadata;
      } else if (result.result && result.result.action !== "report_grouped") {
        // CRUD / method_call success. report_grouped is handled by AggReportCard
        // (direct Blob download) and never flows through executeAction.
        const r = result.result;
        metadata = {
          type: "action_success",
          action: r.action,
          recordId: "id" in r ? r.id : ("ids" in r ? r.ids[0] : ""),
          model: r.model,
          actionType: r.action === "method_call" ? "method_call" : "crud",
          actionMessage: result.message,
        } satisfies ActionSuccessMetadata;
      }

      const responseMessage: Message = {
        id: `msg-${Date.now()}`,
        role: "assistant",
        content: result.message || "Action completed successfully",
        timestamp: new Date(),
        ...(metadata && { metadata }),
      };

      updateChat(currentChatId, (c) => ({
        ...c,
        messages: [...c.messages, responseMessage],
      }));

      // Auto-sequence: if queue_next is present, send the next message after a delay
      if (result.queue_next) {
        await delay(500);
        sendMessage(result.queue_next.text, currentChatId);
      }
    },
    [currentChatId, activeConfigId, locale, sendMessage, updateChat, isPreviewingAsClient]
  );

  const loadChatHistory = useCallback(
    async (targetChatId: string) => {
      // Skip if already loaded or currently loading
      if (loadedChatIdsRef.current.has(targetChatId)) return;
      // Skip if chat already exists in state with messages
      const existing = chatsRef.current.find((c) => c.id === targetChatId);
      if (existing && existing.messages.length > 0) {
        loadedChatIdsRef.current.add(targetChatId);
        return;
      }
      if (!activeConfigId) return;

      loadedChatIdsRef.current.add(targetChatId);
      setIsLoadingHistory(true);

      try {
        const result = await fetchChatHistory(targetChatId, activeConfigId);
        if (!result.success || !result.messages) {
          return;
        }
        const messages = result.messages;
        if (messages.length === 0) return; // Empty = new chat, WelcomeDashboard will show

        setChats((prev) => {
          const existingChat = prev.find((c) => c.id === targetChatId);
          if (existingChat) {
            // Hydrate existing chat
            return prev.map((c) =>
              c.id === targetChatId ? { ...c, messages } : c
            );
          }
          // Create new chat entry from history
          const title =
            messages.find((m) => m.role === "user")?.content.slice(0, 47) || "";
          const newChat: Chat = {
            id: targetChatId,
            title: title.length >= 47 ? title + "..." : title,
            messages,
            createdAt: messages[0]?.timestamp ?? new Date(),
            updatedAt: messages[messages.length - 1]?.timestamp ?? new Date(),
          };
          return [newChat, ...prev];
        });
      } finally {
        setIsLoadingHistory(false);
      }
    },
    [activeConfigId]
  );

  const clearChats = useCallback(() => {
    setChats([]);
    setServerChats([]);
    setCurrentChatId(undefined);
    setHasMore(false);
    setServerOffset(0);
    setOtherInstancesCount(0);
    setShowAllInstances(false);
  }, []);

  return {
    chats,
    /** Lista mostrada: los del server + los optimistas que todavía no volvieron de él. */
    displayChats,
    chatGroups,
    currentChat,
    currentChatId,
    setCurrentChatId,
    sendMessage,
    isStreaming,
    isLoadingHistory,
    stopStreaming,
    createChat,
    executeAction,
    loadChatHistory,
    loadServerConversations,
    loadMoreConversations,
    hasMore,
    /** Chats del usuario en OTRAS instancias, escondidos por el filtro (0 = no hay nada que ofrecer). */
    otherInstancesCount,
    showAllInstances,
    setShowAllInstances,
    deleteChat,
    clearChats,
    traceEntries,
    isPlayingAudio: audioPlayer.isPlaying,
    stopAudio: audioPlayer.reset,
  };
}
