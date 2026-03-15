"""
Example 3 — Team Vault: shared encrypted secrets with role-based access.

Demonstrates:
  - Creating a team vault with Shamir's Secret Sharing threshold
  - Storing and retrieving an encrypted secret (e.g. an API key)
  - Listing team members and their roles

Run:
    python team_vault.py
"""
import asyncio
from kage import KageAsyncClient


async def main() -> None:
    async with KageAsyncClient("http://localhost:3002") as client:

        print("=== Team Vault Demo ===\n")

        # Agent info (we'll use the agent's own pubkey for the demo)
        info = await client.agent_info()
        my_pubkey = info.get("publicKey", "")
        my_x25519 = info.get("x25519PublicKey", "")
        print(f"Agent pubkey: {my_pubkey[:16]}…")
        print(f"X25519 key:   {my_x25519[:16]}…\n")

        # Create a team (2-of-3 threshold for the demo; only 1 member so threshold=1)
        print("Creating team vault 'Quant Strategies'…")
        team = await client.create_team(
            name="Quant Strategies",
            description="Shared secrets for the trading automation cluster",
            threshold=1,
            members=[
                {
                    "publicKey": my_pubkey,
                    "x25519PublicKey": my_x25519,
                    "role": "owner",
                    "displayName": "Lead Agent",
                }
            ],
        )
        print(f"Team ID:    {team.id}")
        print(f"Members:    {len(team.members)}")
        print(f"Threshold:  {team.threshold}-of-{len(team.members)}")
        if team.explorer_url:
            print(f"On-chain:   {team.explorer_url}")
        print()

        # Store a secret
        print("Storing encrypted secret (Binance API key)…")
        secret = await client.store_team_secret(
            team_id=team.id,
            label="Binance API Key",
            data={"key": "BNB_PROD_sk_abcdef1234567890", "env": "production"},
            description="Main production Binance API key for the cluster",
        )
        print(f"Secret ID:  {secret.id}")
        print(f"Label:      {secret.label}")
        if secret.explorer_url:
            print(f"On-chain:   {secret.explorer_url}")
        print()

        # Retrieve the secret
        print("Retrieving and decrypting secret…")
        result = await client.retrieve_team_secret(team.id, secret.id)
        print(f"Label: {result['label']}")
        print(f"Data:  {result['data']}\n")

        # List all teams
        print("All teams:")
        teams = await client.list_teams()
        for t in teams:
            roles = {m.role for m in t.members}
            print(f"  • {t.name} ({len(t.members)} members, {len(t.secrets)} secrets) — roles: {', '.join(roles)}")


if __name__ == "__main__":
    asyncio.run(main())
