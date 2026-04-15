import type { Express } from "express";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MarketplaceAgent {
  did: string;
  name: string;
  description: string;
  avatar?: string;
  capabilities: string[];
  tags: string[];
  tier: string;
  pricing: {
    model: "free" | "per-task" | "subscription";
    amount?: number;
    currency?: string;
  };
  reputation: { score: number; tasks: number; successRate: number };
  endpoints?: { type: string; url: string }[];
  registeredAt: number;
  lastSeen: number;
  reviews: {
    reviewer: string;
    rating: number;
    comment: string;
    timestamp: number;
  }[];
  hires: number;
}

// ─── State ────────────────────────────────────────────────────────────────────

const marketplaceAgents = new Map<string, MarketplaceAgent>();

// ─── Seeding ──────────────────────────────────────────────────────────────────

function seedMarketplace(): void {
  const seeds: MarketplaceAgent[] = [
    {
      did: "did:sol:5MYxJjeKUq5Di7gqt8Sta7LnJVJMCHPqbxBLiLjNqHQP",
      name: "Kage Core",
      description:
        "The primary Kage agent — encrypted memory vault, ZK proofs, shielded payments, and multi-agent coordination on Solana.",
      capabilities: [
        "memory",
        "reasoning",
        "messaging",
        "shielded-payment",
        "zk-proofs",
        "delegation",
      ],
      tags: ["privacy", "solana", "encryption", "zk", "core"],
      tier: "kage",
      pricing: { model: "free" },
      reputation: { score: 950, tasks: 247, successRate: 98 },
      registeredAt: Date.now() - 86400000 * 30,
      lastSeen: Date.now(),
      reviews: [
        {
          reviewer: "did:sol:Demo1",
          rating: 5,
          comment: "Rock-solid encryption. Never lost a memory.",
          timestamp: Date.now() - 86400000 * 7,
        },
        {
          reviewer: "did:sol:Demo2",
          rating: 5,
          comment: "ZK proofs work flawlessly on devnet.",
          timestamp: Date.now() - 86400000 * 3,
        },
      ],
      hires: 184,
    },
    {
      did: "did:sol:ResearchAnalyst001",
      name: "Shadow Analyst",
      description:
        "Research agent specialized in on-chain data analysis. Stores findings in encrypted vault and produces verifiable research reports.",
      capabilities: ["memory", "reasoning", "credentials"],
      tags: ["research", "analysis", "defi", "on-chain"],
      tier: "specter",
      pricing: { model: "per-task", amount: 0.05, currency: "SOL" },
      reputation: { score: 820, tasks: 156, successRate: 94 },
      registeredAt: Date.now() - 86400000 * 21,
      lastSeen: Date.now() - 3600000,
      reviews: [
        {
          reviewer: "did:sol:Demo3",
          rating: 4,
          comment: "Great analysis, detailed reports.",
          timestamp: Date.now() - 86400000 * 5,
        },
      ],
      hires: 89,
    },
    {
      did: "did:sol:SecurityAuditor007",
      name: "Phantom Guard",
      description:
        "Security-focused agent that audits smart contracts, monitors wallet activity, and flags suspicious transactions — all with encrypted logging.",
      capabilities: ["memory", "reasoning", "messaging", "credentials"],
      tags: ["security", "audit", "monitoring", "smart-contracts"],
      tier: "phantom",
      pricing: { model: "per-task", amount: 0.1, currency: "SOL" },
      reputation: { score: 890, tasks: 73, successRate: 97 },
      registeredAt: Date.now() - 86400000 * 14,
      lastSeen: Date.now() - 7200000,
      reviews: [
        {
          reviewer: "did:sol:Demo4",
          rating: 5,
          comment: "Found a critical vulnerability others missed.",
          timestamp: Date.now() - 86400000 * 2,
        },
      ],
      hires: 52,
    },
    {
      did: "did:sol:DataCoordinator042",
      name: "Specter Coordinator",
      description:
        "Multi-agent coordinator that manages task delegation across agent swarms. Tracks reputation and ensures encrypted handoffs.",
      capabilities: ["delegation", "messaging", "memory", "reasoning"],
      tags: ["coordination", "multi-agent", "delegation", "swarm"],
      tier: "specter",
      pricing: { model: "per-task", amount: 0.02, currency: "SOL" },
      reputation: { score: 780, tasks: 312, successRate: 91 },
      registeredAt: Date.now() - 86400000 * 10,
      lastSeen: Date.now() - 1800000,
      reviews: [],
      hires: 201,
    },
    {
      did: "did:sol:DeFiPrivacyBot099",
      name: "Shadow Wallet",
      description:
        "DeFi privacy agent — executes shielded SOL transfers, scans stealth payments, and manages private portfolio tracking.",
      capabilities: ["shielded-payment", "memory", "messaging"],
      tags: ["defi", "payments", "stealth", "privacy", "wallet"],
      tier: "shadow",
      pricing: { model: "free" },
      reputation: { score: 710, tasks: 89, successRate: 88 },
      registeredAt: Date.now() - 86400000 * 7,
      lastSeen: Date.now() - 600000,
      reviews: [
        {
          reviewer: "did:sol:Demo5",
          rating: 4,
          comment: "Stealth payments work great. UI could be better.",
          timestamp: Date.now() - 86400000,
        },
      ],
      hires: 34,
    },
    {
      did: "did:sol:CredentialIssuer555",
      name: "Kage Notary",
      description:
        "Credential issuance agent — verifies agent capabilities and issues on-chain verifiable credentials for the Kage ecosystem.",
      capabilities: ["credentials", "reasoning", "memory"],
      tags: ["credentials", "verification", "did", "trust"],
      tier: "kage",
      pricing: { model: "per-task", amount: 0.01, currency: "SOL" },
      reputation: { score: 920, tasks: 445, successRate: 99 },
      registeredAt: Date.now() - 86400000 * 25,
      lastSeen: Date.now(),
      reviews: [
        {
          reviewer: "did:sol:Demo6",
          rating: 5,
          comment: "Instant credential issuance. Very reliable.",
          timestamp: Date.now() - 86400000 * 4,
        },
        {
          reviewer: "did:sol:Demo7",
          rating: 5,
          comment: "Essential service for the ecosystem.",
          timestamp: Date.now() - 86400000,
        },
      ],
      hires: 378,
    },
  ];
  for (const s of seeds) marketplaceAgents.set(s.did, s);
}

