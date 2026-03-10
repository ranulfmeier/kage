import { Keypair, Connection, PublicKey } from "@solana/web3.js";
import Anthropic from "@anthropic-ai/sdk";
import {
  KageMemoryPlugin,
  createKageMemoryPlugin,
  KageMemoryPluginConfig,
} from "./plugins/kage-memory.js";
import {
  KagePrivacyPlugin,
  createKagePrivacyPlugin,
} from "./plugins/kage-privacy.js";
import {
  KageDelegationPlugin,
  createKageDelegationPlugin,
  DelegateTaskParams,
} from "./plugins/kage-delegation.js";
import { DelegationTask, DelegationEngine } from "@kage/sdk";
import {
  KageCharacter,
  AgentCharacter,
  generateSystemPrompt,
} from "./character.js";
import {
  parseStoreIntent,
  executeStoreMemory,
  generateStoreResponse,
} from "./actions/store-memory.js";
import {
  parseRecallIntent,
  executeRecallMemory,
  generateRecallResponse,
} from "./actions/recall-memory.js";

/**
 * Kage Agent Configuration
 */
export interface KageAgentConfig {
  rpcUrl: string;
  programId: string;
  ipfsGateway: string;
  umbraNetwork: "devnet" | "mainnet";
  anthropicApiKey: string;
  model?: string;
}

/**
 * Message in conversation
 */
export interface Message {
  role: "user" | "assistant";
  content: string;
}

/**
 * Proof data returned after a memory store or delegation operation
 */
export interface StoreProof {
  cid?: string;
  txSignature?: string;
  explorerUrl?: string;
  umbraProof?: string;
  /** Delegation-specific fields */
  taskId?: string;
  delegatedTo?: string;
}

/**
 * Chat response with optional proof
 */
export interface ChatResponse {
  text: string;
  proof?: StoreProof;
}

/**
 * Kage Agent
 * Privacy-first AI agent with encrypted memory capabilities
 */
export class KageAgent {
  private config: KageAgentConfig;
  private keypair: Keypair;
  private character: AgentCharacter;
  private memoryPlugin: KageMemoryPlugin;
  private privacyPlugin: KagePrivacyPlugin;
  private delegationPlugin: KageDelegationPlugin;
  private anthropic: Anthropic;
  private conversationHistory: Message[] = [];
  private initialized = false;

  constructor(
    config: KageAgentConfig,
    keypair: Keypair,
    character?: AgentCharacter
  ) {
    this.config = config;
    this.keypair = keypair;
    this.character = character || KageCharacter;

    const pluginConfig: KageMemoryPluginConfig = {
      rpcUrl: config.rpcUrl,
      programId: config.programId,
      ipfsGateway: config.ipfsGateway,
      umbraNetwork: config.umbraNetwork,
    };

    this.memoryPlugin = createKageMemoryPlugin(pluginConfig);
    this.privacyPlugin = createKagePrivacyPlugin(pluginConfig);
    this.delegationPlugin = createKageDelegationPlugin({
      rpcUrl: config.rpcUrl,
      programId: config.programId,
    });
    this.anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
  }

  /**
   * Initialize the agent and all plugins
   */
  async initialize(): Promise<void> {
    console.log(`[Kage] Initializing agent: ${this.keypair.publicKey.toBase58()}`);

    await this.memoryPlugin.initialize(this.keypair);
    await this.privacyPlugin.initialize(this.keypair);
    await this.delegationPlugin.initialize(this.keypair);

    this.initialized = true;
    console.log("[Kage] Agent initialized successfully");
  }

  /**
   * Process a user message and generate a response
   */
  async chat(userMessage: string): Promise<ChatResponse> {
    if (!this.initialized) {
      throw new Error("Agent not initialized. Call initialize() first.");
    }

    this.conversationHistory.push({ role: "user", content: userMessage });

    const actionResult = await this.processActions(userMessage);
    if (actionResult) {
      this.conversationHistory.push({ role: "assistant", content: actionResult.text });
      return actionResult;
    }

    const text = await this.generateResponse(userMessage);
    this.conversationHistory.push({ role: "assistant", content: text });

    return { text };
  }

