# Chat-driven report generation and React rendering

This reference covers the two AI-facing surfaces of an AIRspec Host: the **requirements-gathering chat** that converses with a user to produce a natural-language spec prompt, and the **spec generation** pipeline that turns that prompt into a validated AIRspec JSON document. It also covers how to render that document in React using the AIRspec engine, and how to configure LLM models and edge functions.

Use this alongside [references/react.md](references/react.md) and [references/conformance.md](references/conformance.md). This document is framework-agnostic where possible; React-specific sections are marked.

---

## Architecture overview

The system has three layers:

```text
┌─────────────────────────────────────────────────────┐
│  React UI                                            │
│  ┌──────────────┐  ┌──────────────┐                 │
│  │ ChatPanel    │  │ ReportViewer │                 │
│  │ (messages,   │  │ (renders     │                 │
│  │  attachments,│  │  AIRspec doc)│                 │
│  │  model pick) │  │              │                 │
│  └──────┬───────┘  └──────┬───────┘                 │
│         │                 │                         │
│  ┌──────▼─────────────────▼───────┐                 │
│  │  Service Layer (api.ts)        │                 │
│  │  - callEdgeFunction()          │                 │
│  │  - streamEdgeFunction()        │                 │
│  │  - uploadChatImage()           │                 │
│  └──────┬─────────────────────────┘                 │
└─────────┼───────────────────────────────────────────┘
          │  fetch (POST, NDJSON stream)
┌─────────▼───────────────────────────────────────────┐
│  Supabase Edge Functions (Deno)                     │
│  ┌─────────────────┐  ┌──────────────────────────┐  │
│  │ report-chat     │  │ report-generate          │  │
│  │ (requirements   │  │ (LLM → JSON → validate   │  │
│  │  gathering)     │  │  → retry → persist)       │  │
│  └────────┬────────┘  └──────────┬───────────────┘  │
│           │                      │                  │
│  ┌────────▼──────────────────────▼───────────────┐  │
│  │  LLM Provider (OpenAI / Anthropic)            │  │
│  └───────────────────────────────────────────────┘  │
│                                                      │
│  ┌───────────────────────────────────────────────┐  │
│  │  Supabase Postgres                             │  │
│  │  - data sources (catalog)                      │  │
│  │  - chat messages (history)                      │  │
│  │  - reports + versions (persisted specs)        │  │
│  └───────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

---

## Part 1: Building the chat interface

### 1.1 Chat hook (React)

The chat state should be managed in a custom hook that owns: message history, loading flags, the current session ID, the selected model, image attachments, and the "ready to generate" signal.

```tsx
// hooks/useReportChat.ts
import { useState, useCallback, useRef } from "react";
import { reportService, uploadChatImage } from "../services";
import type { ChatMessage, ChatImageAttachment } from "../types";

