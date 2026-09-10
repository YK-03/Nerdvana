export type GroqWorkload = "answer" | "timeline" | "chat";

export type GroqGenerationResult = {
  status: "success" | "provider_failure" | "invalid_response";
  text: string | null;
  provider: "groq" | null;
  model: string | null;
  fallbackUsed: boolean;
};

type GroqWorkloadConfig = {
  primaryModel: string;
  fallbackModel: string | null;
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
};

type GenerateGroqTextOptions = {
  prompt: string;
  workload: GroqWorkload;
  accept?: (text: string) => boolean;
};

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-120b";

const WORKLOAD_CONFIG: Record<GroqWorkload, {
  modelEnv: string;
  fallbackModelEnv: string;
  maxTokens: number;
  temperature: number;
}> = {
  answer: {
    modelEnv: "GROQ_ANSWER_MODEL",
    fallbackModelEnv: "GROQ_ANSWER_FALLBACK_MODEL",
    maxTokens: 1500,
    temperature: 0.7,
  },
  chat: {
    modelEnv: "GROQ_CHAT_MODEL",
    fallbackModelEnv: "GROQ_CHAT_FALLBACK_MODEL",
    maxTokens: 1500,
    temperature: 0.7,
  },
  timeline: {
    modelEnv: "GROQ_TIMELINE_MODEL",
    fallbackModelEnv: "GROQ_TIMELINE_FALLBACK_MODEL",
    maxTokens: 1800,
    temperature: 0.2,
  },
};

function serverEnv(): Record<string, string | undefined> {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
}

export function getGroqApiKey(): string | undefined {
  return serverEnv().GROQ_API_KEY?.trim() || undefined;
}

export function getGroqWorkloadConfig(workload: GroqWorkload): GroqWorkloadConfig {
  const env = serverEnv();
  const defaults = WORKLOAD_CONFIG[workload];
  const primaryModel = env[defaults.modelEnv]?.trim() || DEFAULT_MODEL;
  const fallbackModel = env[defaults.fallbackModelEnv]?.trim() || null;

  return {
    primaryModel,
    fallbackModel: fallbackModel && fallbackModel !== primaryModel ? fallbackModel : null,
    maxTokens: defaults.maxTokens,
    temperature: defaults.temperature,
    timeoutMs: 15_000,
  };
}

function classifyProviderFailure(status: number): string {
  if (status === 401 || status === 403) return "authentication/configuration_failure";
  if (status === 404) return "unavailable_or_invalid_model";
  if (status === 429) return "quota_or_rate_limit";
  if (status >= 500 && status <= 599) return "transient_provider_failure";
  return "provider_failure";
}

async function requestGroqModel(
  prompt: string,
  model: string,
  config: GroqWorkloadConfig,
): Promise<{ text: string | null; failureReason?: string; status?: number }> {
  const apiKey = getGroqApiKey();
  if (!apiKey) return { text: null, failureReason: "missing_groq_api_key" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: config.maxTokens,
        temperature: config.temperature,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return { text: null, status: response.status, failureReason: classifyProviderFailure(response.status) };
    }

    const data = await response.json();
    const text = typeof data?.choices?.[0]?.message?.content === "string"
      ? data.choices[0].message.content.trim()
      : "";
    return text
      ? { text, status: response.status }
      : { text: null, status: response.status, failureReason: "empty_provider_response" };
  } catch (error) {
    const failureReason = error instanceof DOMException && error.name === "AbortError"
      ? "timeout"
      : "provider_request_error";
    return { text: null, failureReason };
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateGroqText({ prompt, workload, accept }: GenerateGroqTextOptions): Promise<GroqGenerationResult> {
  const config = getGroqWorkloadConfig(workload);
  const models = [config.primaryModel, config.fallbackModel].filter((model): model is string => Boolean(model));
  let sawText = false;
  let sawInvalidResponse = false;
  let lastModel: string | null = null;

  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    lastModel = model;
    const label = index === 0 ? "primary" : "fallback";
    console.log("[GROQ_PROVIDER_ATTEMPT]", { workload, role: label, model });
    const attempt = await requestGroqModel(prompt, model, config);

    if (!attempt.text) {
      console.warn("[GROQ_PROVIDER_FAILURE]", {
        workload,
        role: label,
        model,
        status: attempt.status,
        failureReason: attempt.failureReason,
      });
      continue;
    }

    sawText = true;
    if (accept && !accept(attempt.text)) {
      sawInvalidResponse = true;
      console.warn("[GROQ_PROVIDER_INVALID_RESPONSE]", { workload, role: label, model });
      continue;
    }

    console.log("[GROQ_PROVIDER_SUCCESS]", {
      workload,
      role: label,
      model,
      fallbackUsed: index > 0,
    });
    return {
      status: "success",
      text: attempt.text,
      provider: "groq",
      model,
      fallbackUsed: index > 0,
    };
  }

  return {
    status: sawText && sawInvalidResponse ? "invalid_response" : "provider_failure",
    text: null,
    provider: null,
    model: lastModel,
    fallbackUsed: models.length > 1,
  };
}
