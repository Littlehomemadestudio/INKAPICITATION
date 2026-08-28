// VLM screenshot review — usage: node scripts/vlm_check.js <image> "<prompt>"
const ZAI = require('z-ai-web-dev-sdk').default;
const fs = require('fs');
async function main() {
  const img = process.argv[2];
  const prompt = process.argv[3] || 'Describe this screenshot in detail.';
  const zai = await ZAI.create();
  const b64 = fs.readFileSync(img).toString('base64');
  const res = await zai.chat.completions.create({
    messages: [
      { role: 'user', content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
      ]},
    ],
  });
  console.log(res.choices[0].message.content);
}
main().catch(e => { console.error('ERR', e.message); process.exit(1); });