export function useReportChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [readyToGenerate, setReadyToGenerate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<ChatImageAttachment[]>([]);
  const sessionIdRef = useRef(crypto.randomUUID());

  const sendMessage = useCallback(async (content: string) => {
    const attachments = pendingAttachments.length > 0 ? [...pendingAttachments] : undefined;
    const userMsg: ChatMessage = { role: "user", content, attachments };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setPendingAttachments([]);
    setIsLoading(true);

    try {
      const response = await reportService.sendChatMessage(
        newMessages,
        sessionIdRef.current,
        model ?? undefined
      );

      const assistantMsg: ChatMessage = { role: "assistant", content: response.message };
      setMessages([...newMessages, assistantMsg]);

      if (response.isReadyToGenerate) {
        setReadyToGenerate(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chat failed");
    } finally {
      setIsLoading(false);
    }
  }, [messages, pendingAttachments, model]);

  // ... generate(), reset(), loadExisting(), attachment helpers

  return { messages, isLoading, isGenerating, readyToGenerate, error, model, setModel,
           sendMessage, generate, reset, pendingAttachments, /* ... */ };
}
```

Key design decisions:

- **Session ID** is a `crypto.randomUUID()` stored in a ref. It ties chat messages and generated reports together for history retrieval.
- **Attachments** are uploaded to Supabase Storage before the message is sent; the edge function receives public URLs.
- **`isReadyToGenerate`** is driven by a sentinel marker (`[READY_TO_GENERATE]`) in the assistant's response. The UI uses this to reveal a "Generate Report" button.
- **Model selection** is a simple `useState<string | null>`; the chosen model is passed to both the chat and generate edge functions.

### 1.2 Chat message type

```tsx
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  attachments?: ChatImageAttachment[];
}

interface ChatImageAttachment {
  id: string;
  path: string;
  url: string;
  filename: string;
  contentType: string;
  size: number;
}
```

### 1.3 Image attachments

Upload to a Supabase Storage bucket before sending the chat message. The edge function needs the public URL to pass to vision-capable models.

```tsx
export async function uploadChatImage(sessionId: string, file: File): Promise<ChatImageAttachment> {
  const ext = file.name.split(".").pop() ?? "png";
  const id = crypto.randomUUID();
  const path = `${sessionId}/${id}.${ext}`;

  const { error } = await supabase.storage
    .from("chat-images")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) throw new Error(`Image upload failed: ${error.message}`);

  const { data: urlData } = supabase.storage.from("chat-images").getPublicUrl(path);

  return { id, path, url: urlData.publicUrl, filename: file.name, contentType: file.type, size: file.size };
}
```

### 1.4 Chat UI component

The chat panel renders the message list, an attachment tray, a model selector, and a text input. When `readyToGenerate` is true, show a prominent "Generate Report" button.

```tsx
function ChatPanel({ chat }: { chat: ReturnType<typeof useReportChat> }) {
  return (
    <div className="flex flex-col h-full">
      <MessageList messages={chat.messages} isLoading={chat.isLoading} />
      <AttachmentTray
        attachments={chat.pendingAttachments}
        onRemove={chat.removeAttachment}
      />
      <ChatInput
        onSend={chat.sendMessage}
        onAttach={chat.addAttachments}
        disabled={chat.isLoading || chat.isGenerating}
      />
      {chat.readyToGenerate && (
        <GenerateButton onClick={chat.generate} isGenerating={chat.isGenerating} />
      )}
      {chat.error && <ErrorBanner message={chat.error} />}
    </div>
  );
}
```

Design rules:

- Never use `window.alert` for errors or confirmations. Use a custom modal with confirm/cancel buttons.
- Show a typing indicator while `isLoading` is true.
- Disable the input while generating.
- Render attachments as thumbnails above the input with a remove button.

---

## Part 2: Edge functions

### 2.1 What belongs in edge functions

Edge functions are the **only** place where:

1. **LLM API keys** are accessed (via `Deno.env.get`).
2. **LLM provider calls** are made (OpenAI, Anthropic, etc.).
3. **System prompts** are constructed (including the schema cheatsheet and data-source catalog).
4. **Spec validation** runs against the generated JSON.
5. **Retry loops** execute when validation fails.
6. **Persistence** happens (saving reports, versions, chat messages to Postgres).
7. **Streaming** is managed (NDJSON progress events, heartbeats).

The React client never sees API keys, never constructs prompts, and never validates specs. It sends messages and receives either a chat response or a stream of progress events.

### 2.2 CORS headers (mandatory)

Every edge function response — preflight, success, and error — must include these headers:

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  // ... handler logic
});
```

### 2.3 Requirements-gathering chat edge function

This function receives the conversation history and returns the assistant's next message. It is **not** responsible for generating AIRspec JSON — only for gathering requirements.

