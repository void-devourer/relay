import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

const summary = { credentialsAvailable: false, profile: process.env.AWS_PROFILE ?? 'default', region: process.env.AWS_REGION ?? 'us-east-1', modelConfigured: Boolean(process.env.BEDROCK_MODEL_ID), liveCallVerified: false };
try {
  const credentials = await defaultProvider()();
  summary.credentialsAvailable = true;
  summary.temporaryCredentials = Boolean(credentials.sessionToken);
  if (process.argv.includes('--probe')) {
    if (!process.env.BEDROCK_MODEL_ID) throw Object.assign(new Error(), { name: 'ModelNotConfigured' });
    const client = new BedrockRuntimeClient({ region: summary.region });
    try {
      const response = await client.send(new ConverseCommand({ modelId: process.env.BEDROCK_MODEL_ID, messages: [{ role: 'user', content: [{ text: 'Reply with OK.' }] }], inferenceConfig: { maxTokens: 8 } }), { abortSignal: AbortSignal.timeout(30000) });
      summary.liveCallVerified = Boolean(response.output?.message);
    } finally { client.destroy(); }
  }
} catch (error) { summary.error = error.name; }
console.log(JSON.stringify(summary, null, 2));
if (!summary.credentialsAvailable || (process.argv.includes('--probe') && !summary.liveCallVerified)) process.exitCode = 1;
