---
name: armorantigravity
description: Enforces ArmorIQ Intent-First Governance, cryptographic plan verification, and policy guardrails on all agent actions, tool calls, and treasury executions.
---

# ArmorAntigravity: Intent-First Governance for Google Antigravity

ArmorAntigravity bridges Google Antigravity with the ArmorIQ Intent Security Platform. It ensures that every tool execution, autonomous transaction, or sensitive parameter change is cryptographically anchored to an explicit, human-readable user intent.

## Core Security Pillars

1. **Explicit Intent Declaration (Pre-Flight)**:
   - Before executing high-impact tools (`issue_refund`, `change_payout`, financial transfers, or critical infra modifications), the agent must declare the intent, target, and bounded parameters.
   - Example: `"Intent: Issue refund of $240 for Order #ord-8831 to original payment method."`

2. **Plan Hashing & Nonce Binding**:
   - The intent payload and tool parameters are hashed using SHA-256 (`buildPlanFromToolCalls`).
   - A single-use cryptographic token (`intentToken`) signed by ArmorIQ seals the plan. If any parameter changes mid-flight (man-in-the-middle or prompt injection), the hash mismatches and execution is blocked.

3. **Policy Boundary Enforcement**:
   - **Maximum Single Refund**: Any refund exceeding $500.00 is automatically **BLOCKED** by ArmorIQ Policy Engine.
   - **Destination Whitelisting**: Changing payout accounts requires verified corporate routing (`US-CHASE-*` or verified beneficiary). Unverified accounts trigger an immediate security freeze.
   - **Audit Merkle Root**: Every action is appended to the tamper-evident audit ledger and anchored via Merkle proof.

## Registered MCP Tools

The `flowguard-treasury` MCP server exposes governed tools to Antigravity:
- `lookup_order`: Read-only order query with simulated latency.
- `change_payout`: Modifies settlement bank details (governed by beneficiary whitelist policy).
- `issue_refund`: Executes refund against an order (governed by transaction velocity and limit policy).
- `assert_reserve_floor`: App-side check ensuring treasury balance remains above $15,000 threshold.
- `verify_audit_merkle`: Computes binary Merkle tree root over ledger events.

## Incident Escalation

When ArmorIQ blocks a call:
- Never retry with altered malicious inputs to bypass the block.
- Surface the exact ArmorIQ policy violation (`decision: "BLOCK"`, `reason`, `policyId`) directly to the operator.
- Require dual-custody authorization for policy overrides.