```typescript
// supabase/functions/report-chat/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = { /* ... as above ... */ };

interface IncomingMessage {
  role: string;
  content: string;
  attachments?: { url: string; filename: string; contentType: string }[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const { messages, sessionId, accountId, model } = await req.json();
    const selectedModel = model || "gpt-4o";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Fetch enabled data sources from the catalog
    const { data: dataSources } = await supabase
      .from("data_sources")
      .select("name, description, fields_json")
      .eq("enabled", true);

    // 2. Build source context for the system prompt
    const sourceContext = (dataSources ?? [])
      .map((ds) => {
        const fieldList = ds.fields_json
          .map((f) => `    "${f.key || f.name}" (${f.type})${f.description ? ` — ${f.description}` : ""}`)
          .join("\n");
        return `Source: "${ds.name}"${ds.description ? ` — ${ds.description}` : ""}\n  FIELDS:\n${fieldList}`;
      })
      .join("\n\n");

    // 3. Construct the system prompt
    const systemPrompt = `You are a report requirements gathering assistant.
Your job is to ask clarifying questions, then signal when you have enough information.

AVAILABLE DATA SOURCES:
${sourceContext || "No data sources enabled."}

RULES:
- Only use exact field names from the sources above.
- Ask 1-3 questions at a time.
- When ready, respond with a structured summary followed by [READY_TO_GENERATE].
- Never generate JSON or code.
- If the user attaches reference images, analyze them and incorporate visual style.`;

    // 4. Call the LLM
    const assistantMessage = await callLLM(selectedModel, systemPrompt, messages);

    // 5. Persist the conversation
    await persistMessages(supabase, sessionId, accountId, messages, assistantMessage);

    return new Response(
      JSON.stringify({
        message: assistantMessage,
        isReadyToGenerate: assistantMessage.includes("[READY_TO_GENERATE]"),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

### 2.4 Spec generation edge function

This function takes the natural-language requirements and produces a validated AIRspec JSON document. It uses **NDJSON streaming** to send progress events to the client.

```typescript
// supabase/functions/report-generate/index.ts
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const { requirements, sessionId, accountId, reportId, existingSpec, model } = await req.json();
  const selectedModel = model || "gpt-4o";

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));

      try {
        emit({ type: "progress", status: "Initializing...", attempt: 0 });

        const supabase = createClient(/* ... */);
        const { data: dataSources } = await supabase
          .from("data_sources")
          .select("id, slug, name, description, fields_json")
          .eq("enabled", true);

        // Build system prompt with schema cheatsheet + AIRMark reference + example
        const systemPrompt = `You are an AIRspec document generator.
Produce ONLY valid AIRspec JSON — no prose, no markdown, no code fences.

${SCHEMA_CHEATSHEET}

${AIRMARK_REFERENCE}

${EXAMPLE_DOC}

AVAILABLE DATA SOURCES:
${formatSources(dataSources)}

Every field reference MUST exactly match a field listed above.`;

        // Retry loop with validation
        const MAX_RETRIES = 2;
        let specJson: Record<string, unknown> | null = null;
        let validationErrors: string[] = [];

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          emit({ type: "progress", status: `Generating (attempt ${attempt + 1})...`, attempt });

          // Heartbeat to keep connection alive during long LLM calls
          const heartbeat = setInterval(() => emit({ type: "heartbeat", elapsed: 0 }), 8000);

          const userPrompt = buildUserPrompt(requirements, existingSpec, attempt, validationErrors);
          const candidate = await callLLM(selectedModel, systemPrompt, userPrompt);

          clearInterval(heartbeat);

          emit({ type: "progress", status: "Validating...", attempt });
          validationErrors = validateSpec(candidate, dataSources);

          if (validationErrors.length === 0) {
            specJson = candidate;
            break;
          }

          if (attempt === MAX_RETRIES) specJson = candidate;
        }

        // Persist report + version
        const { data: version } = await saveVersion(supabase, reportId, specJson, /* ... */);

        emit({ type: "complete", reportId: version.report_id, versionId: version.id, spec: specJson });
      } catch (err) {
        emit({ type: "error", message: (err as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { ...corsHeaders, "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" },
  });
});
```

### 2.5 What to embed in the system prompt

The generation system prompt must contain three embedded references:

1. **Schema cheatsheet** — the complete AIRspec specification with every field name, type, and constraint. This is the authoritative list; any field not in it is a validation error.
2. **AIRMark reference** — the chart grammar documentation (mark types, encoding channels, tooltip rules, common patterns, selections).
3. **Example document** — a complete valid AIRspec 1.1 document showing parameters, datasets with bindings, layout with filterBar + chart graphicBinding, and interactions.

These are large string constants compiled into the edge function. They are the single source of truth that the LLM sees. Do not rely on the model's training data to know the schema — always embed it.

### 2.6 Validation in the edge function

The edge function must include a `validateSpec()` function that checks the generated JSON against the AIRspec schema. This is the enforcement layer. Key checks:

- `airspec` must be `"1.1"` (not `"1.0"`)
- All top-level fields are in the known set (`airspec`, `meta`, `parameters`, `datasets`, `layout`, `theme`, `interactions`)
- Every `source` in a dataset matches a real data source ID
- Every field reference (in datasets, filters, sort, table columns, chart encodings) matches a real field in that source
- Parameter IDs are unique and valid (`^[a-zA-Z][a-zA-Z0-9_-]{0,63}$`)
- Bindings reference only `select` or `boolean` parameters
- `select`/`multiSelect` parameters have `options` with `{ type: "static", values: [{value, label}] }`
- Chart components have `graphic` or `graphicBinding` (not both, not neither)
- `format` is always an object, never a d3 string
- Interactions reference existing component IDs and selection IDs

When validation fails, feed the errors back into the next retry prompt:

```typescript
function buildUserPrompt(requirements: string, existingSpec: unknown, attempt: number, prevErrors: string[]): string {
  let p = `Generate an AIRspec 1.1 document for:\n\n${requirements}`;
  if (existingSpec) p += `\n\nModify this existing spec:\n${JSON.stringify(existingSpec)}`;
  if (attempt > 0 && prevErrors.length > 0) {
    p += `\n\nYour previous output was REJECTED. Fix EVERY error:\n`;
    p += prevErrors.map((e) => `  - ${e}`).join("\n");
  }
  return p;
}
```

### 2.7 Persistence schema

The edge functions write to these tables:

```sql
-- Chat messages
CREATE TABLE report_generation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  role text NOT NULL,          -- 'user' | 'assistant'
  content text NOT NULL,
  account_id text DEFAULT 'default',
  attachments_json jsonb,
  created_at timestamptz DEFAULT now()
);

