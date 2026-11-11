# VeriSettle AI

### Evidence-Gated Autonomous Financial Operations Platform

> **PayPal AI Hackathon 2026 Official Submission**  
> **Core Architectural Axiom:**  
> **"AI/ML PROPOSES → EVIDENCE ENGINE VERIFIES → DETERMINISTIC POLICY DECIDES → HUMAN AUTHORIZES WHEN REQUIRED → PAYPAL EXECUTES → AUDIT LEDGER RECORDS."**

---

## 1. Executive Summary & Product Vision

**VeriSettle AI** is an enterprise-grade, evidence-gated autonomous financial operations agent and settlement platform. It eliminates commercial transaction friction, invoice fraud, and payment disputes by bridging multimodal document intelligence, four-way reconciliation, cryptographic spend mandates, explainable machine learning risk models, and PayPal Sandbox execution.

In enterprise accounts payable and commercial procurement, generative AI models must never directly execute payments. Unconstrained agents can hallucinate accounting amounts, fall victim to prompt injections in supplier PDFs, or prematurely disburse cash. 

VeriSettle AI solves this through strict separation of concerns:
1. **Multimodal AI & Document Intelligence:** LayoutLMv3 spatial token classification and Google Gemini 3.1 extract accounting fields and preserve exact bounding-box coordinates.
2. **Deterministic Four-Way Reconciliation:** Simultaneously reconciles Purchase Orders, Supplier Invoices, Physical Delivery Evidence, and PayPal Authorizations using decimal-safe arithmetic.
3. **Cryptographic Payment Mandates:** Spend policies signed with Ed25519 asymmetric keys, sealed with SHA-256 canonical digests, and protected against replay attacks using single-use nonces.
4. **Ensemble Risk & Model Disagreement Detection:** Fuses Leak-Free XGBoost, Isolation Forest, LSTM Autoencoders, and Gemini semantic interpretation—detecting when models diverge to escalate for human review.
5. **Real PayPal Sandbox Rails:** Executes live Orders v2 authorization holds (`intent: "AUTHORIZE"`), Payments v2 captures, partial delivery clamping, and Disputes v1 triage.
6. **Immutable Audit Ledger:** Sealed cryptographic audit events capturing every state transition and `PayPal-Debug-Id`.

---

## 2. System Architecture & 12-Section Navigation

```mermaid
flowchart TD
    subgraph INGESTION["1. Commercial Evidence Ingestion"]
        PO["Purchase Order (Agreed Terms)"]
        INV["Supplier Invoice (Billed Claim)"]
        POD["Carrier Proof of Delivery (Dock Scanned)"]
        AUTH["PayPal Authorization (Funds on Hold)"]
    end

    subgraph AI_INTEL["2. AI & ML Intelligence Engine"]
        LLM["LayoutLMv3 Spatial Tokens (bbox)"]
        GEMINI["Gemini 3.1 Structured Schema"]
        XGB["Leak-Free XGBoost Risk"]
        ISO["Isolation Forest Anomaly Detection"]
        DISAGREE["Model Disagreement Matrix"]
    end

    subgraph RECON["3. Four-Way Reconciliation Engine"]
        MATCH["Line-Item Matching & Tolerance Rules"]
        DECIMAL["Decimal-Safe Arithmetic"]
        ELIGIBLE["Settlement Eligibility:\n$eligible = Qty_accepted * Agreed_Price"]
    end

    subgraph MANDATE["4. Cryptographic Mandate & Firewall"]
        SIG["Ed25519 Signature Verification"]
        DIGEST["FIPS 180-4 SHA-256 Canonical Digest"]
        NONCE["Anti-Replay Nonce Set"]
        FIREWALL{"Policy Firewall Gate\nALLOW | APPROVAL | BLOCK"}
    end

    subgraph EXEC["5. PayPal REST Execution Rails"]
        ORDERS["Orders v2 (intent: AUTHORIZE)"]
        PAYMENTS["Payments v2 (/capture & /void)"]
        DISPUTE["Disputes v1 (EV Triage & Rebuttal)"]
    end

    subgraph AUDIT["6. Immutable Ledger & Visual Workspace"]
        LEDGER["Cryptographic Audit Ledger"]
        AG_GRID["AG Grid 10-Table Relational Ledger"]
        BRYNTUM["Bryntum FS Escrow Gantt Schedule"]
        DAG["Transaction Evidence Graph (DAG)"]
    end

    PO & INV & POD & AUTH --> LLM & GEMINI
    LLM & GEMINI --> XGB & ISO
    XGB & ISO --> DISAGREE
    INGESTION --> MATCH
    MATCH --> DECIMAL --> ELIGIBLE
    ELIGIBLE & DISAGREE --> MANDATE
    MANDATE --> FIREWALL
    FIREWALL -->|ALLOW / APPROVED| ORDERS & PAYMENTS & DISPUTE
    FIREWALL -->|BLOCK (Fail-Closed)| LEDGER
    ORDERS & PAYMENTS & DISPUTE --> LEDGER
    LEDGER --> AG_GRID & BRYNTUM & DAG
```

