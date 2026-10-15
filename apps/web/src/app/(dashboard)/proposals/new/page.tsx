import { NewProposalForm } from "@/features/proposals/new-proposal-form";

export default function NewProposalPage() {
  return (
    <main className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New purchase</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          FinPal checks your spending rules, compares the price with other
          merchants, and decides whether it can pay automatically.
        </p>
      </div>
      <NewProposalForm />
    </main>
  );
}
