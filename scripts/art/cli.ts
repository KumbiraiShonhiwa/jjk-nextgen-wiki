import { generateArt, OpenAIProvider } from './generate';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];

const only = value('only')?.split(',').filter(Boolean);
const key = process.env.OPENAI_API_KEY;
const dryRun = flag('dry-run') || !key;
if (!key && !flag('dry-run')) console.log('OPENAI_API_KEY is not set; running as --dry-run (prompts only).');

const result = await generateArt({
  root: process.cwd(),
  provider: key ? new OpenAIProvider(key) : undefined,
  only,
  force: flag('force'),
  dryRun,
});
console.log(`\n${result.generated.length} generated, ${result.skipped.length} skipped, ${result.failed.length} failed`);
process.exit(result.failed.length ? 1 : 0);