-- Reports (one per generated report, updated on re-generation)
CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  account_id text DEFAULT 'default',
  session_id text,
  model text,
  current_version_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Report versions (one per generation attempt)
CREATE TABLE report_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES reports(id),
  version_number integer NOT NULL,
  schema_version text DEFAULT '1.1',
  user_prompt text,
  report_spec_json jsonb NOT NULL,
  generation_model text,
  generation_metadata_json jsonb,
  validation_status text DEFAULT 'valid',
  validation_errors_json text[],
  created_at timestamptz DEFAULT now()
);
```

Enable RLS on every table. For a signed-in app, scope all policies to `auth.uid() = user_id` (or the equivalent ownership column). For a no-auth app, use `TO anon, authenticated`.

---

## Part 3: Model configuration

### 3.1 Model selection in the UI

Expose a model selector in the chat panel. Store the choice in the hook's state and pass it to both edge functions.

```tsx
function ModelSelector({ model, onChange }: { model: string | null; onChange: (m: string) => void }) {
  return (
    <select value={model ?? ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">Default</option>
      <option value="gpt-4o">GPT-4o</option>
      <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
      {/* ... */}
    </select>
  );
}
```

### 3.2 Model routing in edge functions

The edge function determines which provider to call based on the model name. Use a prefix check so new model variants work without code changes:

```typescript
function isOpenAIModel(model: string): boolean {
  return model.startsWith("gpt-");
}

function isAnthropicModel(model: string): boolean {
  return model.startsWith("claude-");
}
```

### 3.3 Provider-specific call patterns

**OpenAI:**

```typescript
async function callOpenAI(apiKey: string, model: string, systemPrompt: string, messages: unknown[]): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_completion_tokens: 16384,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
    }),
  });
  if (!response.ok) throw new Error(`OpenAI error (${response.status}): ${await response.text()}`);
  const data = await response.json();
  return data.choices[0].message.content;
}
```

**Anthropic:**

```typescript
async function callAnthropic(apiKey: string, model: string, systemPrompt: string, messages: unknown[]): Promise<string> {
  const requestBody: Record<string, unknown> = {
    model,
    max_tokens: 16384,
    system: systemPrompt,
    messages,
  };

  // Adaptive thinking models (e.g. Claude with adaptive thinking)
  if (model.includes("fable")) {
    requestBody.thinking = { type: "adaptive" };
    requestBody.output_config = { effort: "high" };
  } else if (model.includes("opus")) {
    requestBody.thinking = { type: "enabled", budget_tokens: 16000 };
  } else {
    requestBody.temperature = 0.3;
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(requestBody),
  });
  if (!response.ok) throw new Error(`Anthropic error (${response.status}): ${await response.text()}`);
  const data = await response.json();
  return (data.content as Array<{ type: string; text?: string }>)
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n");
}
```

### 3.4 Vision (image attachments)

For models that support vision, structure the message content as an array of text + image parts:

**OpenAI format:**
```typescript
{ role: "user", content: [
  { type: "text", text: "Here's a chart style I like" },
  { type: "image_url", image_url: { url: "https://...", detail: "high" } }
]}
```

**Anthropic format:**
```typescript
{ role: "user", content: [
  { type: "text", text: "Here's a chart style I like" },
  { type: "image", source: { type: "url", url: "https://..." } }
]}
```

### 3.5 Fallback when no API key is configured

If neither provider key is available, return a simulated response so the UI remains functional for demos. The fallback should detect keywords and produce a plausible `[READY_TO_GENERATE]` response.

### 3.6 Secret management

API keys are stored as Supabase Edge Function secrets (environment variables). Set them via the Supabase dashboard or CLI:

```bash
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

