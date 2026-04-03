import { collectPaymentConfigIssues, getWebhookUrl } from '../src/config.js';
import { confirmPayOSWebhookUrl } from '../src/services/paymentService.js';

async function main() {
  const issues = collectPaymentConfigIssues();
  if (issues.length) {
    throw new Error(issues.join('\n'));
  }

  console.log('[PAYOS] Confirming webhook URL:', getWebhookUrl());
  const result = await confirmPayOSWebhookUrl();
  console.log('[PAYOS] OK:', result.webhookUrl ?? getWebhookUrl());
}

main().catch((error) => {
  console.error('[PAYOS] confirm-webhook failed:', error.message);
  process.exit(1);
});