The unified dashboard features a 12-section operational navigation:
1. **Overview Dashboard:** Executive KPIs, actual prevented overpayments, settlement volumes, and real vs. synthetic disclosures.
2. **Invoice Intelligence:** LayoutLMv3 spatial tokens, bounding-box overlays, and Gemini 3.1 structured JSON schema parsing.
3. **Evidence Graph:** Interactive Directed Acyclic Graph (DAG) tracing provenance from PO to Capture with discrepancy drill-downs.
4. **Four-Way Reconciliation:** 4 connected cards (PO | Invoice | Delivery | PayPal Auth) with line-item matching and settlement clamping.
5. **Transaction Risk:** Ensemble risk scores, TreeSHAP feature attributions, and the Model Disagreement Detection panel.
6. **Payment Mandates:** Cryptographic Ed25519 signing, SHA-256 canonical digest verification, and Human Approval binding.
7. **Settlement Operations:** PayPal Transaction State Machine visualizer and Payments v2 capture executor.
8. **Dispute Copilot:** AI Dispute Defense assistant with transparent Expected Value (EV) decision math and downloadable Evidence Packs.
9. **AG Grid Financial Ledger:** 10 relational data tables with currency formatting, variance badges, and PayPal Debug ID chips.
10. **Bryntum Timeline:** Finish-to-Start (`FS`) escrow milestone Gantt schedule ($M_1 \to M_8$).
11. **Judge Demo Mode:** 1-Click execution for Scenarios A, B, and C with full execution traces and safe reset.
12. **Settings & Integrations:** Live multi-service health monitoring across PayPal, Gemini, Channel3, Render, and APIMatic.

---

## 3. Core Differentiators & Technical Implementations

### 3.1 Feature 1: Transaction Evidence Graph
Connects 17 distinct business evidence records into a verifiable Directed Acyclic Graph (DAG):
- Purchase Orders & Line Items
- Invoices & Line Items
- OCR / LayoutLMv3 spatial tokens with bounding boxes $(x, y, w, h)$ and page numbers
- Gemini 3.1 structured semantic interpretation
- Carrier proof of delivery (FedEx/UPS tracking and signed dock receipts)
- PayPal Orders, Authorizations, and Captures
- Risk assessments and Model Disagreement records
- Signed Payment Mandates and Human Approvals
- Signed audit events

When any discrepancy is flagged, the user can click the node to inspect the exact extracted value, expected value, source document hash, spatial coordinates, comparison method, why it matters, and recommended resolution.

### 3.2 Feature 2: Four-Way Reconciliation Engine
Compares 4 independent business records simultaneously:
$$\text{eligible\_quantity} = \text{accepted\_verified\_quantity}$$
$$\text{eligible\_line\_amount} = \text{eligible\_quantity} \times \text{agreed\_unit\_price}$$
- Uses `DecimalMath` to prevent IEEE 754 floating-point inaccuracies.
- Enforces strict tolerance rules for rounding ($\pm \$0.02$), invoice variance ($\le 1.5\%$), and proportional shipping/tax allocation.
- Emits 10 explicit match statuses: `MATCHED`, `PARTIAL_MATCH`, `PRICE_VARIANCE`, `QUANTITY_VARIANCE`, `DELIVERY_UNVERIFIED`, `SUPPLIER_MISMATCH`, `CURRENCY_MISMATCH`, `AUTHORIZATION_MISMATCH`, `FROZEN_VARIANCE_EXCEEDED`, `MANUAL_REVIEW_REQUIRED`.

### 3.3 Feature 3: Cryptographic Payment Mandate & Policy Firewall
Implements governance over autonomous agent spending:
- **Canonical JSON Serialization:** Deterministic key sorting prevents semantic hashing divergence.
- **Asymmetric Signing:** Ed25519 digital signatures (and HMAC-SHA256 scheme).
- **Anti-Replay Nonce Monitor:** Consumes single-use cryptographic nonces to prevent replay attacks.
- **Approval-to-Transaction Binding:** Human approval binds the exact transaction digest and mandate digest; any material alteration invalidates prior approvals.
- **Fail-Closed Firewall:** Emits `ALLOW`, `REQUIRE_HUMAN_APPROVAL`, or `BLOCK` with machine-readable reasons.

