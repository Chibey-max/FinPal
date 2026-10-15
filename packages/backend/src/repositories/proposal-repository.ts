import type { CreateProposalInput, Proposal } from "@finpal/contracts";

export interface ProposalRepository {
  create(userId: string, input: CreateProposalInput): Promise<Proposal>;
  findById(userId: string, id: string): Promise<Proposal | null>;
}
