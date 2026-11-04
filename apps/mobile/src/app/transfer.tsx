import type { ProposalEvaluation, TransferDraft } from "@finpal/contracts";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { Button, Notice, TextField } from "@/components/form";
import { useToast } from "@/components/toast";
import { Card, Eyebrow, Screen, Text, Title } from "@/components/ui";
import { apiRequest, errorMessage } from "@/lib/api";
import { ms, s } from "@/lib/screen";

/**
 * Send money by typing or, with the mic on the phone's keyboard, by speaking.
 * Dictation mishears addresses, so nothing happens until the details are
 * confirmed. The decision screen then handles review and PayPal as usual.
 */
export default function Transfer() {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<TransferDraft | null>(null);
  const [amount, setAmount] = useState("");
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);

  async function understand() {
    if (text.trim().length < 3 || pending) return;
    setPending(true);
    try {
      const parsed = await apiRequest<TransferDraft>(
        "/api/v1/agent/transfer/parse",
        { body: { text: text.trim() } },
      );
      setDraft(parsed);
      setAmount(parsed.amount === null ? "" : String(parsed.amount));
      setEmail(parsed.recipientEmail ?? "");
    } catch (error) {
      toast(errorMessage(error), "bad");
    } finally {
      setPending(false);
    }
  }

  async function confirm() {
    if (!draft || pending) return;
    setPending(true);
    try {
      const result = await apiRequest<ProposalEvaluation>(
        "/api/v1/agent/transfer",
        {
          body: {
            text: text.trim(),
            amount: Number(amount),
            currency: draft.currency,
            recipientEmail: email.trim(),
          },
        },
      );
      router.replace(`/decisions/${result.decision.id}`);
    } catch (error) {
      toast(errorMessage(error), "bad");
      setPending(false);
    }
  }

  return (
    <Screen>
      <Title>Send money</Title>
      <Card>
        <View style={{ gap: s(12) }}>
          <TextField
            label="What should the agent send?"
            value={text}
            onChangeText={setText}
            placeholder="Send $100 to someone@example.com"
            hint="Tap the mic on your keyboard to say it."
            onSubmitEditing={understand}
          />
          <Button
            label="Continue"
            onPress={understand}
            busy={pending && !draft}
            disabled={text.trim().length < 3}
          />
        </View>
      </Card>

      {draft ? (
        <Card>
          <View style={{ gap: s(12) }}>
            <Eyebrow>Is this right?</Eyebrow>
            {draft.question ? (
              <Notice tone="info">{draft.question}</Notice>
            ) : (
              <Text style={{ fontSize: ms(13) }}>
                Check the address letter by letter. Money sent to the wrong
                person may not come back.
              </Text>
            )}
            <TextField
              label={`Amount (${draft.currency})`}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              monospace
            />
            <TextField
              label="Recipient's email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              monospace
            />
            <Button
              label="Check against my rules"
              variant="primary"
              onPress={confirm}
              busy={pending}
              disabled={!(Number(amount) > 0) || !email.trim()}
            />
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}
