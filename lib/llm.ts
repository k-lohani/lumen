import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import type { ZodType } from "zod";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    client = new Anthropic({ apiKey });
  }
  return client;
}

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export function isAnthropicUnavailableError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /credit balance|invalid_request_error|authentication|401|403|429|overloaded/i.test(
    msg
  );
}

export function formatLlmError(error: unknown): string {
  if (isAnthropicUnavailableError(error)) {
    return "Anthropic API is unavailable (check billing/credits or API key). Library patients can use golden profiles when LLM calls fail.";
  }
  return error instanceof Error ? error.message : "LLM request failed";
}

function logCall(stage: string, payload: unknown) {
  try {
    const dir = join(process.cwd(), ".lumen-logs");
    mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    writeFileSync(join(dir, `${ts}-${stage}.json`), JSON.stringify(payload, null, 2));
  } catch {
    // logging must not break pipeline
  }
}

export async function structured<T>(opts: {
  model: string;
  system: string;
  user: string;
  toolName: string;
  schema: ZodType<T>;
  stage?: string;
}): Promise<T> {
  const { model, system, user, schema, stage = "llm" } = opts;

  const run = async (): Promise<T> => {
    const response = await getClient().messages.parse({
      model,
      max_tokens: 8192,
      temperature: 0,
      system,
      messages: [{ role: "user", content: user }],
      output_config: {
        format: zodOutputFormat(schema),
      },
    });

    logCall(stage, { system, user, response: response.content });

    if (response.parsed_output == null) {
      throw new Error(`No parsed_output in response for ${opts.toolName}`);
    }
    return schema.parse(response.parsed_output);
  };

  try {
    return await run();
  } catch (error) {
    if (isAnthropicUnavailableError(error)) throw error;
    return await run();
  }
}

export function evalModel(): string {
  return process.env.ANTHROPIC_MODEL_EVAL ?? "claude-sonnet-4-6";
}

export function cheapModel(): string {
  return process.env.ANTHROPIC_MODEL_CHEAP ?? "claude-haiku-4-5";
}
