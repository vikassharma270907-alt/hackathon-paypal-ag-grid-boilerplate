/**
 * VeriSettle AI — Validated PayPal Transaction State Machine
 * 
 * Enforces legal state transitions across the full lifecycle:
 * CREATED -> ORDER_PENDING -> AUTHORIZATION_PENDING -> AUTHORIZED -> EVIDENCE_PENDING
 * -> REVIEW_REQUIRED -> APPROVAL_PENDING -> APPROVED -> CAPTURE_PENDING -> PARTIALLY_CAPTURED
 * -> CAPTURED -> VOID_PENDING -> VOIDED -> FAILED -> DISPUTED
 */

export type PayPalTransactionState =
  | 'CREATED'
  | 'ORDER_PENDING'
  | 'AUTHORIZATION_PENDING'
  | 'AUTHORIZED'
  | 'EVIDENCE_PENDING'
  | 'REVIEW_REQUIRED'
  | 'APPROVAL_PENDING'
  | 'APPROVED'
  | 'CAPTURE_PENDING'
  | 'PARTIALLY_CAPTURED'
  | 'CAPTURED'
  | 'VOID_PENDING'
  | 'VOIDED'
  | 'FAILED'
  | 'DISPUTED';

const LEGAL_TRANSITIONS: Record<PayPalTransactionState, PayPalTransactionState[]> = {
  CREATED: ['ORDER_PENDING', 'FAILED'],
  ORDER_PENDING: ['AUTHORIZATION_PENDING', 'FAILED', 'VOIDED'],
  AUTHORIZATION_PENDING: ['AUTHORIZED', 'FAILED'],
  AUTHORIZED: ['EVIDENCE_PENDING', 'REVIEW_REQUIRED', 'VOID_PENDING', 'VOIDED', 'FAILED'],
  EVIDENCE_PENDING: ['REVIEW_REQUIRED', 'APPROVAL_PENDING', 'APPROVED', 'VOID_PENDING'],
  REVIEW_REQUIRED: ['APPROVAL_PENDING', 'VOID_PENDING', 'VOIDED'],
  APPROVAL_PENDING: ['APPROVED', 'REVIEW_REQUIRED', 'VOID_PENDING', 'VOIDED'],
  APPROVED: ['CAPTURE_PENDING', 'VOID_PENDING'],
  CAPTURE_PENDING: ['PARTIALLY_CAPTURED', 'CAPTURED', 'FAILED'],
  PARTIALLY_CAPTURED: ['CAPTURE_PENDING', 'CAPTURED', 'VOID_PENDING', 'VOIDED', 'DISPUTED'],
  CAPTURED: ['DISPUTED'],
  VOID_PENDING: ['VOIDED', 'FAILED'],
  VOIDED: [],
  FAILED: ['CREATED'], // Can retry with fresh order
  DISPUTED: ['PARTIALLY_CAPTURED', 'CAPTURED', 'VOIDED'],
};

export interface StateTransitionRecord {
  transitionId: string;
  transactionId: string;
  fromState: PayPalTransactionState;
  toState: PayPalTransactionState;
  timestamp: string;
  actor: string;
  reason: string;
  paypalDebugId?: string;
  idempotencyKey?: string;
}

export class TransactionStateMachine {
  private history: Map<string, StateTransitionRecord[]> = new Map();
  private currentState: Map<string, PayPalTransactionState> = new Map();

  public getCurrentState(transactionId: string): PayPalTransactionState {
    return this.currentState.get(transactionId) || 'CREATED';
  }

  public getTransitionHistory(transactionId: string): StateTransitionRecord[] {
    return this.history.get(transactionId) || [];
  }

  public canTransition(from: PayPalTransactionState, to: PayPalTransactionState): boolean {
    const allowed = LEGAL_TRANSITIONS[from] || [];
    return allowed.includes(to);
  }

  public transition(
    transactionId: string,
    targetState: PayPalTransactionState,
    actor: string,
    reason: string,
    paypalDebugId?: string,
    idempotencyKey?: string
  ): { success: boolean; fromState: PayPalTransactionState; toState: PayPalTransactionState; error?: string } {
    const fromState = this.getCurrentState(transactionId);

    if (fromState === targetState) {
      return { success: true, fromState, toState: targetState };
    }

    if (!this.canTransition(fromState, targetState)) {
      return {
        success: false,
        fromState,
        toState: targetState,
        error: `Illegal state transition: Cannot transition from '${fromState}' to '${targetState}'. Allowed next states: [${(LEGAL_TRANSITIONS[fromState] || []).join(', ')}].`,
      };
    }

    const record: StateTransitionRecord = {
      transitionId: `TR-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      transactionId,
      fromState,
      toState: targetState,
      timestamp: new Date().toISOString(),
      actor,
      reason,
      paypalDebugId,
      idempotencyKey,
    };

    const records = this.history.get(transactionId) || [];
    records.push(record);
    this.history.set(transactionId, records);
    this.currentState.set(transactionId, targetState);

    return { success: true, fromState, toState: targetState };
  }
}

// Global Singleton
const stateMachineKey = Symbol.for('verisettle.state.machine');
const globalAny = globalThis as unknown as { [key: symbol]: TransactionStateMachine };

export const transactionStateMachine =
  globalAny[stateMachineKey] || (globalAny[stateMachineKey] = new TransactionStateMachine());
