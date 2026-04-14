import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { loadAgent, printSolscan, shortKey } from "../utils.js";

export const didCommand = new Command("did")
  .description("Manage agent decentralized identity (DID)");

didCommand
  .command("show")
  .description("Show this agent's DID and document")
  .action(async () => {
    const spinner = ora("Loading DID…").start();
    try {
      const { agent } = await loadAgent();
      const did = agent.getSelfDID();
      const doc = agent.getSelfDIDDocument();
      spinner.succeed(chalk.green("DID loaded"));
      console.log(chalk.gray("\n  DID:        ") + chalk.cyan(did));
      if (doc) {
        console.log(chalk.gray("  Agent type: ") + chalk.white(doc.kage.agentType));
        console.log(chalk.gray("  Network:    ") + chalk.white(doc.kage.network));
        console.log(chalk.gray("  Reasoning:  ") + (doc.kage.reasoningEnabled ? chalk.green("enabled") : chalk.gray("disabled")));
        console.log(chalk.gray("  Capabilities:"));
        doc.kage.capabilities.forEach(c => console.log(chalk.gray("    · ") + chalk.white(c)));
        console.log(chalk.gray("  X25519 key: ") + chalk.magenta(shortKey(doc.kage.x25519ViewingPub)));
        console.log(chalk.gray("  VM count:   ") + chalk.white(doc.verificationMethod.length));
      }
      console.log();
    } catch (err) {
      spinner.fail(chalk.red(`Failed: ${(err as Error).message}`));
      process.exit(1);
    }
  });

didCommand
  .command("issue <subjectDID> <type> <claimJson>")
  .description("Issue a verifiable credential to another agent")
  .action(async (subjectDID: string, type: string, claimJson: string) => {
    const spinner = ora("Issuing credential…").start();
    try {
      let claim: Record<string, unknown>;
      try { claim = JSON.parse(claimJson); } catch { spinner.fail(chalk.red("Invalid claim JSON")); process.exit(1); }
      const { agent } = await loadAgent();
      const cred = await agent.issueCredential({ subjectDID, type, claim });
      spinner.succeed(chalk.green("Credential issued"));
      console.log(chalk.gray("\n  ID:      ") + chalk.cyan(cred.credentialId));
      console.log(chalk.gray("  Type:    ") + chalk.white(cred.type));
      console.log(chalk.gray("  Subject: ") + chalk.white(shortKey(cred.subject)));
      console.log(chalk.gray("  Hash:    ") + chalk.white(cred.claimHash.slice(0, 24) + "…"));
      printSolscan(cred.txSignature);
      console.log();
    } catch (err) {
      spinner.fail(chalk.red(`Failed: ${(err as Error).message}`));
      process.exit(1);
    }
  });

didCommand
  .command("verify <credentialJson>")
  .description("Verify a credential's signature and integrity")
  .action(async (credentialJson: string) => {
    const spinner = ora("Verifying…").start();
    try {
      let credential: Record<string, unknown>;
      try { credential = JSON.parse(credentialJson); } catch { spinner.fail(chalk.red("Invalid credential JSON")); process.exit(1); }
      const { agent } = await loadAgent();
      const result = agent.verifyCredential(credential as never);
      if (result.valid) {
        spinner.succeed(chalk.green("✓ Credential valid"));
      } else {
        spinner.fail(chalk.red(`✗ Invalid: ${result.reason}`));
      }
      console.log();
    } catch (err) {
      spinner.fail(chalk.red(`Failed: ${(err as Error).message}`));
      process.exit(1);
    }
  });

didCommand
  .command("credentials")
  .description("List all credentials issued by or to this agent")
  .action(async () => {
    const spinner = ora("Loading credentials…").start();
    try {
      const { agent } = await loadAgent();
      const creds = agent.getDIDCredentials();
      spinner.succeed(chalk.green(`${creds.length} credentials`));
      if (creds.length === 0) {
        console.log(chalk.gray("\n  No credentials yet.\n"));
        return;
      }
      creds.forEach((c, i) => {
        console.log(chalk.gray(`\n  [${i + 1}] `) + chalk.white(c.type) + chalk.gray(` · ${new Date(c.issuedAt * 1000).toLocaleString()}`));
        console.log(chalk.gray("       ID:      ") + chalk.cyan(c.credentialId));
        console.log(chalk.gray("       Subject: ") + chalk.white(shortKey(c.subject)));
        if (c.explorerUrl) console.log(chalk.gray("       Solscan: ") + chalk.cyan(c.explorerUrl));
      });
      console.log();
    } catch (err) {
      spinner.fail(chalk.red(`Failed: ${(err as Error).message}`));
      process.exit(1);
    }
  });