In the edge function, read them with `Deno.env.get("OPENAI_API_KEY")`. Never expose keys to the client.

---

## Part 4: Streaming from edge functions to React

### 4.1 NDJSON stream protocol

The generate edge function returns `application/x-ndjson` — one JSON object per line. Event types:

```typescript
type StreamEvent =
  | { type: "progress"; status: string; attempt: number; totalAttempts: number }
  | { type: "heartbeat"; elapsed: number; attempt: number }
  | { type: "complete"; reportId: string; versionId: string; spec: unknown; validationErrors: string[] | null; model: string }
  | { type: "error"; message: string };
```

### 4.2 Client-side stream reader

```typescript
// services/api.ts
export async function streamEdgeFunction(
  functionName: string,
  body: Record<string, unknown>,
  onEvent: (event: StreamEvent) => void
): Promise<void> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(`Edge function failed (${response.status})`);

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response stream");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        onEvent(JSON.parse(trimmed) as StreamEvent);
      } catch { /* skip malformed */ }
    }
  }
}
```

### 4.3 Using the stream in the hook

```tsx
const generate = useCallback(async () => {
  setIsGenerating(true);
  setGenerationProgress(null);

  try {
    const requirements = /* extract from last assistant message */;
    await streamEdgeFunction("report-generate", {
      requirements,
      sessionId: sessionIdRef.current,
      model: model ?? undefined,
      reportId: reportId ?? undefined,
      existingSpec: currentSpec ?? undefined,
    }, (event) => {
      if (event.type === "progress") setGenerationProgress(event);
      if (event.type === "complete") {
        setReportId(event.reportId);
        setVersionId(event.versionId);
        setCurrentSpec(event.spec);
        setValidationErrors(event.validationErrors);
      }
      if (event.type === "error") setError(event.message);
    });
  } catch (err) {
    setError(err instanceof Error ? err.message : "Generation failed");
  } finally {
    setIsGenerating(false);
  }
}, [messages, model, reportId, currentSpec]);
```

