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
import {
  KageMessagingPlugin,
  createKageMessagingPlugin,
} from "./plugins/kage-messaging.js";
import {
  KageGroupVaultPlugin,
  createKageGroupVaultPlugin,
} from "./plugins/kage-group-vault.js";
import {
  KagePaymentPlugin,
} from "./plugins/kage-payment.js";
import {
  KageReasoningPlugin,
  createKageReasoningPlugin,
} from "./plugins/kage-reasoning.js";
import {
  KageDIDPlugin,
  createKageDIDPlugin,
} from "./plugins/kage-did.js";
import {
  KageReputationPlugin,
  createKageReputationPlugin,
} from "./plugins/kage-reputation.js";
import { DelegationTask, DelegationEngine, AgentMessage, MessageContent, GroupMember, GroupVaultGroup, GroupVaultStore, ShieldedPayment, ScanResult, ReasoningTrace, KageDIDDocument, KageCredential, DIDResolution, AgentReputation, ReputationEvent, ReputationSnapshot, TaskOutcome } from "@kage/sdk";
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
  /** Storage backend for memories: "memory" (default) | "arweave" (permanent) */
  storageBackend?: "memory" | "arweave";
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
 * Hidden reasoning proof attached to chat responses
 */
export interface ReasoningProof {
  traceId: string;
  charCount: number;
  contentHash: string;
  txSignature?: string;
  explorerUrl?: string;
}

/**
 * Chat response with optional proof
 */