  /**
   * Process potential actions from user input
   */
  private async processActions(input: string): Promise<{ text: string; proof?: StoreProof } | null> {
    const storeIntent = parseStoreIntent(input);
    if (storeIntent) {
      const result = await executeStoreMemory(this.memoryPlugin, storeIntent);
      const text = generateStoreResponse(result, storeIntent);
      const proof: StoreProof | undefined = result.success ? {
        txSignature: result.txSignature,
        explorerUrl: result.explorerUrl,
        umbraProof: result.umbraProof,
        cid: result.memoryId,
      } : undefined;
      return { text, proof };
    }

    const recallIntent = parseRecallIntent(input);
    if (recallIntent) {
      const result = await executeRecallMemory(this.memoryPlugin, recallIntent);
      return { text: generateRecallResponse(result, recallIntent) };
    }

    // Delegation intent: "delegate <instruction> to <pubkey>"
    const delegateMatch = input.match(/delegate\s+(.+?)\s+to\s+([1-9A-HJ-NP-Za-km-z]{32,44})/i);
    if (delegateMatch) {
      const instruction = delegateMatch[1].trim();
      const recipientPubkey = delegateMatch[2].trim();
      const result = await this.delegationPlugin.delegateTask({ recipientPubkey, instruction });
      if (result.success && result.task) {
        const task = result.task;
        const text = `✓ Task delegated to ${task.to.slice(0, 8)}… with shielded encryption.\nTask ID: ${task.taskId}\nStatus: ${task.status}${task.explorerUrl ? `\nCommitted on-chain: ${task.explorerUrl}` : ""}`;
        const proof: StoreProof = {
          taskId: task.taskId,
          delegatedTo: task.to,
          txSignature: task.txSignature,
          explorerUrl: task.explorerUrl,
        };
        return { text, proof };
      }
      return { text: `Task delegation failed: ${result.error}` };
    }

    return null;
  }

  /**
   * Generate AI response using Claude
   */
  private async generateResponse(userMessage: string): Promise<string> {
    const systemPrompt = generateSystemPrompt(this.character);

    const messages = this.conversationHistory.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    try {
      const response = await this.anthropic.messages.create({
        model: this.config.model || "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      });

      const textContent = response.content.find((c) => c.type === "text");
      return textContent ? textContent.text : "I apologize, I couldn't generate a response.";
    } catch (error) {
      console.error("[Kage] Claude API error:", error);
      return "I encountered an error while processing your request. Please try again.";
    }
  }

  /**
   * Get conversation history
   */
  getHistory(): Message[] {
    return [...this.conversationHistory];
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.conversationHistory = [];
  }

  /**
   * Get agent's public key
   */
  getPublicKey(): string {
    return this.keypair.publicKey.toBase58();
  }

  /**
   * List all stored memories
   */
  async listMemories() {
    const result = await this.memoryPlugin.listMemories({});
    return result.memories ?? [];
  }

  /**
   * Get memory plugin for direct access
   */
  getMemoryPlugin(): KageMemoryPlugin {
    return this.memoryPlugin;
  }

  /**
   * Get privacy plugin for direct access
   */
  getPrivacyPlugin(): KagePrivacyPlugin {
    return this.privacyPlugin;
  }

  /**
   * Get delegation plugin for direct access
   */
  getDelegationPlugin(): KageDelegationPlugin {
    return this.delegationPlugin;
  }

  /**
   * Delegate a task to another agent (programmatic access)
   */
  async delegateTask(params: DelegateTaskParams) {
    return this.delegationPlugin.delegateTask(params);
  }

  /**
   * List all delegation tasks
   */
  listTasks(): DelegationTask[] {
    return this.delegationPlugin.listTasks();
  }
}

/**
 * Create a new Kage agent
 */
export function createKageAgent(
  config: KageAgentConfig,
  keypair: Keypair,
  character?: AgentCharacter
): KageAgent {
  return new KageAgent(config, keypair, character);
}

/**
 * Create agent from environment variables
 */
export function createKageAgentFromEnv(): KageAgent {
  const config: KageAgentConfig = {
    rpcUrl: process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
    programId:
      process.env.KAGE_PROGRAM_ID || "KAGExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    ipfsGateway: process.env.IPFS_GATEWAY || "https://ipfs.io",
    umbraNetwork: (process.env.UMBRA_NETWORK as "devnet" | "mainnet") || "devnet",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
    model: process.env.ANTHROPIC_MODEL,
  };

  if (!config.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required");
  }

  let keypair: Keypair;
  if (process.env.SOLANA_PRIVATE_KEY) {
    const secretKey = Buffer.from(process.env.SOLANA_PRIVATE_KEY, "base64");
    keypair = Keypair.fromSecretKey(secretKey);
  } else {
    console.warn("[Kage] No SOLANA_PRIVATE_KEY found, generating new keypair");
    keypair = Keypair.generate();
  }

  return createKageAgent(config, keypair);
}
