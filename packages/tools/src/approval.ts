import type { ApprovalDecision, ApprovalState, ToolCallId } from '@golemancy/shared';

type Resolver = (decision: ApprovalDecision) => void;

// Plan A boundary: OpenAI Agents SDK owns tool scheduling, interruption,
// and resume. This queue is the bridge between an SDK `needsApproval` pause
// and the sidecar HTTP surface (`approval_required` SSE event + POST
// /tools/:id/approve). It does NOT decide which tools need approval, and it
// does NOT execute tools — those concerns stay inside Agents SDK and the
// tool handlers respectively.
export class ApprovalQueue {
  private readonly pending = new Map<ToolCallId, { resolve: Resolver }>();
  private readonly state = new Map<ToolCallId, ApprovalState>();

  request(toolCallId: ToolCallId): Promise<ApprovalDecision> {
    this.state.set(toolCallId, 'pending');
    return new Promise((resolve) => {
      this.pending.set(toolCallId, { resolve });
    });
  }

  decide(toolCallId: ToolCallId, decision: ApprovalDecision): boolean {
    const entry = this.pending.get(toolCallId);
    if (!entry) return false;
    this.pending.delete(toolCallId);
    this.state.set(toolCallId, decision);
    entry.resolve(decision);
    return true;
  }

  status(toolCallId: ToolCallId): ApprovalState | undefined {
    return this.state.get(toolCallId);
  }
}
