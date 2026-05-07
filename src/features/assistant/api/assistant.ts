const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export type AssistantIntent =
  | "navigation"
  | "academic"
  | "administrative"
  | "platform"
  | "general";

export type AssistantMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AssistantContext = {
  lastOriginPoiId?: string;
  lastOriginLabel?: string;
  lastDestinationPoiId?: string;
  lastDestinationLabel?: string;
  pendingDestinationPoiId?: string;
  pendingDestinationLabel?: string;
  lastOfferSubject?: string;
  lastOfferProfessor?: string;
  lastOfferBuilding?: string;
  lastOfferMode?: string;
  lastAdministrativeTramiteId?: string;
  lastAdministrativeTramiteTitle?: string;
  lastAdministrativeCategory?: string;
  lastAdministrativeLocation?: string;
  pendingClarificationType?: string;
  pendingClarificationOptions?: string[];
  lastResolvedIntent?: string;
  lastResolvedEntityType?: string;
  lastResolvedEntityLabel?: string;
  lastUserGoal?: string;
};

export type AssistantRouteAction = {
  type: "highlight-route";
  destinationPoiId?: string;
  destinationLabel?: string;
  originPoiId?: string;
  originLabel?: string;
};

export type AssistantChatResponse = {
  reply: string;
  intent: AssistantIntent;
  suggestions: string[];
  context: AssistantContext;
  action?: AssistantRouteAction;
};

export async function sendAssistantMessage(
  token: string,
  payload: {
    message: string;
    history: AssistantMessage[];
    context: AssistantContext;
  },
): Promise<AssistantChatResponse> {
  const response = await fetch(`${API_BASE_URL}/assistant/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const raw = await response.text();
  let data: Record<string, unknown> = {};

  if (raw) {
    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      data = { message: raw };
    }
  }

  if (!response.ok) {
    const message =
      typeof data.message === "string"
        ? data.message
        : `No fue posible enviar mensaje al asistente (${response.status})`;
    throw new Error(message);
  }

  return data as unknown as AssistantChatResponse;
}