### 3.4 Feature 4: Advanced AI/ML Risk & Model Disagreement Engine
- **Model A (LayoutLMv3):** Spatial document understanding and token classification.
- **Model B (Google Gemini 3.1):** Schema-guided semantic extraction and dispute rebuttal generation.
- **Model C (Leak-Free XGBoost):** Prior-timestamp frequency encoding ($f_e = n_e / n$) to prevent target leakage.
- **Model D (Isolation Forest):** High-dimensional anomaly outlier detection.
- **Model E (LSTM Autoencoder):** Sequential transaction cadence reconstruction with Gumbel Extreme Value Theory (EVT) tail scoring.
- **Model F (SHAP Explainability):** TreeSHAP local additive feature importance rankings.
- **Model Disagreement Detection:** Flags divergences when one model indicates low risk while another flags high anomalies, triggering a `REQUIRE_HUMAN_APPROVAL` policy override rather than forcing artificial consensus.

### 3.5 Feature 5: AI Dispute Defense Copilot
- **Economic Decision Engine:** Evaluates expected value (EV) across actions:
  $$\text{EV}_{\text{fight}} = P(\text{win}) \times \text{Disputed Amount} - (\text{Dispute Fee} + \text{Evidence Prep Cost})$$
  $$\text{EV}_{\text{accept}} = -\text{Disputed Amount}$$
- **Evidence Pack Generator:** Compiles an ID-grounded evidence dossier citing specific document hashes, tracking numbers, and line-item audits.
- Requires explicit human authorization before consequential submissions.

### 3.6 Feature 6: Judge Demo Mode
1-Click live execution of three repeatable scenarios:
- **Scenario A — Clean Commercial Transaction:** 100% matched PO, invoice, and delivery; full settlement capture executed via PayPal Sandbox.
- **Scenario B — Tampered Supplier Invoice:** +5.0% price inflation injected; 4-Way Match flags variance, Deterministic Policy Firewall immediately freezes payment. Zero money movement.
- **Scenario C — Partial Delivery Clamping:** 100 units ordered and billed ($2,450.00); dock inspection confirms 70 units accepted; capture clamped to $1,715.00 via PayPal Sandbox partial capture.
- **Safe Reset:** Restores seeded demonstration state without touching external live PayPal records or user transactions.

---

## 4. Multi-Sponsor Integration Matrix

| Sponsor Partner | Prize Track | VeriSettle AI Implementation | Technical Evidence & Source Files |
| :--- | :--- | :--- | :--- |
| **AG Grid / AG Studio** | **Best Use of AG Grid ($5,000)** | 10-table relational schema joining 9 PayPal tables with Table 10 (`ML Risk & 3-Way Match Audits`), custom `type: 'money'` currency formatting, variance badges, and clickable `PayPal-Debug-Id` chips. | [`src/lib/dashboard-data.ts`](./src/lib/dashboard-data.ts), [`src/app/dashboard/components/relational-table-workspace.tsx`](./src/app/dashboard/components/relational-table-workspace.tsx) |
| **APIMatic** | **Best Use of APIMatic ($1,000)** | Build-time PayPal API grounding via the official APIMatic Server SDK Context Plugin and strongly-typed `@paypal/paypal-server-sdk@2.5.0`. | `npx context-plugins install https://github.com/paypaldev/server-sdk-context-plugin-preview` |
| **Bryntum** | **Best Use of Bryntum ($1,000)** | Interactive Finish-to-Start (`FS`) escrow milestone Gantt schedule ($M_1 \to M_8$) and 30-day liquidity cashflow forecast. | [`src/app/dashboard/components/bryntum-gantt-panel.tsx`](./src/app/dashboard/components/bryntum-gantt-panel.tsx) |
| **Channel3** | **Best Use of Channel3 ($1,500)** | Multi-merchant catalog discovery and category price norms for anomaly z-score calculation ($z = \frac{p - \mu}{\sigma}$). Live `@channel3/sdk` integration powering catalog search and pricing benchmarks. | [`src/lib/channel3.ts`](./src/lib/channel3.ts), [`src/app/dashboard/components/channel3-catalog-explorer.tsx`](./src/app/dashboard/components/channel3-catalog-explorer.tsx) |
| **Render** | **Best Use of Render ($1,000 Credits)** | Multi-service cloud blueprint (`render.yaml`) hosting both Next.js 16 Web Command Center and Python FastAPI ML microservice. | [`render.yaml`](./render.yaml) |

---

## 5. Automated Verification Suite (40/40 Passing Tests)

Run the full automated test suite with Vitest:

```bash
npm test
```

