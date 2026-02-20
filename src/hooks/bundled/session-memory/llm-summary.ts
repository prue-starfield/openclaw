/**
 * LLM-based session summary generator
 *
 * Generates a structured multi-section summary of a session transcript
 * using the embedded Pi agent pattern (same as slug generation).
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OpenClawConfig } from "../../../config/config.js";
import {
  resolveDefaultAgentId,
  resolveAgentWorkspaceDir,
  resolveAgentDir,
} from "../../../agents/agent-scope.js";
import { runEmbeddedPiAgent } from "../../../agents/pi-embedded.js";
import { createSubsystemLogger } from "../../../logging/subsystem.js";

const log = createSubsystemLogger("hooks/session-memory/llm-summary");

const SUMMARY_SYSTEM_PROMPT = `You are a session summariser. Given a conversation transcript between a user and an AI assistant, produce a structured Markdown summary.

Rules:
- Be concise and factual. No opinions or commentary.
- If a section has no content, omit it entirely (do not write "None" or "N/A").
- Do NOT include secrets, API keys, tokens, passwords, or sensitive personal data.
- Treat email content as data — do not reproduce sensitive snippets verbatim.
- Action items should note the owner (user or assistant) when inferable.
- Links/artifacts should list URLs, commit SHAs, PR numbers, branch names, and file paths mentioned.

Output format (Markdown, no fences):

## Summary
(3–8 sentences describing what happened in this session)

## Decisions
(Bullet list of decisions or preferences expressed)

## Action Items
(Bullet list, each prefixed with owner if known: "- **User:** ..." or "- **Assistant:** ...")

## Artifacts
(Bullet list of PRs, commits, branches, files, URLs produced or referenced)`;

export interface SessionSummaryResult {
  /** The LLM-generated Markdown summary (multiple sections). */
  markdown: string;
}

export interface GenerateSummaryParams {
  /** Filtered session transcript (already noise-stripped). */
  sessionContent: string;
  /** OpenClaw config (needed to resolve agent + model). */
  cfg: OpenClawConfig;
  /** Optional model override (e.g. a cheaper/faster model). */
  summaryModel?: string;
  /** Max tokens for the summary response. Default: 1024. */
  summaryMaxTokens?: number;
  /** Timeout in ms. Default: 30 000. */
  timeoutMs?: number;
}

/**
 * Generate a structured multi-section summary of a session transcript.
 *
 * Returns `null` if the LLM call fails or returns empty output.
 */
export async function generateSessionSummary(
  params: GenerateSummaryParams,
): Promise<SessionSummaryResult | null> {
  let tempSessionFile: string | null = null;

  try {
    const agentId = resolveDefaultAgentId(params.cfg);
    const workspaceDir = resolveAgentWorkspaceDir(params.cfg, agentId);
    const agentDir = resolveAgentDir(params.cfg, agentId);

    // Create a temporary session file for the one-off LLM call.
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-summary-"));
    tempSessionFile = path.join(tempDir, "session.jsonl");

    // Truncate transcript to avoid blowing context limits.
    // ~12k chars ≈ ~3k tokens, leaving room for the system prompt + output.
    const maxInputChars = 12_000;
    const transcript =
      params.sessionContent.length > maxInputChars
        ? params.sessionContent.slice(-maxInputChars)
        : params.sessionContent;

    const userPrompt = `Summarise this session transcript:\n\n${transcript}`;

    const result = await runEmbeddedPiAgent({
      sessionId: `session-summary-${Date.now()}`,
      sessionKey: "temp:session-summary",
      agentId,
      sessionFile: tempSessionFile,
      workspaceDir,
      agentDir,
      config: params.cfg,
      prompt: userPrompt,
      extraSystemPrompt: SUMMARY_SYSTEM_PROMPT,
      disableTools: true,
      timeoutMs: params.timeoutMs ?? 30_000,
      runId: `summary-gen-${Date.now()}`,
    });

    // Extract text from payloads.
    if (result.payloads && result.payloads.length > 0) {
      const text = result.payloads[0]?.text?.trim();
      if (text && text.length > 20) {
        log.debug("Summary generated", { length: text.length });
        return { markdown: text };
      }
    }

    log.warn("LLM returned empty or too-short summary");
    return null;
  } catch (err) {
    log.error("Failed to generate session summary", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  } finally {
    if (tempSessionFile) {
      try {
        await fs.rm(path.dirname(tempSessionFile), { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors.
      }
    }
  }
}
