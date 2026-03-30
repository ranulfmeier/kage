import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { createHash, randomBytes } from "crypto";
// @ts-ignore
import { x25519 } from "@noble/curves/ed25519.js";

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ShieldedPayment {
  /** Unique payment ID */
  paymentId: string;
  /** Stealth address that received the funds */
  stealthAddress: string;
  /** Sender's ephemeral X25519 pubkey (base64) — broadcast so recipient can scan */
  ephemeralPub: string;
  /** Amount in lamports */
  amountLamports: number;
  /** Optional encrypted memo (visible only to recipient) */
  encryptedMemo?: string;
  /** Solana tx signature */
  txSignature?: string;
  explorerUrl?: string;
  /** Direction from this engine's perspective */
  direction: "sent" | "received";
  createdAt: number;
}

export interface ScanResult {
  paymentId: string;
  stealthAddress: string;
  ephemeralPub: string;
  amountLamports: number;
  claimKeypair: Keypair;
  txSignature: string;
  explorerUrl: string;
}

// ─── ShieldedPaymentEngine ────────────────────────────────────────────────────

/**
 * Umbra-inspired stealth payment engine for Solana.
 *
 * Protocol:
 *  1. Sender derives a one-time stealth address from recipient's X25519 viewing pubkey
 *     and a fresh ephemeral keypair. The stealth keypair seed = SHA-256(ECDH output).
 *  2. SOL is transferred to stealthAddress via SystemProgram.transfer.
 *  3. Sender broadcasts ephemeralPub in a Memo instruction so recipient can scan.
 *  4. Recipient scans: for every ephemeralPub seen, they recompute the shared secret
 *     and derive the same stealth address. If getBalance > 0, they own those funds.
 *  5. Recipient creates a claim transaction signed with the stealth keypair.
 *
 * Privacy: on-chain only a random address receives SOL — no link to recipient's identity.
 */
export class ShieldedPaymentEngine {
  private connection: Connection;
  private agentKeypair: Keypair;

  /** This agent's static X25519 viewing public key (share with senders) */
  readonly viewingPublicKey: string;

  private sentPayments: ShieldedPayment[] = [];
  private receivedPayments: ShieldedPayment[] = [];

  constructor(connection: Connection, agentKeypair: Keypair) {
    this.connection = connection;
    this.agentKeypair = agentKeypair;

    const seed = agentKeypair.secretKey.slice(0, 32);
    const pub: Uint8Array = x25519.getPublicKey(seed);
    this.viewingPublicKey = Buffer.from(pub).toString("base64");
  }

  // ─── Sender Side ──────────────────────────────────────────────────────────

  /**
   * Derive a one-time stealth address for the recipient.
   *
   * @returns stealthKeypair (spend it to claim), ephemeralPub (broadcast to recipient)
   */
  deriveStealthAddress(recipientViewingPubBase64: string): {
    stealthKeypair: Keypair;
    ephemeralPub: string;
    stealthAddress: PublicKey;
  } {
    const recipientPub = Buffer.from(recipientViewingPubBase64, "base64");
    const ephemeralPriv = randomBytes(32);
    const ephemeralPub = Buffer.from(x25519.getPublicKey(ephemeralPriv));

    // Shared secret: ECDH(ephemeral_priv, recipient_view_pub)
    const dhOutput: Uint8Array = x25519.getSharedSecret(ephemeralPriv, recipientPub);
    const stealthSeed = createHash("sha256").update(dhOutput).digest();

    // Derive Ed25519 Solana keypair from the stealth seed
    const stealthKeypair = Keypair.fromSeed(stealthSeed);

    return {
      stealthKeypair,
      ephemeralPub: ephemeralPub.toString("base64"),
      stealthAddress: stealthKeypair.publicKey,
    };
  }

