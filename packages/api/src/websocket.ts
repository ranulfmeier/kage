import { WebSocketServer, WebSocket } from "ws";
import type { KageAgent } from "@kage/agent";
import { getAgent, sharedKeypair } from "./bootstrap.js";

/**
 * Wire up the WebSocket connection handler. Called once from the API
 * bootstrap to register a `"connection"` listener on the server.
 *
 * Each connection gets a fresh conversation history (memories persist) and
 * per-socket Deep Think mode state. The same `KageAgent` instance is shared
 * across all sockets — `getAgent()` is a lazy singleton.
 */
export function registerWebSocketHandlers(wss: WebSocketServer): void {
  wss.on("connection", async (ws: WebSocket) => {
    console.log("[Kage:API] New WebSocket connection");

    let agent: KageAgent;
    try {
      agent = await getAgent();
    } catch (err) {
      ws.send(
        JSON.stringify({ type: "error", message: "Agent initialization failed" })
      );
      ws.close();
      return;
    }

    // Fresh conversation for each new connection, memories persist
    agent.clearHistory();

    // Per-connection Deep Think mode state
    let deepThinkEnabled = false;

    ws.send(
      JSON.stringify({
        type: "connected",
        agentId: sharedKeypair.publicKey.toBase58(),
        message: `Kage agent ready.`,
        deepThink: deepThinkEnabled,
      })
    );

    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        // Toggle Deep Think mode
        if (msg.type === "toggle_deep_think") {
          deepThinkEnabled =
            typeof msg.enabled === "boolean" ? msg.enabled : !deepThinkEnabled;
          ws.send(
            JSON.stringify({ type: "deep_think_status", enabled: deepThinkEnabled })
          );
          console.log(
            `[Kage:API] Deep Think mode: ${deepThinkEnabled ? "ON" : "OFF"}`
          );
          return;
        }

        if (msg.type === "chat") {
          const userText: string = msg.text?.trim() || "";
          if (!userText) return;

          if (userText === "/memories") {
            const memories = await agent.listMemories();
            console.log(
              `[Kage:API] listMemories returned ${memories.length} item(s)`
            );
            ws.send(
              JSON.stringify({
                type: "memories",
                memories: memories.map((m, i) => ({
                  index: i + 1,
                  id: m.cid.slice(0, 16) + "…",
                  type: m.memoryType,
                  time: new Date(m.createdAt).toLocaleTimeString(),
                })),
              })
            );
            return;
          }

          ws.send(JSON.stringify({ type: "typing", deepThink: deepThinkEnabled }));

          const response = await agent.chat(userText, deepThinkEnabled);

          console.log(
            `[Kage:API] chat response proof:`,
            JSON.stringify(response.proof)
          );

          // Stream reasoning steps with staggered delay for UI animation
          if (response.reasoningSteps && response.reasoningSteps.length > 0) {
            for (const step of response.reasoningSteps) {
              ws.send(JSON.stringify({ type: "reasoning_step", content: step }));
              await new Promise<void>((r) => setTimeout(r, 650));
            }
          }

          ws.send(
            JSON.stringify({
              type: "message",
              role: "assistant",
              text: response.text,
              proof: response.proof ?? null,
              reasoning: response.reasoning ?? null,
            })
          );
        }

        // Send encrypted message to another agent
        if (msg.type === "send_message") {
          const { recipientPubkey, recipientX25519Pub, text } = msg;
          if (!recipientPubkey || !recipientX25519Pub || !text) {
            ws.send(
              JSON.stringify({
                type: "error",
                message:
                  "recipientPubkey, recipientX25519Pub, and text are required",
              })
            );
            return;
          }
          ws.send(JSON.stringify({ type: "typing" }));
          const result = await agent.sendMessage({
            recipientPubkey,
            recipientX25519Pub,
            text,
          });
          if (result.success && result.message) {
            // If sending to self (or same agent), auto-deliver to inbox
            if (result.message.to === sharedKeypair.publicKey.toBase58()) {
              agent.deliverToInbox(result.message);
            }
            ws.send(
              JSON.stringify({
                type: "message_sent",
                message: {
                  messageId: result.message.messageId,
                  to: result.message.to,
                  sentAt: result.message.sentAt,
                  explorerUrl: result.message.explorerUrl ?? null,
                },
              })
            );
          } else {
            ws.send(
              JSON.stringify({
                type: "error",
                message: result.error ?? "Send failed",
              })
            );
          }
        }

        // Deliver a received message to this agent's inbox (simulates transport)
        if (msg.type === "deliver_message") {
          const { encryptedMessage } = msg;
          if (!encryptedMessage) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "encryptedMessage is required",
              })
            );
            return;
          }
          agent.deliverToInbox(encryptedMessage);
          const content = agent.receiveMessage(encryptedMessage);
          ws.send(
            JSON.stringify({
              type: "message_received",
              content,
              messageId: encryptedMessage.messageId,
            })
          );
        }

        // Create a group vault
        if (msg.type === "group_create") {
          const { members, threshold } = msg;
          if (!members || !threshold) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "members and threshold are required",
              })
            );
            return;
          }
          ws.send(JSON.stringify({ type: "typing" }));
          const result = await agent.createGroup(members, threshold);
          if (result.success && result.group) {
            ws.send(
              JSON.stringify({
                type: "group_created",
                group: result.group,
                explorerUrl: result.explorerUrl ?? null,
              })
            );
          } else {
            ws.send(
              JSON.stringify({
                type: "error",
                message: result.error ?? "Group creation failed",
              })
            );
          }
        }

        // Store an entry in a group vault
        if (msg.type === "group_store") {
          const { groupId, content } = msg;
          if (!groupId || content === undefined) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "groupId and content are required",
              })
            );
            return;
          }
          const result = agent.storeGroupEntry(groupId, content);
          if (result.success) {
            ws.send(
              JSON.stringify({
                type: "group_entry_stored",
                entryId: result.entryId,
                groupId,
              })
            );
          } else {
            ws.send(
              JSON.stringify({
                type: "error",
                message: result.error ?? "Store failed",
              })
            );
          }
        }

        // Read all entries from a group vault
        if (msg.type === "group_read") {
          const { groupId } = msg;
          if (!groupId) {
            ws.send(
              JSON.stringify({ type: "error", message: "groupId is required" })
            );
            return;
          }
          const result = agent.readGroupEntries(groupId);
          if (result.success) {
            ws.send(
              JSON.stringify({
                type: "group_entries",
                groupId,
                entries: result.entries,
              })
            );
          } else {
            ws.send(
              JSON.stringify({
                type: "error",
                message: result.error ?? "Read failed",
              })
            );
          }
        }

        // Shielded SOL payment via stealth address
        if (msg.type === "shielded_pay") {
          const { recipientPubkey, recipientViewingPub, amountLamports, memo } =
            msg;
          if (!recipientPubkey || !recipientViewingPub || !amountLamports) {
            ws.send(
              JSON.stringify({
                type: "error",
                message:
                  "recipientPubkey, recipientViewingPub, and amountLamports are required",
              })
            );
            return;
          }
          ws.send(JSON.stringify({ type: "typing" }));
          const payment = await agent.shieldedTransfer(
            recipientPubkey,
            recipientViewingPub,
            Number(amountLamports),
            memo
          );
          ws.send(
            JSON.stringify({
              type: "payment_sent",
              payment: {
                paymentId: payment.paymentId,
                stealthAddress: payment.stealthAddress,
                ephemeralPub: payment.ephemeralPub,
                amountLamports: payment.amountLamports,
                amountSol: (payment.amountLamports / 1e9).toFixed(6),
                txSignature: payment.txSignature ?? null,
                explorerUrl: payment.explorerUrl ?? null,
              },
            })
          );
        }

        // Scan for incoming stealth payments
        if (msg.type === "scan_payments") {
          ws.send(JSON.stringify({ type: "typing" }));
          const results = await agent.scanForPayments(msg.limit ?? 50);
          ws.send(
            JSON.stringify({
              type: "scan_results",
              count: results.length,
              results: results.map((r) => ({
                paymentId: r.paymentId,
                stealthAddress: r.stealthAddress,
                ephemeralPub: r.ephemeralPub,
                amountLamports: r.amountLamports,
                amountSol: (r.amountLamports / 1e9).toFixed(6),
                txSignature: r.txSignature,
                explorerUrl: r.explorerUrl,
              })),
            })
          );
        }

        // Reputation handlers
        if (msg.type === "rep_get") {
          const rep = agent.getSelfReputation();
          ws.send(
            JSON.stringify({
              type: "reputation",
              reputation: rep ?? null,
              successRate: agent.getSuccessRate(),
              leaderboard: agent.getLeaderboard(),
            })
          );
        }

        if (msg.type === "rep_record_task") {
          const { outcome, description, agentDID } = msg;
          if (!outcome) {
            ws.send(
              JSON.stringify({ type: "error", message: "outcome is required" })
            );
            return;
          }
          try {
            const event = await agent.recordTask({
              outcome,
              description,
              agentDID,
            });
            const rep = agent.getSelfReputation();
            ws.send(
              JSON.stringify({
                type: "reputation_updated",
                event,
                reputation: rep,
              })
            );
          } catch (err) {
            ws.send(
              JSON.stringify({ type: "error", message: (err as Error).message })
            );
          }
        }

        if (msg.type === "rep_slash") {
          const { reason, agentDID } = msg;
          if (!reason) {
            ws.send(
              JSON.stringify({ type: "error", message: "reason is required" })
            );
            return;
          }
          try {
            const event = await agent.slash({ reason, agentDID });
            const rep = agent.getSelfReputation();
            ws.send(
              JSON.stringify({
                type: "reputation_updated",
                event,
                reputation: rep,
              })
            );
          } catch (err) {
            ws.send(
              JSON.stringify({ type: "error", message: (err as Error).message })
            );
          }
        }

        if (msg.type === "rep_snapshot") {
          try {
            const snapshot = await agent.commitReputationSnapshot();
            ws.send(JSON.stringify({ type: "reputation_snapshot", snapshot }));
          } catch (err) {
            ws.send(
              JSON.stringify({ type: "error", message: (err as Error).message })
            );
          }
        }

        // Team Vault handlers
        if (msg.type === "team_list") {
          const teams = agent.listTeams();
          ws.send(JSON.stringify({ type: "team_list", teams }));
        }

        if (msg.type === "team_create") {
          try {
            const { name, description, members, threshold } = msg;
            if (!name) {
              ws.send(JSON.stringify({ type: "error", message: "name required" }));
              return;
            }
            const team = await agent.createTeam({
              name,
              description,
              members,
              threshold,
            });
            ws.send(JSON.stringify({ type: "team_created", team }));
          } catch (err) {
            ws.send(
              JSON.stringify({ type: "error", message: (err as Error).message })
            );
          }
        }

        if (msg.type === "team_invite") {
          try {
            const { teamId, publicKey, x25519PublicKey, role, displayName } = msg;
            const team = await agent.inviteTeamMember(teamId, {
              publicKey,
              x25519PublicKey,
              role: role ?? "member",
              displayName,
            });
            ws.send(JSON.stringify({ type: "team_updated", team }));
          } catch (err) {
            ws.send(
              JSON.stringify({ type: "error", message: (err as Error).message })
            );
          }
        }

        if (msg.type === "team_store_secret") {
          try {
            const { teamId, label, description, data } = msg;
            if (!teamId || !label || data === undefined) {
              ws.send(
                JSON.stringify({
                  type: "error",
                  message: "teamId, label, data required",
                })
              );
              return;
            }
            const secret = await agent.storeTeamSecret(teamId, {
              label,
              description,
              data,
            });
            ws.send(JSON.stringify({ type: "team_secret_stored", secret }));
          } catch (err) {
            ws.send(
              JSON.stringify({ type: "error", message: (err as Error).message })
            );
          }
        }

        if (msg.type === "team_retrieve_secret") {
          try {
            const { teamId, secretId } = msg;
            const result = agent.retrieveTeamSecret(teamId, secretId);
            ws.send(
              JSON.stringify({ type: "team_secret_retrieved", ...result })
            );
          } catch (err) {
            ws.send(
              JSON.stringify({ type: "error", message: (err as Error).message })
            );
          }
        }

        // DID handlers
        if (msg.type === "did_get") {
          const document = agent.getSelfDIDDocument();
          ws.send(
            JSON.stringify({
              type: "did_document",
              did: agent.getSelfDID(),
              document: document ?? null,
            })
          );
        }

        if (msg.type === "did_issue_credential") {
          const { subjectDID, credType, claim, expiresInSec } = msg;
          if (!subjectDID || !credType || !claim) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "subjectDID, credType, and claim are required",
              })
            );
            return;
          }
          try {
            const credential = await agent.issueCredential({
              subjectDID,
              type: credType,
              claim,
              expiresInSec,
            });
            ws.send(JSON.stringify({ type: "credential_issued", credential }));
          } catch (err) {
            ws.send(
              JSON.stringify({ type: "error", message: (err as Error).message })
            );
          }
        }

        if (msg.type === "did_verify_credential") {
          const { credential } = msg;
          if (!credential) {
            ws.send(
              JSON.stringify({ type: "error", message: "credential is required" })
            );
            return;
          }
          const result = agent.verifyCredential(credential);
          ws.send(
            JSON.stringify({
              type: "credential_verified",
              ...result,
              credentialId: credential.credentialId,
            })
          );
        }

        if (msg.type === "did_list_credentials") {
          const credentials = agent.getDIDCredentials();
          ws.send(
            JSON.stringify({
              type: "credentials_list",
              count: credentials.length,
              credentials,
            })
          );
        }

        // Programmatic task delegation
        if (msg.type === "delegate") {
          const { recipientPubkey, instruction, context } = msg;
          if (!recipientPubkey || !instruction) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "recipientPubkey and instruction are required",
              })
            );
            return;
          }

          ws.send(JSON.stringify({ type: "typing" }));

          const result = await agent.delegateTask({
            recipientPubkey,
            instruction,
            context,
          });

          if (result.success && result.task) {
            ws.send(
              JSON.stringify({
                type: "task_created",
                task: {
                  taskId: result.task.taskId,
                  from: result.task.from,
                  to: result.task.to,
                  status: result.task.status,
                  txSignature: result.task.txSignature ?? null,
                  explorerUrl: result.task.explorerUrl ?? null,
                  createdAt: result.task.createdAt,
                },
              })
            );
          } else {
            ws.send(
              JSON.stringify({
                type: "error",
                message: result.error ?? "Delegation failed",
              })
            );
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        ws.send(JSON.stringify({ type: "error", message }));
      }
    });

    ws.on("close", () => {
      console.log("[Kage:API] Connection closed");
    });
  });
}