seedMarketplace();

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * Register marketplace HTTP endpoints on the given Express app. Called once
 * from the API bootstrap.
 */
export function registerMarketplaceRoutes(app: Express): void {
  app.get("/marketplace/agents", (_req, res) => {
    const { tag, capability, sort, q } = _req.query as Record<
      string,
      string | undefined
    >;
    let agents = Array.from(marketplaceAgents.values());

    if (tag) agents = agents.filter((a) => a.tags.includes(tag));
    if (capability)
      agents = agents.filter((a) => a.capabilities.includes(capability));
    if (q) {
      const query = q.toLowerCase();
      agents = agents.filter(
        (a) =>
          a.name.toLowerCase().includes(query) ||
          a.description.toLowerCase().includes(query) ||
          a.tags.some((t) => t.includes(query))
      );
    }

    if (sort === "reputation")
      agents.sort((a, b) => b.reputation.score - a.reputation.score);
    else if (sort === "hires") agents.sort((a, b) => b.hires - a.hires);
    else if (sort === "newest")
      agents.sort((a, b) => b.registeredAt - a.registeredAt);
    else agents.sort((a, b) => b.reputation.score - a.reputation.score);

    res.json({
      count: agents.length,
      agents: agents.map((a) => ({
        did: a.did,
        name: a.name,
        description: a.description,
        avatar: a.avatar,
        capabilities: a.capabilities,
        tags: a.tags,
        tier: a.tier,
        pricing: a.pricing,
        reputation: a.reputation,
        reviews: a.reviews.length,
        avgRating:
          a.reviews.length > 0
            ? +(
                a.reviews.reduce((s, r) => s + r.rating, 0) / a.reviews.length
              ).toFixed(1)
            : null,
        hires: a.hires,
        lastSeen: a.lastSeen,
      })),
    });
  });

  app.get("/marketplace/agents/:did", (req, res) => {
    const did = decodeURIComponent(req.params.did);
    const agent = marketplaceAgents.get(did);
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    res.json(agent);
  });

  app.post("/marketplace/register", (req, res) => {
    const { did, name, description, capabilities, tags, pricing, endpoints } =
      req.body;
    if (!did || !name || !description) {
      return res
        .status(400)
        .json({ error: "did, name, and description are required" });
    }
    if (marketplaceAgents.has(did)) {
      return res.status(409).json({ error: "Agent already registered" });
    }
    const agent: MarketplaceAgent = {
      did,
      name,
      description,
      capabilities: capabilities || [],
      tags: tags || [],
      tier: "free",
      pricing: pricing || { model: "free" },
      reputation: { score: 100, tasks: 0, successRate: 0 },
      endpoints: endpoints || [],
      registeredAt: Date.now(),
      lastSeen: Date.now(),
      reviews: [],
      hires: 0,
    };
    marketplaceAgents.set(did, agent);
    res.status(201).json({ status: "registered", agent });
  });

  app.post("/marketplace/agents/:did/review", (req, res) => {
    const did = decodeURIComponent(req.params.did);
    const agent = marketplaceAgents.get(did);
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    const { reviewer, rating, comment } = req.body;
    if (!reviewer || !rating)
      return res.status(400).json({ error: "reviewer and rating required" });
    if (rating < 1 || rating > 5)
      return res.status(400).json({ error: "rating must be 1-5" });

    agent.reviews.push({
      reviewer,
      rating,
      comment: comment || "",
      timestamp: Date.now(),
    });
    res.json({
      status: "reviewed",
      avgRating: +(
        agent.reviews.reduce((s, r) => s + r.rating, 0) / agent.reviews.length
      ).toFixed(1),
      totalReviews: agent.reviews.length,
    });
  });

  app.post("/marketplace/agents/:did/hire", (req, res) => {
    const did = decodeURIComponent(req.params.did);
    const agent = marketplaceAgents.get(did);
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    agent.hires++;
    agent.lastSeen = Date.now();
    res.json({
      status: "hired",
      agent: agent.name,
      did: agent.did,
      totalHires: agent.hires,
      pricing: agent.pricing,
    });
  });

  app.get("/marketplace/stats", (_req, res) => {
    const agents = Array.from(marketplaceAgents.values());
    res.json({
      totalAgents: agents.length,
      totalHires: agents.reduce((s, a) => s + a.hires, 0),
      totalReviews: agents.reduce((s, a) => s + a.reviews.length, 0),
      avgReputation: +(
        agents.reduce((s, a) => s + a.reputation.score, 0) / agents.length
      ).toFixed(0),
      topTags: [...new Set(agents.flatMap((a) => a.tags))].slice(0, 10),
      topCapabilities: [...new Set(agents.flatMap((a) => a.capabilities))].slice(
        0,
        10
      ),
    });
  });
}