  /**
   * Send shielded SOL to a recipient.
   *
   * - Generates a one-time stealth address
   * - Transfers SOL via SystemProgram
   * - Broadcasts ephemeralPub in Memo so recipient can scan
   */
  async shieldedTransfer(
    recipientSolanaPubkey: string,
    recipientViewingPub: string,
    amountLamports: number,
    memo = ""
  ): Promise<ShieldedPayment> {
    const { stealthKeypair, ephemeralPub, stealthAddress } =
      this.deriveStealthAddress(recipientViewingPub);

    const paymentId = `pay-${Date.now()}-${randomBytes(4).toString("hex")}`;

    // Memo: "kage:stealth:<ephemeralPub>" — recipient scans for this prefix
    const memoData = `kage:stealth:${ephemeralPub}${memo ? `:${memo}` : ""}`;

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: this.agentKeypair.publicKey,
        toPubkey: stealthAddress,
        lamports: amountLamports,
      }),
      new TransactionInstruction({
        keys: [{ pubkey: this.agentKeypair.publicKey, isSigner: true, isWritable: false }],
        programId: MEMO_PROGRAM_ID,
        data: Buffer.from(memoData, "utf8"),
      })
    );

    let txSignature: string | undefined;
    let explorerUrl: string | undefined;

    try {
      tx.feePayer = this.agentKeypair.publicKey;
      tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
      tx.sign(this.agentKeypair);
      txSignature = await this.connection.sendRawTransaction(tx.serialize());
      await this.connection.confirmTransaction(txSignature, "confirmed");
      explorerUrl = `https://solscan.io/tx/${txSignature}?cluster=devnet`;
      console.log(`[Kage:Payment] Shielded transfer sent: ${txSignature}`);
      console.log(`[Kage:Payment] Stealth address: ${stealthAddress.toBase58()}`);
    } catch (err) {
      throw new Error(`[Kage:Payment] Shielded transfer failed: ${(err as Error).message}`);
    }

    const payment: ShieldedPayment = {
      paymentId,
      stealthAddress: stealthAddress.toBase58(),
      ephemeralPub,
      amountLamports,
      txSignature,
      explorerUrl,
      direction: "sent",
      createdAt: Date.now(),
    };

    this.sentPayments.push(payment);
    return payment;
  }

  // ─── Recipient Side ───────────────────────────────────────────────────────

  /**
   * Derive the claim keypair for a stealth address, given the ephemeralPub
   * that the sender broadcast. Only the holder of the viewing private key can do this.
   */
  deriveClaimKeypair(ephemeralPubBase64: string): Keypair {
    const ephemeralPub = Buffer.from(ephemeralPubBase64, "base64");
    const viewingPriv = this.agentKeypair.secretKey.slice(0, 32);

    const dhOutput: Uint8Array = x25519.getSharedSecret(viewingPriv, ephemeralPub);
    const stealthSeed = createHash("sha256").update(dhOutput).digest();
    return Keypair.fromSeed(stealthSeed);
  }

  /**
   * Scan recent transactions on devnet for incoming stealth payments.
   * Looks for Memo instructions with "kage:stealth:<ephemeralPub>" prefix.
   */
  async scanForPayments(limit = 50): Promise<ScanResult[]> {
    const results: ScanResult[] = [];

    try {
      // Scan the sender's address for recent outbound txs with our memo pattern
      // In production: use a dedicated indexer or scan all kage:stealth memos
      const sigs = await this.connection.getSignaturesForAddress(
        this.agentKeypair.publicKey,
        { limit }
      );

      for (const sigInfo of sigs) {
        try {
          const tx = await this.connection.getParsedTransaction(sigInfo.signature, {
            commitment: "confirmed",
            maxSupportedTransactionVersion: 0,
          });
          if (!tx?.meta) continue;

          // Look for memo instructions with kage:stealth prefix
          const logs = tx.meta.logMessages ?? [];
          const memoLog = logs.find((l) => l.includes("kage:stealth:"));
          if (!memoLog) continue;

          const match = memoLog.match(/kage:stealth:([A-Za-z0-9+/=]+)/);
          if (!match) continue;
          const ephemeralPub = match[1];

          // Derive the claim keypair
          const claimKeypair = this.deriveClaimKeypair(ephemeralPub);
          const stealthAddress = claimKeypair.publicKey;

          // Check balance at stealth address
          const balance = await this.connection.getBalance(stealthAddress);
          if (balance === 0) continue;

          const explorerUrl = `https://solscan.io/tx/${sigInfo.signature}?cluster=devnet`;
          const result: ScanResult = {
            paymentId: `scan-${sigInfo.signature.slice(0, 8)}`,
            stealthAddress: stealthAddress.toBase58(),
            ephemeralPub,
            amountLamports: balance,
            claimKeypair,
            txSignature: sigInfo.signature,
            explorerUrl,
          };
          results.push(result);

          // Record as received
          if (!this.receivedPayments.find((p) => p.txSignature === sigInfo.signature)) {
            this.receivedPayments.push({
              paymentId: result.paymentId,
              stealthAddress: result.stealthAddress,
              ephemeralPub,
              amountLamports: balance,
              txSignature: sigInfo.signature,
              explorerUrl,
              direction: "received",
              createdAt: (sigInfo.blockTime ?? Date.now() / 1000) * 1000,
            });
          }
        } catch {
          // Skip unparseable transactions
        }
      }
    } catch (err) {
      console.warn(`[Kage:Payment] Scan error: ${(err as Error).message.slice(0, 60)}`);
    }

    return results;
  }

  /**
   * Claim funds from a stealth address by sweeping to the agent's main wallet.
   */
  async claimPayment(ephemeralPubBase64: string): Promise<string> {
    const claimKeypair = this.deriveClaimKeypair(ephemeralPubBase64);
    const stealthAddress = claimKeypair.publicKey;

    const balance = await this.connection.getBalance(stealthAddress);
    if (balance === 0) throw new Error("No funds at stealth address");

    // Reserve rent + fee
    const fee = 5000;
    const transferAmount = balance - fee;
    if (transferAmount <= 0) throw new Error("Balance too low to cover fees");

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: stealthAddress,
        toPubkey: this.agentKeypair.publicKey,
        lamports: transferAmount,
      })
    );

    tx.feePayer = stealthAddress;
    tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    tx.sign(claimKeypair);

    const sig = await this.connection.sendRawTransaction(tx.serialize());
    await this.connection.confirmTransaction(sig, "confirmed");

    console.log(`[Kage:Payment] Claimed ${transferAmount} lamports from stealth addr: ${sig}`);
    return sig;
  }

  // ─── Accessors ────────────────────────────────────────────────────────────

  getSentPayments(): ShieldedPayment[] { return this.sentPayments; }
  getReceivedPayments(): ShieldedPayment[] { return this.receivedPayments; }

  getAllPayments(): ShieldedPayment[] {
    return [...this.sentPayments, ...this.receivedPayments].sort(
      (a, b) => b.createdAt - a.createdAt
    );
  }
}

export function createShieldedPaymentEngine(
  connection: Connection,
  agentKeypair: Keypair
): ShieldedPaymentEngine {
  return new ShieldedPaymentEngine(connection, agentKeypair);
}