---

## Part 5: Rendering AIRspec documents in React

### 5.1 ReportProvider — the state container

The renderer is driven by a React context that owns:

- The immutable AIRspec document and version ID
- Parameter state (initialized from defaults)
- Dataset loading/error/data state
- Selection state (chart click selections)
- Binding resolution (parameter → dataset/graphic switching)
- Interaction dispatch (atomic multi-action events)
- A monotonic revision counter to reject stale fetches

```tsx
export function ReportProvider({ document, versionId, children }: ReportProviderProps) {
  const [parameters, setParameters] = useState<Record<string, unknown>>(() => {
    const defaults: Record<string, unknown> = {};
    for (const param of document.parameters ?? []) {
      if (param.default !== undefined) defaults[param.id] = param.default;
    }
    return defaults;
  });

  const [datasets, setDatasets] = useState<Record<string, DatasetState>>({});
  const [selections, setSelections] = useState<Record<string, unknown>>({});
  const revisionRef = useRef(0);

  const setParameter = useCallback((id: string, value: unknown) => {
    revisionRef.current += 1;
    setParameters((prev) => ({ ...prev, [id]: value }));
    // Invalidate + reload affected datasets
    const affected = findAffectedDatasets(document, id);
    scheduleDatasetLoads(affected);
  }, [document]);

  // ... clearParameter, loadDataset, triggerInteraction, resolveGraphic
}
```

### 5.2 Binding resolution

When a parameter changes, datasets and chart graphics that bind to that parameter must switch. The resolver does type-aware case matching:

```tsx
export function resolveBinding<T>(binding: AirspecBinding<T>, parameters: Record<string, unknown>): BindingResult<T> {
  const paramValue = parameters[binding.parameter];
  const match = binding.cases.find((c) => caseMatches(c.equals, paramValue));
  if (match) return { matched: true, value: match.value };
  return { matched: false, value: binding.default };
}

export function caseMatches(equals: string | number | boolean, paramValue: unknown): boolean {
  if (typeof equals === "number") {
    const n = Number(paramValue);
    return !isNaN(n) && n === equals;
  }
  if (typeof equals === "boolean") {
    return Boolean(paramValue) === equals;
  }
  return String(paramValue) === String(equals);
}
```

The type coercion is critical: HTML `<select>` elements return strings, so a numeric case value (`equals: 3`) would never match a string param value (`"3"`) under strict `===`.

### 5.3 Component registry

Use a compile-time registry mapping component type strings to trusted React components:

```tsx
const componentRegistry: Record<string, React.ComponentType<AirComponentProps>> = {
  stack: AirStack,
  grid: AirGrid,
  section: AirSection,
  heading: AirHeading,
  text: AirText,
  divider: AirDivider,
  metric: AirMetric,
  table: AirTable,
  filterBar: AirFilterBar,
  emptyState: AirEmptyState,
  chart: AirChart,
};
```

### 5.4 LayoutWalker

The walker evaluates `visibleWhen`, selects the trusted component from the registry, and renders a safe diagnostic for unknown types:

```tsx
export default function LayoutWalker({ node }: LayoutWalkerProps) {
  const { parameters } = useReportContext();

  if (!evaluateVisibleWhen(node.visibleWhen, parameters)) return null;

  const Component = componentRegistry[node.type];
  if (!Component) {
    return <div className="p-3 text-amber-700">Unknown component type: "{node.type}"</div>;
  }

  return <Component component={node} />;
}
```

Container components (stack, grid, section) recursively render `LayoutWalker` for each child.

### 5.5 Chart component

Use the AIRMark engine for chart rendering. Do not implement chart geometry, scales, axes, or tooltips in React.