export interface ChatResponse {
  text: string;
  proof?: StoreProof;
  reasoning?: ReasoningProof;
  /** Chain-of-thought steps for UI animation (fast mode) */
  reasoningSteps?: string[];
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
  private messagingPlugin: KageMessagingPlugin;
  private groupVaultPlugin: KageGroupVaultPlugin;
  private paymentPlugin: KagePaymentPlugin;
  private reasoningPlugin: KageReasoningPlugin;
  private didPlugin: KageDIDPlugin;
  private reputationPlugin: KageReputationPlugin;
  private anthropic: Anthropic;
  private conversationHistory: Message[] = [];
  private initialized = false;
  /** Active session ID for reasoning traces */
  private reasoningSessionId: string | null = null;

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
      storageBackend: config.storageBackend ?? "memory",
    };

    this.memoryPlugin = createKageMemoryPlugin(pluginConfig);
    this.privacyPlugin = createKagePrivacyPlugin(pluginConfig);
    this.delegationPlugin = createKageDelegationPlugin({
      rpcUrl: config.rpcUrl,
      programId: config.programId,
    });
    this.messagingPlugin = createKageMessagingPlugin({ rpcUrl: config.rpcUrl });
    this.groupVaultPlugin = createKageGroupVaultPlugin({ rpcUrl: config.rpcUrl });
    this.paymentPlugin = new KagePaymentPlugin({ rpcUrl: config.rpcUrl });
    this.reasoningPlugin = createKageReasoningPlugin({ rpcUrl: config.rpcUrl });
    this.didPlugin = createKageDIDPlugin({
      rpcUrl: config.rpcUrl,
      network: config.umbraNetwork,
    });
    this.reputationPlugin = createKageReputationPlugin({
      rpcUrl: config.rpcUrl,
      network: config.umbraNetwork,
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
    await this.messagingPlugin.initialize(this.keypair);
    await this.groupVaultPlugin.initialize(this.keypair);
    await this.paymentPlugin.initialize(this.keypair);
    await this.reasoningPlugin.initialize(this.keypair);
    await this.didPlugin.initialize(this.keypair);
    await this.reputationPlugin.initialize(this.keypair);

    // Start a reasoning session for this agent instance
    this.reasoningSessionId = this.reasoningPlugin.startSession();

    this.initialized = true;
    console.log("[Kage] Agent initialized successfully");
  }

  /**
   * Process a user message and generate a response.
   * @param deepThink - If true, use Extended Thinking (slower but richer reasoning).
   *                    If false (default), use fast haiku chain-of-thought simulation.
   */
  async chat(userMessage: string, deepThink = false): Promise<ChatResponse> {
    if (!this.initialized) {
      throw new Error("Agent not initialized. Call initialize() first.");
    }

    this.conversationHistory.push({ role: "user", content: userMessage });

    const actionResult = await this.processActions(userMessage);
    if (actionResult) {
      this.conversationHistory.push({ role: "assistant", content: actionResult.text });
      return actionResult;
    }

    const { text, reasoning, reasoningSteps } = await this.generateResponse(userMessage, deepThink);
    this.conversationHistory.push({ role: "assistant", content: text });

    return { text, reasoning, reasoningSteps };
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

    // Messaging intent: "message <pubkey> <x25519pub>: <text>"  or  "send message to <pubkey>: <text>"
    const msgMatch = input.match(/(?:message|send(?:\s+message)?(?:\s+to)?)\s+([1-9A-HJ-NP-Za-km-z]{32,44})(?:\s+([A-Za-z0-9+/=]{40,}))?[:\s]+(.+)/i);
    if (msgMatch) {
      const recipientPubkey = msgMatch[1].trim();
      const recipientX25519Pub = msgMatch[2]?.trim() ?? "";
      const text = msgMatch[3].trim();
      if (recipientX25519Pub) {
        const result = await this.messagingPlugin.sendMessage({ recipientPubkey, recipientX25519Pub, text });
        if (result.success && result.message) {
          const proof: StoreProof = {
            txSignature: result.message.txSignature,
            explorerUrl: result.message.explorerUrl,
          };
          const responseText = `✓ Encrypted message sent to ${recipientPubkey.slice(0, 8)}…\nMessage ID: ${result.message.messageId}${result.message.explorerUrl ? `\nAnchored: ${result.message.explorerUrl}` : ""}`;
          return { text: responseText, proof };
        }
        return { text: `Message failed: ${result.error}` };
      }
      return { text: `Please provide recipient's X25519 public key to encrypt the message.` };
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
   * Generate AI response, dispatching to fast or deep-think mode.
   */
  private async generateResponse(
    userMessage: string,
    deepThink = false
  ): Promise<{ text: string; reasoning?: ReasoningProof; reasoningSteps?: string[] }> {
    const systemPrompt = generateSystemPrompt(this.character);
    const messages = this.conversationHistory.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    try {
      if (deepThink) {
        return await this.generateResponseDeepThink(systemPrompt, messages);
      }
      return await this.generateResponseFast(systemPrompt, messages, userMessage);
    } catch (err) {
      console.error("[Kage] generateResponse error:", err);
      return { text: "I encountered an error while processing your request. Please try again." };
    }
  }

  /**
   * Fast mode: haiku chain-of-thought → commit → haiku final response.
   * Total latency ~4-6 s (two cheap API calls + Solana memo).
   */
  private async generateResponseFast(
    systemPrompt: string,
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    userMessage: string
  ): Promise<{ text: string; reasoning?: ReasoningProof; reasoningSteps?: string[] }> {
    const FAST_MODEL = "claude-haiku-4-5-20251001";
    let reasoningSteps: string[] = [];
    let reasoningProof: ReasoningProof | undefined;

    // 1. Quick chain-of-thought call
    if (this.reasoningSessionId) {
      try {
        const thinkResp = await this.anthropic.messages.create({
          model: FAST_MODEL,
          max_tokens: 350,
          system:
            "You are a concise reasoning assistant. Given a task or question, outline your chain-of-thought in 3-5 numbered steps. Each step must be one short, specific sentence. Output only the numbered list.",
          messages: [{ role: "user", content: `Reason through: "${userMessage}"` }],
        });
        const thinkText = ((thinkResp.content.find((c) => c.type === "text")) as { type: "text"; text: string } | undefined)?.text ?? "";

        // Parse numbered lines
        reasoningSteps = thinkText
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => /^\d+[\.\)]\s/.test(l))
          .slice(0, 5);

        if (reasoningSteps.length === 0 && thinkText.length > 10) {
          reasoningSteps = thinkText
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l.length > 15)
            .slice(0, 4);
        }

        if (thinkText.length > 0) {
          const trace = await this.reasoningPlugin.commitTrace(thinkText, this.reasoningSessionId);
          reasoningProof = {
            traceId: trace.traceId,
            charCount: trace.charCount,
            contentHash: trace.contentHash,
            txSignature: trace.txSignature,
            explorerUrl: trace.explorerUrl,
          };
          console.log(`[Kage:Reasoning] Fast trace committed: ${trace.traceId} (${trace.charCount} chars)`);
        }
      } catch (err) {
        console.warn(`[Kage:Reasoning] Fast reasoning error: ${(err as Error).message}`);
      }
    }

    // 2. Final answer with full system prompt
    const finalResp = await this.anthropic.messages.create({
      model: FAST_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages,
    });

    const textContent = (finalResp.content.find((c) => c.type === "text")) as { type: "text"; text: string } | undefined;
    const text = textContent?.text ?? "I apologize, I couldn't generate a response.";
    return { text, reasoning: reasoningProof, reasoningSteps };
  }

  /**
   * Deep Think mode: claude-3-7-sonnet Extended Thinking.
   * Real internal reasoning, slower (~30-60 s).
   */
  private async generateResponseDeepThink(
    systemPrompt: string,
    messages: Array<{ role: "user" | "assistant"; content: string }>
  ): Promise<{ text: string; reasoning?: ReasoningProof; reasoningSteps?: string[] }> {
    const THINKING_MODEL = "claude-3-7-sonnet-20250219";

    const requestParams: Parameters<typeof this.anthropic.messages.create>[0] = {
      model: THINKING_MODEL,
      max_tokens: 16000,
      system: systemPrompt,
      messages,
    };
    // @ts-ignore — Extended Thinking API
    requestParams.thinking = { type: "enabled", budget_tokens: 8000 };

    const response = await this.anthropic.messages.create(requestParams) as Awaited<ReturnType<typeof this.anthropic.messages.create>>;

    let reasoningProof: ReasoningProof | undefined;
    let reasoningSteps: string[] = [];

    const thinkingBlock = (response as any).content?.find((c: any) => c.type === "thinking");
    if (thinkingBlock && this.reasoningSessionId) {
      try {
        const thinkingText: string = thinkingBlock.thinking ?? "";
        if (thinkingText.length > 0) {
          const trace = await this.reasoningPlugin.commitTrace(thinkingText, this.reasoningSessionId);
          reasoningProof = {
            traceId: trace.traceId,
            charCount: trace.charCount,
            contentHash: trace.contentHash,
            txSignature: trace.txSignature,
            explorerUrl: trace.explorerUrl,
          };
          reasoningSteps = thinkingText
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l.length > 20)
            .slice(0, 6);
          console.log(`[Kage:Reasoning] Deep trace committed: ${trace.traceId} (${trace.charCount} chars)`);
        }
      } catch (err) {
        console.warn(`[Kage:Reasoning] Deep commit failed: ${(err as Error).message}`);
      }
    }

    const textContent = (response as any).content?.find((c: any) => c.type === "text");
    const text = textContent ? textContent.text : "I apologize, I couldn't generate a response.";

    return { text, reasoning: reasoningProof, reasoningSteps };
  }

  /**
   * Get conversation history
   */
  getHistory(): Message[] {
    return [...this.conversationHistory];
  }

  /**
   * Clear conversation history and start a new reasoning session.
   */
  clearHistory(): void {
    this.conversationHistory = [];
    // Rotate reasoning session on new conversation
    if (this.reasoningSessionId) {
      this.reasoningPlugin.endSession();
    }
    this.reasoningSessionId = this.reasoningPlugin.startSession();
  }

  // ─── Reasoning ─────────────────────────────────────────────────────────────

  getAllReasoningTraces(): ReasoningTrace[] {
    return this.reasoningPlugin.getAllTraces();
  }

  revealReasoning(traceId: string) {
    return this.reasoningPlugin.reveal(traceId);
  }

  revealReasoningWithAuditKey(traceId: string, auditKey: string) {
    return this.reasoningPlugin.revealWithAuditKey(traceId, auditKey);
  }

  exportReasoningAuditKey(): string | null {
    try {
      return this.reasoningPlugin.exportAuditKey();
    } catch {
      return null;
    }
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

  /**
   * Get this agent's X25519 public key (share with counterparties for messaging)
   */
  getX25519PublicKey(): string {
    return this.messagingPlugin.getX25519PublicKey();
  }

  /**
   * Send an encrypted message to another agent
   */
  async sendMessage(params: {
    recipientPubkey: string;
    recipientX25519Pub: string;
    text: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.messagingPlugin.sendMessage(params);
  }

  /**
   * Receive and decrypt a message (called by transport layer)
   */
  receiveMessage(msg: AgentMessage): MessageContent | null {
    const result = this.messagingPlugin.receiveMessage(msg);
    return result.success ? (result.content ?? null) : null;
  }

  /**
   * Deliver a raw message to this agent's inbox
   */
  deliverToInbox(msg: AgentMessage): void {
    this.messagingPlugin.deliverToInbox(msg);
  }

  /**
   * Get all inbox messages
   */
  getInbox(): AgentMessage[] {
    return this.messagingPlugin.getInbox();
  }

  /**
   * Get unread inbox messages
   */
  getUnreadMessages(): AgentMessage[] {
    return this.messagingPlugin.getUnreadMessages();
  }

  // ─── Group Vault ────────────────────────────────────────────────────────────

  getGroupVaultX25519Key(): string {
    return this.groupVaultPlugin.getX25519PublicKey();
  }

  async createGroup(members: GroupMember[], threshold: number) {
    return this.groupVaultPlugin.createGroup(members, threshold);
  }

  loadGroup(group: GroupVaultGroup): void {
    this.groupVaultPlugin.loadGroup(group);
  }

  decryptOwnShare(group: GroupVaultGroup) {
    return this.groupVaultPlugin.decryptOwnShare(group);
  }

  reconstructKey(groupId: string, rawShares: Buffer[]) {
    return this.groupVaultPlugin.reconstructKey(groupId, rawShares);
  }

  storeGroupEntry(groupId: string, content: unknown) {
    return this.groupVaultPlugin.storeEntry(groupId, content);
  }

  readGroupEntries(groupId: string) {
    return this.groupVaultPlugin.readAllEntries(groupId);
  }

  listGroups(): GroupVaultStore[] {
    return this.groupVaultPlugin.listGroups();
  }

  hasGroupKey(groupId: string): boolean {
    return this.groupVaultPlugin.hasKey(groupId);
  }

  // ─── Shielded Payments ───────────────────────────────────────────────────────

  getPaymentViewingKey(): string {
    return this.paymentPlugin.getViewingPublicKey();
  }

  async shieldedTransfer(
    recipientSolanaPubkey: string,
    recipientViewingPub: string,
    amountLamports: number,
    memo?: string
  ): Promise<ShieldedPayment> {
    return this.paymentPlugin.shieldedTransfer(
      recipientSolanaPubkey,
      recipientViewingPub,
      amountLamports,
      memo
    );
  }

  deriveStealthAddress(recipientViewingPub: string): { stealthAddress: string; ephemeralPub: string } {
    return this.paymentPlugin.deriveStealthAddress(recipientViewingPub);
  }

  async scanForPayments(limit?: number): Promise<ScanResult[]> {
    return this.paymentPlugin.scanForPayments(limit);
  }

  async claimPayment(ephemeralPubBase64: string): Promise<string> {
    return this.paymentPlugin.claimPayment(ephemeralPubBase64);
  }

  getPaymentHistory(): ShieldedPayment[] {
    return this.paymentPlugin.getAllPayments();
  }

  // ── DID ────────────────────────────────────────────────────────────────────

  getSelfDID(): string {
    return this.didPlugin.getSelfDID();
  }

  getSelfDIDDocument(): KageDIDDocument | undefined {
    return this.didPlugin.getSelfDocument();
  }

  async resolveDID(did: string): Promise<DIDResolution | null> {
    return this.didPlugin.resolveDID(did);
  }

  registerPeerDID(document: KageDIDDocument): void {
    this.didPlugin.registerPeerDID(document);
  }

  async issueCredential(params: {
    subjectDID: string;
    type: string;
    claim: Record<string, unknown>;
    expiresInMs?: number;
  }): Promise<KageCredential> {
    return this.didPlugin.issueCredential(params);
  }

  verifyCredential(credential: KageCredential): { valid: boolean; reason?: string } {
    return this.didPlugin.verifyCredential(credential);
  }

  getDIDCredentials(): KageCredential[] {
    return this.didPlugin.getCredentials();
  }

  getAllKnownDIDs(): KageDIDDocument[] {
    return this.didPlugin.getAllKnownDIDs();
  }

  // ── Reputation ─────────────────────────────────────────────────────────────

  async recordTask(params: {
    agentDID?: string;
    outcome: TaskOutcome;
    description?: string;
  }): Promise<ReputationEvent> {
    return this.reputationPlugin.recordTask(params);
  }

  async slash(params: { agentDID?: string; reason: string }): Promise<ReputationEvent> {
    return this.reputationPlugin.slash(params);
  }

  async commitReputationSnapshot(): Promise<ReputationSnapshot> {
    return this.reputationPlugin.commitSnapshot();
  }

  getSelfReputation(): AgentReputation | undefined {
    return this.reputationPlugin.getSelfReputation();
  }

  getReputation(did: string): AgentReputation | undefined {
    return this.reputationPlugin.getReputation(did);
  }

  getSuccessRate(): number {
    return this.reputationPlugin.getSuccessRate();
  }

  getLeaderboard(): AgentReputation[] {
    return this.reputationPlugin.getLeaderboard();
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
