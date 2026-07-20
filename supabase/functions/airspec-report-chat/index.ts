import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ChatAttachment {
  id: string;
  path: string;
  url: string;
  filename: string;
  contentType: string;
  size: number;
}

interface IncomingMessage {
  role: string;
  content: string;
  attachments?: ChatAttachment[];
}

const OPENAI_MODELS = ["gpt-5.5", "gpt-5.5-pro", "gpt-5.6"];
const ANTHROPIC_MODELS = ["claude-fable-5", "claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"];

function isOpenAIModel(model: string): boolean {
  return OPENAI_MODELS.includes(model) || model.startsWith("gpt-");
}

function isAnthropicModel(model: string): boolean {
  return ANTHROPIC_MODELS.includes(model) || model.startsWith("claude-");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { messages, sessionId, accountId, model } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "messages array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const selectedModel = model || "gpt-5.6";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch enabled data sources dynamically
    const { data: dataSources } = await supabase
      .from("airspec_data_sources")
      .select("name, description, fields_json, constraints_json")
      .eq("enabled", true);

    const sourceContext = (dataSources ?? [])
      .map((ds: { name: string; description: string | null; fields_json: { name: string; type: string; description?: string }[] }) => {
        const fieldList = ds.fields_json
          .map((f: { name: string; type: string; description?: string }) => {
            const desc = f.description ? ` — ${f.description}` : "";
            return `    "${f.name}" (${f.type})${desc}`;
          })
          .join("\n");
        return `Source: "${ds.name}"${ds.description ? ` — ${ds.description}` : ""}\n  FIELDS (EXHAUSTIVE — no other fields exist):\n${fieldList}\n  [END OF FIELDS]`;
      })
      .join("\n\n");

    const systemPrompt = `You are a report requirements gathering assistant for the AIRspec reporting system. Your job is to ask clarifying questions to understand what report the user wants to build, then signal when you have enough information.

AVAILABLE DATA SOURCES:
${sourceContext || "No data sources are currently enabled. Inform the user they need to enable at least one data source in the Datasets section."}

CRITICAL FIELD RULE: When referencing data fields in your requirements summary, ONLY use the exact field names listed above for each source. Do NOT invent, assume, or substitute any field name not explicitly listed. Field names are case-sensitive and exact.

CAPABILITIES (AIRspec 1.1):
- Charts via AIRMark grammar: bar, line, area, point/circle, arc (donut), tick, rule marks with x/y/color/size/theta encodings
- Reactive dashboards: parameter switches that change dataset dimensions/metrics/sort/limit/fields and chart graphics (graphicBinding)
- Interactions: chart selections that set parameters and cross-filter; atomic multi-action events
- Layouts: stack, grid, section (collapsible), filter bars
- Metrics: single value displays with formatting (currency, percent, compact)
- Tables: sortable/paginated with conditional cell styling
- Parameters: select, multiSelect, text, number, boolean, date, dateRange

YOUR BEHAVIOR:
1. Ask clarifying questions about: which data source to use, what metrics/dimensions they want, visualization preferences, any filters or parameters needed
2. Be concise and helpful - ask 1-3 questions at a time
3. When you have enough information to generate a report, respond with your understanding summary followed by the exact marker: [READY_TO_GENERATE]
4. The text BEFORE [READY_TO_GENERATE] becomes the generation prompt, so make it a clear, structured requirements summary
5. When the user attaches reference images of charts/dashboards, analyze them carefully and incorporate the visual style, chart types, color schemes, and layout patterns you see into your requirements understanding. Describe what you observe in the images and confirm whether the user wants a similar look.

EXAMPLE READY RESPONSE:
"Here's what I'll build for you:
- A dashboard showing penguin body mass by species
- Bar chart grouped by species, colored by island (similar style to your reference image)
- Filter by sex (singleSelect parameter)
- Table showing all records below the chart

[READY_TO_GENERATE]"

NEVER generate JSON or code. Only gather requirements and produce a natural language summary.`;

    // Determine which provider to use
    const useAnthropic = isAnthropicModel(selectedModel);
    const useOpenAI = isOpenAIModel(selectedModel);

    // Check for available API key
    if (useAnthropic && !anthropicKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (useOpenAI && !openaiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // No valid key for either
    if (!useAnthropic && !useOpenAI) {
      const lastMessage = messages[messages.length - 1] as IncomingMessage;
      const hasImages = lastMessage.attachments && lastMessage.attachments.length > 0;
      const simulatedResponse = generateFallbackResponse(lastMessage.content ?? "", sourceContext, hasImages);
      await persistMessages(supabase, sessionId, accountId, messages as IncomingMessage[], simulatedResponse);
      return new Response(
        JSON.stringify({ message: simulatedResponse, isReadyToGenerate: simulatedResponse.includes("[READY_TO_GENERATE]") }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let assistantMessage: string;

    if (useAnthropic) {
      assistantMessage = await callAnthropic(anthropicKey!, selectedModel, systemPrompt, messages as IncomingMessage[]);
    } else {
      assistantMessage = await callOpenAI(openaiKey!, selectedModel, systemPrompt, messages as IncomingMessage[]);
    }

    // Persist messages
    await persistMessages(supabase, sessionId, accountId, messages as IncomingMessage[], assistantMessage);

    return new Response(
      JSON.stringify({
        message: assistantMessage,
        isReadyToGenerate: assistantMessage.includes("[READY_TO_GENERATE]"),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const error = err as Error;
    console.error(`[airspec-report-chat] Error:`, error.message, error.stack);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function callOpenAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: IncomingMessage[]
): Promise<string> {
  const openaiMessages = buildOpenAIMessages(messages, systemPrompt);
  const requestBody = {
    model,
    max_completion_tokens: 1024,
    messages: openaiMessages,
  };

  console.log(`[OpenAI] Calling model=${model}, messages=${openaiMessages.length}`);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  const responseText = await response.text();
  console.log(`[OpenAI] Response status=${response.status}, body=${responseText.slice(0, 500)}`);

  if (!response.ok) {
    throw new Error(`OpenAI API error (${response.status}): ${responseText}`);
  }

  const data = JSON.parse(responseText);
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    console.error(`[OpenAI] Unexpected response structure:`, JSON.stringify(data).slice(0, 1000));
    throw new Error(`OpenAI returned empty content. Response: ${JSON.stringify(data).slice(0, 500)}`);
  }
  return content;
}

async function callAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: IncomingMessage[]
): Promise<string> {
  const anthropicMessages = buildAnthropicMessages(messages);

  // Fable 5 uses adaptive thinking (no budget_tokens, no temperature/top_p).
  // Older 4.x models use budget-based extended thinking.
  const ADAPTIVE_MODELS = ["claude-fable-5"];
  const BUDGET_MODELS = ["claude-opus-4-8"];
  const isAdaptive = ADAPTIVE_MODELS.some(m => model.includes(m));
  const isBudget = BUDGET_MODELS.some(m => model.includes(m));

  const requestBody: Record<string, unknown> = {
    model,
    max_tokens: (isAdaptive || isBudget) ? 16000 : 1024,
    system: systemPrompt,
    messages: anthropicMessages,
  };

  if (isAdaptive) {
    requestBody.thinking = { type: "adaptive" };
    requestBody.output_config = { effort: "high" };
  } else if (isBudget) {
    requestBody.thinking = { type: "enabled", budget_tokens: 10000 };
  } else {
    requestBody.temperature = 0.7;
  }

  console.log(`[Anthropic] Calling model=${model}, messages=${anthropicMessages.length}`);
  console.log(`[Anthropic] Request body:`, JSON.stringify(requestBody).slice(0, 2000));

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(requestBody),
  });

  const responseText = await response.text();
  console.log(`[Anthropic] Response status=${response.status}, body=${responseText.slice(0, 500)}`);

  if (!response.ok) {
    throw new Error(`Anthropic API error (${response.status}): ${responseText}`);
  }

  const data = JSON.parse(responseText);
  const text = (data.content as Array<{ type: string; text?: string }>)
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n");

  if (!text) {
    console.error(`[Anthropic] No text blocks in response:`, JSON.stringify(data).slice(0, 1000));
    throw new Error(`Anthropic returned no text content. Response: ${JSON.stringify(data).slice(0, 500)}`);
  }
  return text;
}

function buildAnthropicMessages(messages: IncomingMessage[]): { role: string; content: string | { type: string; text?: string; source?: { type: string; url?: string } }[] }[] {
  const result: { role: string; content: string | { type: string; text?: string; source?: { type: string; url?: string } }[] }[] = [];

  for (const msg of messages) {
    const hasAttachments = msg.attachments && msg.attachments.length > 0;

    if (hasAttachments && msg.role === "user") {
      const parts: { type: string; text?: string; source?: { type: string; media_type: string; data: string } }[] = [];
      if (msg.content) {
        parts.push({ type: "text", text: msg.content });
      }
      for (const att of msg.attachments!) {
        parts.push({
          type: "image",
          source: { type: "url", url: att.url },
        });
      }
      result.push({ role: "user", content: parts });
    } else {
      result.push({ role: msg.role, content: msg.content });
    }
  }

  return result;
}

function buildOpenAIMessages(
  messages: IncomingMessage[],
  systemPrompt: string
): { role: string; content: string | { type: string; text?: string; image_url?: { url: string; detail: string } }[] }[] {
  const result: { role: string; content: string | { type: string; text?: string; image_url?: { url: string; detail: string } }[] }[] = [
    { role: "system", content: systemPrompt },
  ];

  for (const msg of messages) {
    const hasAttachments = msg.attachments && msg.attachments.length > 0;

    if (hasAttachments && msg.role === "user") {
      const parts: { type: string; text?: string; image_url?: { url: string; detail: string } }[] = [];
      if (msg.content) {
        parts.push({ type: "text", text: msg.content });
      }
      for (const att of msg.attachments!) {
        parts.push({
          type: "image_url",
          image_url: { url: att.url, detail: "high" },
        });
      }
      result.push({ role: "user", content: parts });
    } else {
      result.push({ role: msg.role, content: msg.content });
    }
  }

  return result;
}

function generateFallbackResponse(userMessage: string, sourceContext: string, hasImages?: boolean): string {
  const lower = userMessage.toLowerCase();

  if (!sourceContext) {
    return "It looks like there are no data sources enabled yet. Please go to the Datasets section and add/enable at least one data source before creating reports.";
  }

  if (hasImages) {
    return "I can see the reference image(s) you've attached. I'll use these as inspiration for the chart style and layout. Could you tell me:\n\n1. Which data source would you like to use?\n2. What specific metrics should be displayed?\n3. Are there any specific elements from the reference image(s) you want me to replicate (colors, chart type, layout)?";
  }

  if (lower.includes("ready") || lower.includes("generate") || lower.includes("go ahead") || lower.includes("yes") || lower.includes("looks good") || lower.includes("perfect")) {
    return `Here's what I'll build based on our conversation:
- A report using the available data sources
- Visualizations showing key metrics and distributions
- Appropriate filters for interactivity

[READY_TO_GENERATE]`;
  }

  if (lower.includes("chart") || lower.includes("graph") || lower.includes("show") || lower.includes("report") || lower.includes("dashboard")) {
    return "I can help you build that! A few questions:\n\n1. Which data source would you like to use?\n2. What specific metrics or comparisons are you most interested in?\n3. Do you have a preferred visualization type (bar chart, line chart, pie chart, table)?\n\nTip: You can also attach a screenshot of a chart style you like as a reference!";
  }

  return "I'd be happy to help you create a report! What kind of data would you like to visualize? You can describe what insights you're looking for, and I'll help figure out the best way to present them.\n\nYou can also attach reference images of charts or dashboards you like, and I'll use them as style inspiration.";
}

async function persistMessages(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
  accountId: string,
  messages: IncomingMessage[],
  assistantResponse: string
) {
  const lastUserMsg = messages[messages.length - 1];
  const attachments = lastUserMsg.attachments && lastUserMsg.attachments.length > 0
    ? lastUserMsg.attachments
    : null;

  const rows = [
    {
      session_id: sessionId,
      role: lastUserMsg.role,
      content: lastUserMsg.content,
      account_id: accountId || "default",
      attachments_json: attachments,
    },
    {
      session_id: sessionId,
      role: "assistant",
      content: assistantResponse,
      account_id: accountId || "default",
      attachments_json: null,
    },
  ];

  await supabase.from("airspec_report_generation_messages").insert(rows);
}
