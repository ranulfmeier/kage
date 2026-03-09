import { KageMemoryPlugin } from "../plugins/kage-memory.js";
import { MemoryType } from "@kage/sdk";

/**
 * Store Memory Action
 * Parses natural language input and stores memory in the vault
 */

export interface StoreMemoryParams {
  content: string;
  label?: string;
  tags?: string[];
  type?: MemoryType;
}

export interface StoreMemoryResult {
  success: boolean;
  memoryId?: string;
  message: string;
}

/**
 * Parse user input to extract memory storage intent
 */
export function parseStoreIntent(input: string): StoreMemoryParams | null {
  const lowerInput = input.toLowerCase();

  const rememberPatterns = [
    /remember (?:that )?(.+)/i,
    /save (?:that )?(.+)/i,
    /store (?:that )?(.+)/i,
    /note (?:that )?(.+)/i,
    /keep in mind (?:that )?(.+)/i,
  ];

  for (const pattern of rememberPatterns) {
    const match = input.match(pattern);
    if (match) {
      const content = match[1].trim();
      const type = inferMemoryType(lowerInput);
      const tags = extractTags(content);

      return {
        content,
        type,
        tags,
      };
    }
  }

  return null;
}

/**
 * Infer memory type from content
 */
function inferMemoryType(content: string): MemoryType {
  const preferenceKeywords = [
    "favorite",
    "prefer",
    "like",
    "love",
    "hate",
    "dislike",
  ];
  const taskKeywords = ["remind", "todo", "task", "deadline", "meeting", "appointment"];
  const behaviorKeywords = ["always", "usually", "often", "never", "habit"];

  if (preferenceKeywords.some((k) => content.includes(k))) {
    return MemoryType.Preference;
  }
  if (taskKeywords.some((k) => content.includes(k))) {
    return MemoryType.Task;
  }
  if (behaviorKeywords.some((k) => content.includes(k))) {
    return MemoryType.Behavior;
  }

  return MemoryType.Conversation;
}

/**
 * Extract tags from content
 */
function extractTags(content: string): string[] {
  const tags: string[] = [];

  const hashtagMatches = content.match(/#(\w+)/g);
  if (hashtagMatches) {
    tags.push(...hashtagMatches.map((t) => t.slice(1)));
  }

  const categoryKeywords = [
    "work",
    "personal",
    "health",
    "finance",
    "travel",
    "food",
    "entertainment",
  ];
  const lowerContent = content.toLowerCase();
  for (const keyword of categoryKeywords) {
    if (lowerContent.includes(keyword)) {
      tags.push(keyword);
    }
  }

  return [...new Set(tags)];
}

/**
 * Execute store memory action
 */
export async function executeStoreMemory(
  plugin: KageMemoryPlugin,
  params: StoreMemoryParams
): Promise<StoreMemoryResult> {
  const result = await plugin.storeMemory({
    data: { content: params.content },
    label: params.label,
    tags: params.tags || [],
    source: "conversation",
    type: params.type || MemoryType.Conversation,
  });

  if (result.success) {
    return {
      success: true,
      memoryId: result.memoryId,
      message: `Memory stored securely. ID: ${result.memoryId}`,
    };
  }

  return {
    success: false,
    message: `Failed to store memory: ${result.error}`,
  };
}

/**
 * Generate response for store memory action
 */
export function generateStoreResponse(
  result: StoreMemoryResult,
  params: StoreMemoryParams
): string {
  if (result.success) {
    const typeLabel = params.type || "conversation";
    const tagInfo =
      params.tags && params.tags.length > 0
        ? ` Tags: ${params.tags.join(", ")}.`
        : "";

    return `I've securely stored this in my encrypted memory vault as a ${typeLabel} memory.${tagInfo} This information is encrypted and only accessible by you.`;
  }

  return `I wasn't able to store that memory. ${result.message}`;
}
