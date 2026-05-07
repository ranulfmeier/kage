import { describe, it, expect } from "vitest";
import { MemoryType } from "@kage/sdk";
import {
  parseStoreIntent,
  generateStoreResponse,
} from "../src/actions/store-memory.js";
import {
  parseRecallIntent,
  generateRecallResponse,
} from "../src/actions/recall-memory.js";

describe("parseStoreIntent", () => {
  it("returns null for unrelated input", () => {
    expect(parseStoreIntent("hello there")).toBeNull();
    expect(parseStoreIntent("what's the weather?")).toBeNull();
  });

  it("captures content from 'remember that ...' phrasing", () => {
    const intent = parseStoreIntent("remember that I prefer dark mode");
    expect(intent).not.toBeNull();
    expect(intent!.content).toBe("I prefer dark mode");
  });

  it("matches 'save', 'store', 'note', 'keep in mind' variants", () => {
    expect(parseStoreIntent("save this idea for later")?.content).toBe(
      "this idea for later"
    );
    expect(parseStoreIntent("store the meeting notes")?.content).toBe(
      "the meeting notes"
    );
    expect(parseStoreIntent("note that the API is flaky")?.content).toBe(
      "the API is flaky"
    );
    expect(
      parseStoreIntent("keep in mind that the deadline is Friday")?.content
    ).toBe("the deadline is Friday");
  });

  it("infers Preference memory type from keywords", () => {
    expect(parseStoreIntent("remember I love pizza")?.type).toBe(
      MemoryType.Preference
    );
    expect(parseStoreIntent("save my favorite color is blue")?.type).toBe(
      MemoryType.Preference
    );
  });

  it("infers Task memory type from keywords", () => {
    expect(parseStoreIntent("remember to remind me about the meeting")?.type).toBe(
      MemoryType.Task
    );
    expect(parseStoreIntent("save deadline for Friday")?.type).toBe(
      MemoryType.Task
    );
  });

  it("infers Behavior memory type from habitual keywords", () => {
    expect(parseStoreIntent("remember I always code in the morning")?.type).toBe(
      MemoryType.Behavior
    );
    expect(parseStoreIntent("note I never skip breakfast")?.type).toBe(
      MemoryType.Behavior
    );
  });

  it("falls back to Conversation type for plain content", () => {
    expect(parseStoreIntent("remember that the sky is blue")?.type).toBe(
      MemoryType.Conversation
    );
  });

  it("extracts hashtag tags from content", () => {
    const intent = parseStoreIntent("remember #project is shipping soon");
    expect(intent?.tags).toContain("project");
  });

  it("extracts category keyword tags", () => {
    const intent = parseStoreIntent("remember my work meeting tomorrow");
    expect(intent?.tags).toContain("work");
  });

  it("deduplicates tags", () => {
    const intent = parseStoreIntent(
      "remember my #work task #work again with work"
    );
    const workCount = (intent?.tags ?? []).filter((t) => t === "work").length;
    expect(workCount).toBe(1);
  });
});

describe("generateStoreResponse", () => {
  it("returns success message with tags when present", () => {
    const msg = generateStoreResponse(
      { success: true, message: "ok", memoryId: "Qm123" },
      { content: "x", tags: ["work", "travel"] }
    );
    expect(msg).toContain("securely stored");
    expect(msg).toContain("work, travel");
  });

  it("returns failure message on error", () => {
    const msg = generateStoreResponse(
      { success: false, message: "network down" },
      { content: "x" }
    );
    expect(msg).toContain("wasn't able");
    expect(msg).toContain("network down");
  });
});

describe("parseRecallIntent", () => {
  it("returns null for unrelated input", () => {
    expect(parseRecallIntent("hello there")).toBeNull();
    expect(parseRecallIntent("how's the weather?")).toBeNull();
  });

  it("matches listAll phrases", () => {
    expect(parseRecallIntent("what do you remember?")).toEqual({
      listAll: true,
    });
    expect(parseRecallIntent("list all memories please")).toEqual({
      listAll: true,
    });
    expect(parseRecallIntent("what do you know about me")).toEqual({
      listAll: true,
    });
  });

  it("captures recall pattern", () => {
    const intent = parseRecallIntent("recall my favorite color");
    expect(intent).not.toBeNull();
    expect(intent!.searchQuery).toBe("my favorite color");
  });

  it("captures 'what do you know about ...' pattern", () => {
    const intent = parseRecallIntent("what do you know about dark mode");
    expect(intent?.searchQuery).toBe("dark mode");
  });

  it("extracts hashtag search tags", () => {
    const intent = parseRecallIntent("find memories about #work");
    expect(intent?.searchTags).toContain("work");
  });

  it("treats 46-char strings as memoryId", () => {
    const cid = "Qm" + "a".repeat(44);
    const intent = parseRecallIntent(`recall ${cid}`);
    expect(intent?.memoryId).toBe(cid);
  });
});

describe("generateRecallResponse", () => {
  it("reports empty vault when listing and no entries", () => {
    const msg = generateRecallResponse(
      { success: true, message: "ok" },
      { listAll: true }
    );
    expect(msg).toContain("empty");
  });

  it("lists entries with indices and type labels", () => {
    const msg = generateRecallResponse(
      {
        success: true,
        message: "ok",
        entries: [
          {
            cid: "QmAbCdEf1234567890000000000000000000000000000",
            memoryType: MemoryType.Preference,
            timestamp: 0,
            metadataHash: new Uint8Array(32),
          } as any,
        ],
      },
      {}
    );
    expect(msg).toMatch(/1\.\s*\[/);
    expect(msg).toContain("1 memories");
  });

  it("formats a single retrieved memory with tags", () => {
    const msg = generateRecallResponse(
      {
        success: true,
        message: "ok",
        memories: [
          {
            data: { note: "hello" },
            metadata: {
              tags: ["work"],
              source: "conversation",
              label: undefined,
              timestamp: 0,
            },
          } as any,
        ],
      },
      {}
    );
    expect(msg).toContain("hello");
    expect(msg).toContain("work");
  });

  it("returns failure message on error", () => {
    const msg = generateRecallResponse(
      { success: false, message: "not found" },
      {}
    );
    expect(msg).toContain("couldn't retrieve");
    expect(msg).toContain("not found");
  });
});
