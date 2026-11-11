# VeriSettle AI — Release & Render Deployment Guide

**Target Environment:** Render Cloud & GitHub  
**Release Version:** `v2.0.0-competition-upgrade`  
**Git Branch:** `feat/competition-upgrade-verisettle`  
**GitHub Repository:** `https://github.com/vikassharma270907-alt/hackathon-paypal-ag-grid-boilerplate.git`  
**Blueprint File:** `render.yaml`  

---

## 1. Multi-Service Cloud Architecture

VeriSettle AI is configured as a dual-service architecture on Render:

1. **`verisettle-web`**: Next.js 16 Web Command Center & Financial Operations Platform (Node.js environment).
   - Serves React 19 UI with 12 distinct operational sections: Overview, Invoice Intelligence, Evidence Graph DAG, Four-Way Reconciliation, Transaction Risk, Payment Mandates, Settlement Operations, Dispute Copilot, AG Grid Ledger, Bryntum Timeline, Judge Demo Mode, and Settings.
   - Executes Next.js route handlers (`/api/reconciliation/*`, `/api/mandates/*`, `/api/settlements/*`, `/api/demo/*`, `/api/paypal/*`, `/api/health`).
   - Enforces the Deterministic Policy Firewall and cryptographic Ed25519/SHA-256 mandates before financial execution.
2. **`verisettle-ml`**: Python 3.11 FastAPI Microservice.
   - Hosts LayoutLMv3 spatial document extraction, XGBoost risk classification, and EV decision controller.
   - Connected via internal service networking (`ML_SERVICE_URL`).
   - If offline or starting up, `verisettle-web` automatically cascades to the embedded high-performance zero-latency TypeScript ML engine.

```
                              ┌─────────────────────────────────────────┐
                              │            RENDER BLUEPRINT             │
                              └────────────────────┬────────────────────┘
                                                   │
                         ┌─────────────────────────┴────────────────────────┐
                         │                                                  │
                         ▼                                                  ▼
             ┌─────────────────────────┐                        ┌────────────────────────┐
             │     verisettle-web      │                        │     verisettle-ml      │
             │   (Next.js 16 / Node)   │ ────── ML_SERVICE ────>│  (FastAPI / Python)    │
             │ Health: /api/health     │                        │ Health: /health        │
             └───────────┬─────────────┘                        └────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
   PayPal Sandbox    Gemini AI       Channel3
   REST API v2       v1beta Models   Catalog API
```

---

## 2. Render Blueprint Specification (`render.yaml`)

```yaml
services:
  # 1. Next.js 16 Web Command Center & Autonomous Financial Operations Platform
  - type: web
    name: verisettle-web
    env: node
    plan: standard
    buildCommand: npm install && npm run build
    startCommand: npm run start
    healthCheckPath: /api/health
    envVars:
      - key: NODE_ENV
        value: production
      - key: PAYPAL_ENVIRONMENT
        value: SANDBOX
      - key: PAYPAL_BASE_URL
        value: https://api-m.sandbox.paypal.com
      - key: PAYPAL_CLIENT_ID
        sync: false
      - key: PAYPAL_SECRET
        sync: false
      - key: PAYPAL_WEBHOOK_ID
        sync: false
      - key: GEMINI_API_KEY
        sync: false
      - key: CHANNEL3_API_KEY
        sync: false
      - key: ML_SERVICE_URL
        fromService:
          type: web
          name: verisettle-ml
          property: host
      - key: ML_MODE
        value: cached

  # 2. Python FastAPI ML/DL Microservice (LayoutLMv3 + XGBoost + GNN/LSTM)
  - type: web
    name: verisettle-ml
    env: python
    plan: standard
    buildCommand: cd ml_service && pip install -r requirements.txt
    startCommand: cd ml_service && uvicorn main:app --host 0.0.0.0 --port $PORT
    healthCheckPath: /health
    envVars:
      - key: PYTHON_VERSION
        value: 3.11.8
      - key: GEMINI_API_KEY
        sync: false
```

---

## 3. Required Environment Variables

When deploying on Render, configure the following secrets in the Render Dashboard:

| Variable | Description | Source |
|---|---|---|
| `PAYPAL_CLIENT_ID` | PayPal Sandbox Client ID | [developer.paypal.com](https://developer.paypal.com) |
| `PAYPAL_SECRET` | PayPal Sandbox Client Secret | [developer.paypal.com](https://developer.paypal.com) |
| `PAYPAL_WEBHOOK_ID` | PayPal Webhook Identifier | [developer.paypal.com](https://developer.paypal.com) |
| `GEMINI_API_KEY` | Google Gemini API Key | [aistudio.google.com](https://aistudio.google.com) |
| `CHANNEL3_API_KEY` | Channel3 B2B Universal Catalog Key | [trychannel3.com](https://trychannel3.com) |

---

## 4. Build & Production Verification Evidence

- Next.js Production Build:
  - Command: `npm run build`
  - Output: 32 routes compiled with zero errors.
- Vitest Automated Test Suite:
  - Command: `npm test`
  - Output: 40/40 tests passing (100% pass rate).
- Health Check:
  - Endpoint: `GET /api/health`
  - Status: `200 OK` (reports latency across PayPal, Gemini, Channel3, Python ML, and Webhooks).
