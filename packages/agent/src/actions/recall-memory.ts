import { KageMemoryPlugin } from "../plugins/kage-memory.js";
import { MemoryContent, MemoryEntry } from "@kage/sdk";

/**
 * Recall Memory Action
 * Parses natural language input and retrieves memories from the vault
 */

export interface RecallMemoryParams {
  memoryId?: string;
  searchTags?: string[];
  searchQuery?: string;
  listAll?: boolean;
}

export interface RecallMemoryResult {
  success: boolean;
  memories?: MemoryContent[];
  entries?: MemoryEntry[];
  message: string;
}

/**
 * Parse user input to extract memory recall intent
 */
export function parseRecallIntent(input: string): RecallMemoryParams | null {
  const lowerInput = input.toLowerCase();

  if (
    lowerInput.includes("what do you remember") ||
    lowerInput.includes("list all memories") ||
    lowerInput.includes("show all memories") ||
    lowerInput.includes("what do you know about me")
  ) {
    return { listAll: true };
  }

  const recallPatterns = [
    /recall (?:memory )?(.+)/i,
    /retrieve (?:memory )?(.+)/i,
    /what (?:do you know|did i say) about (.+)/i,
    /find memories? (?:about |tagged |with )?(.+)/i,
    /search (?:for )?(.+)/i,
  ];

  for (const pattern of recallPatterns) {
    const match = input.match(pattern);
    if (match) {
      const query = match[1].trim();

      if (query.startsWith("Qm") || query.length === 46) {
        return { memoryId: query };
      }

      const tags = extractSearchTags(query);
      return {
        searchTags: tags.length > 0 ? tags : undefined,
        searchQuery: query,
      };
    }
  }

  return null;
}

/**
 * Extract search tags from query
 */
function extractSearchTags(query: string): string[] {
  const tags: string[] = [];

  const hashtagMatches = query.match(/#(\w+)/g);
  if (hashtagMatches) {
    tags.push(...hashtagMatches.map((t) => t.slice(1)));
  }

  return tags;
}

/**
 * Execute recall memory action
 */
export async function executeRecallMemory(
  plugin: KageMemoryPlugin,
  params: RecallMemoryParams
): Promise<RecallMemoryResult> {
  if (params.listAll) {
    const result = await plugin.listMemories({});
    if (result.success && result.memories) {
      return {
        success: true,
        entries: result.memories,
        message: `Found ${result.memories.length} memories`,
      };
    }
    return {
      success: false,
      message: result.error || "Failed to list memories",
    };
  }

  if (params.memoryId) {
    const result = await plugin.recallMemory({ memoryId: params.memoryId });
    if (result.success && result.memory) {
      return {
        success: true,
        memories: [result.memory],
        message: "Memory retrieved successfully",
      };
    }
    return {
      success: false,
      message: result.error || "Memory not found",
    };
  }

  if (params.searchTags) {
    const result = await plugin.searchMemories({ tags: params.searchTags });
    if (result.success && result.memories) {
      return {
        success: true,
        memories: result.memories,
        message: `Found ${result.memories.length} matching memories`,
      };
    }
    return {
      success: false,
      message: result.error || "Search failed",
    };
  }

  return {
    success: false,
    message: "Unable to determine what to recall",
  };
}

/**
 * Generate response for recall memory action
 */
export function generateRecallResponse(
  result: RecallMemoryResult,
  params: RecallMemoryParams
): string {
  if (!result.success) {
    return `I couldn't retrieve those memories. ${result.message}`;
  }

  if (result.entries && result.entries.length > 0) {
    const entryList = result.entries
      .map((e, i) => `${i + 1}. [${e.memoryType}] ID: ${e.cid.slice(0, 12)}...`)
      .join("\n");

    return `I have ${result.entries.length} memories stored in my vault:\n\n${entryList}\n\nAll memories are securely encrypted and only visible to you.`;
  }

  if (result.memories && result.memories.length > 0) {
    if (result.memories.length === 1) {
      const memory = result.memories[0];
      const content =
        typeof memory.data === "object"
          ? JSON.stringify(memory.data, null, 2)
          : String(memory.data);

      return `Here's what I found:\n\n${content}\n\nTags: ${memory.metadata.tags.join(", ") || "none"}`;
    }

    const memoryList = result.memories
      .map((m, i) => {
        const preview =
          typeof m.data === "object"
            ? JSON.stringify(m.data).slice(0, 50)
            : String(m.data).slice(0, 50);
        return `${i + 1}. ${preview}...`;
      })
      .join("\n");

    return `I found ${result.memories.length} matching memories:\n\n${memoryList}`;
  }

  if (params.listAll) {
    return "Your memory vault is empty. I haven't stored any memories yet.";
  }

  return "I couldn't find any memories matching your request.";
}