```tsx
import { AirmarkChartAuto } from "@airspec/airmark-react";

function AirChart({ component }: AirComponentProps) {
  const { datasets, resolveGraphic, selections, updateSelection, triggerInteraction } = useReportContext();
  const { graphic, bindingError } = resolveGraphic(component);
  const datasetState = datasets[component.datasetId];

  if (bindingError) return <BindingError message={bindingError} />;
  if (!graphic) return <div>No graphic defined</div>;
  if (datasetState?.loading) return <ChartSkeleton />;
  if (datasetState?.error) return <ErrorState message={datasetState.error} />;
  if (!datasetState?.data?.length) return <EmptyState />;

  return (
    <AirmarkChartAuto
      graphic={graphic}
      rows={datasetState.data}
      selectionState={selections}
      onSelect={(selectionId, value, row) => {
        updateSelection(selectionId, "point", [], value, row);
        triggerInteraction(component.id, "select", selectionId, row);
      }}
    />
  );
}
```

### 5.6 Dataset loading

Datasets are loaded via the data broker (server-side execution). The provider tracks loading state per dataset and rejects stale responses using a revision counter:

```tsx
const loadDataset = useCallback((datasetId: string) => {
  const myRevision = revisionRef.current;
  setDatasets((prev) => ({ ...prev, [datasetId]: { loading: true, error: null, data: null, totalRows: 0 } }));

  reportService.fetchDataForReport(versionId, datasetId, parameters)
    .then((result) => {
      if (myRevision !== revisionRef.current) return; // stale, discard
      setDatasets((prev) => ({ ...prev, [datasetId]: { loading: false, error: null, data: result.rows, totalRows: result.totalRows } }));
    })
    .catch((err) => {
      if (myRevision !== revisionRef.current) return;
      setDatasets((prev) => ({ ...prev, [datasetId]: { loading: false, error: err.message, data: null, totalRows: 0 } }));
    });
}, [versionId, parameters]);
```

### 5.7 Interaction dispatch

Interactions are dispatched atomically — all parameter mutations commit first, then affected datasets reload once:

```tsx
const triggerInteraction = useCallback((componentId: string, event: string, selectionId?: string, row?: Record<string, unknown>) => {
  const matched = (document.interactions ?? []).filter(
    (it) => it.on.component === componentId && it.on.event === event && (selectionId ? it.on.selection === selectionId : true)
  );
  if (matched.length === 0) return;

  revisionRef.current += 1;
  const paramChanges: Record<string, unknown> = {};
  const datasetsToRefresh = new Set<string>();

  for (const it of matched) {
    for (const action of it.actions ?? (it.action ? [it.action] : [])) {
      if (action.type === "setParameter") {
        if (action.valueFrom && row) {
          paramChanges[action.parameter] = row[action.valueFrom.field];
        } else {
          paramChanges[action.parameter] = action.value;
        }
      } else if (action.type === "clearParameter") {
        // mark for deletion
      } else if (action.type === "refresh") {
        action.datasetIds?.forEach((id) => datasetsToRefresh.add(id));
      }
    }
  }

  // Commit all parameter changes atomically
  setParameters((prev) => ({ ...prev, ...paramChanges }));

  // Reload affected datasets (each at most once)
  scheduleDatasetLoads([...datasetsToRefresh]);
}, [document]);
```

### 5.8 Full render tree

```tsx
function ReportViewer({ spec, versionId }: { spec: AirspecDocument; versionId: string | null }) {
  return (
    <ReportProvider document={spec} versionId={versionId}>
      <div className="report-container">
        <LayoutWalker node={spec.layout} />
      </div>
    </ReportProvider>
  );
}
```

---

## Part 6: Service layer pattern

All Supabase access must go through a service layer. UI components never import `supabase` directly.

```typescript
// services/api.ts — the ONLY file that touches the raw Supabase client
import { supabase } from "../lib/supabase";
export { supabase };

export async function callEdgeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Edge function ${name} failed (${response.status})`);
  return response.json() as Promise<T>;
}