### Passing Test Summary
```
 Test Files  2 passed (2)
      Tests  40 passed (40)
   Duration  28.9s

✓ tests/competition-upgrade.test.ts (20 tests passed)
  ✓ 1. Four-Way Reconciliation Engine (5 tests: decimal math, perfect match, price variance freeze, partial delivery clamp, currency mismatch)
  ✓ 2. Cryptographic Payment Mandates (4 tests: Ed25519 signing/verification, nonce replay protection, expired mandate block, order cap & budget block)
  ✓ 3. Transaction Evidence Graph (2 tests: DAG construction with provenance, discrepancy drill-down details)
  ✓ 4. AI/ML Risk Intelligence & Disagreement (2 tests: model disagreement detection, SHAP feature attributions)
  ✓ 5. PayPal Transaction State Machine (2 tests: legal transitions, illegal leap rejection)
  ✓ 6. AI Dispute Defense Copilot (2 tests: EV decision math, Evidence Pack generation)
  ✓ 7. Judge Demo Mode Scenarios (3 tests: clean transaction capture, tampered invoice freeze, partial delivery clamp)

✓ tests/verisettle.test.ts (20 tests passed)
  ✓ 1. oauth_token_cache: verifies OAuth 2.0 token reuse and caching
  ✓ 2. idempotency_headers: confirms deterministic PayPal-Request-Id generation
  ✓ 3. three_way_match_pass: verifies match within <= 1.5% triggers CAPTURE
  ✓ 4. three_way_match_freeze: verifies > 1.5% variance freezes capture
  ✓ 5. partial_delivery_override: confirms greedy 100% proposal is clamped to 70%
  ✓ 6. skeptic_gate_blocks_negative_ev: verifies EV_discount <= 0 blocks dilutive terms
  ✓ 7. dispute_triage_min_cost: verifies Cost_fight vs Cost_accept math
  ✓ 8. cosmos_mcp_double_auth: verifies tool_search and execute_tool digest checks
  ✓ 9. prompt_injection_blocked: verifies prompt injection is blocked by policy firewall
  ✓ 10. mock_response_handling: verifies PayPal-Mock-Response: INSTRUMENT_DECLINED handling
  ✓ 11. channel3_catalog_pricing_norm: discovers multi-merchant products and norms
  ✓ 12. cosmos_channel3_mcp_tool: executes channel3_search_products via Cosmos.AI gateway
  ✓ 13. gemini_api_key_and_client: verifies Google Gemini API readiness
  ✓ 14. gemini_dispute_rebuttal_generation: verifies ID-grounded rebuttal with citations
  ✓ 15. paypal_orders_v2_full_lifecycle: verifies Orders v2 create, retrieve, authorize, capture, void
  ✓ 16. gemini_invoice_extraction_and_structured_response: verifies structured JSON generation
  ✓ 17. python_ml_service_client_and_fallback: connects to Python ML service or cascades to TS engine
  ✓ 18. full_system_health_checks: validates health check reporting across all integrated APIs
  ✓ 19. token_cache_metadata: verifies token cache inspection without leaking secret tokens
  ✓ 20. end_to_end_acceptance_journey: complete multi-step user journey
```

---

## 6. Disclosures & Integrity Statement

1. **Real PayPal Sandbox Operations:** All payment authorization holds (`Orders v2 intent: AUTHORIZE`), captures (`Payments v2 /capture`), and voids are executed directly against PayPal Sandbox (`https://api-m.sandbox.paypal.com`).
2. **Deterministic Offline Simulation Fallback:** If sandbox credentials encounter HTTP 401 or are unconfigured during evaluation, the system cascades transparently to deterministic simulation with genuine `PayPal-Debug-Id` formats to guarantee continuous reviewer testing.
3. **Synthetic Data Disclosure:** Model benchmarks and sample purchase orders are generated from standard synthetic enterprise purchasing distributions (MIT License) and are explicitly labeled as `SAMPLE` / `SYNTHETIC`.
4. **Zero Production Money Movement:** No real-money production transactions are ever initiated during testing.

---

## 7. Local Setup & Quickstart

### Prerequisites
- Node.js `>= 20.x` (Recommended: Node 22+)
- Python `>= 3.10` (Optional: for running the Python ML FastAPI service)
- npm `>= 10.x`

### Installation & Run
```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local

# 3. Run automated tests (40/40 tests)
npm test

# 4. Build optimized production bundle
npm run build

# 5. Start web command center
npm start
```

Open [http://localhost:3000](http://localhost:3000) or [http://localhost:3000/dashboard](http://localhost:3000/dashboard).

---

## 8. License

This project is licensed under the **MIT License** — see the [`LICENSE`](./LICENSE) file for details.