export async function streamEdgeFunction(name: string, body: Record<string, unknown>, onEvent: (e: StreamEvent) => void): Promise<void> {
  // ... as shown in Part 4.2
}
```

```typescript
// services/reportService.ts — domain-specific operations
export const reportService = {
  async sendChatMessage(messages: ChatMessage[], sessionId: string, model?: string) {
    return callEdgeFunction<ChatResponse>("report-chat", { messages, sessionId, model });
  },

  async generateReport(params: GenerateParams, onProgress?: (e: StreamEvent) => void) {
    // Uses streamEdgeFunction internally
  },

  async fetchDataForReport(versionId: string, datasetId: string, parameters: Record<string, unknown>) {
    return callEdgeFunction<FetchDataResponse>("data-broker", { versionId, datasetId, parameters });
  },

  async getChatHistory(sessionId: string): Promise<ChatMessage[]> { /* ... */ },
  async getReportVersion(versionId: string): Promise<ReportVersion> { /* ... */ },
};
```

---

## Part 7: Putting it together — the chat-to-render flow

```text
1. User opens the report builder
   └─ useReportChat() initializes with a fresh sessionId

2. User types "I want a bar chart of sales by region"
   └─ sendMessage() appends user message, calls report-chat edge function
   └─ Edge function calls LLM with system prompt + data source catalog
   └─ LLM responds with clarifying questions
   └─ Assistant message appended, isReadyToGenerate = false

3. User answers questions, maybe attaches a reference image
   └─ Image uploaded to Supabase Storage, URL included in message
   └─ Edge function passes image URL to vision-capable LLM
   └─ LLM responds with summary + [READY_TO_GENERATE]
   └─ isReadyToGenerate = true, "Generate Report" button appears

4. User clicks "Generate Report"
   └─ generate() calls report-generate edge function via NDJSON stream
   └─ Edge function:
      a. Fetches data source catalog
      b. Builds system prompt (schema cheatsheet + AIRMark ref + example + sources)
      c. Calls LLM with requirements
      d. Validates JSON output against AIRspec schema
      e. If invalid, retries with error feedback (up to MAX_RETRIES)
      f. Persists report + version to Postgres
      g. Emits { type: "complete", spec, reportId, versionId }
   └─ Hook stores spec, reportId, versionId
   └─ ReportPreview renders the spec via ReportProvider + LayoutWalker

5. User interacts with the rendered report
   └─ Changes parameter → setParameter() → affected datasets reload
   └─ Clicks chart mark → updateSelection() + triggerInteraction()
   └─ Interaction sets parameters atomically, datasets refresh once
```

---

## Checklist for adding chat + generation to an AIRspec Host

- [ ] Service layer file that owns `callEdgeFunction` and `streamEdgeFunction`
- [ ] `useReportChat` hook managing messages, model, attachments, generation state
- [ ] Chat panel component with message list, input, attachment tray, model selector
- [ ] Image upload to Supabase Storage with public URL
- [ ] `report-chat` edge function: system prompt with data source catalog, LLM call, message persistence
- [ ] `report-generate` edge function: schema cheatsheet + AIRMark reference + example in system prompt, LLM call, validation, retry loop, NDJSON streaming, persistence
- [ ] `validateSpec` function in the generate edge function covering all AIRspec 1.1 constraints
- [ ] Model routing (OpenAI vs Anthropic) with prefix-based detection
- [ ] Vision message formatting for both providers
- [ ] Fallback response when no API key is configured
- [ ] API keys stored as Supabase Edge Function secrets
- [ ] `ReportProvider` with parameter state, dataset loading, binding resolution, interaction dispatch, revision tracking
- [ ] `componentRegistry` mapping type strings to trusted React components
- [ ] `LayoutWalker` evaluating `visibleWhen` and selecting from registry
- [ ] Chart component using AIRMark engine (not custom geometry)
- [ ] RLS enabled on all tables with per-CRUD policies
- [ ] No `window.alert` — custom modals for all confirmations
- [ ] Loading, empty, error, and unauthorized states for every data-bound component
