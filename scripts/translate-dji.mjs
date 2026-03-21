import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) {
  console.error('Error: OPENAI_KEY environment variable not set');
  process.exit(1);
}
const db = createClient('https://lxubuceipdmpovtbukmb.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4dWJ1Y2VpcGRtcG92dGJ1a21iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzQ3NTMxNiwiZXhwIjoyMDg5MDUxMzE2fQ.X7j1G7JX3YtXNWTCJQpjCTVJrp81cIAvoLf-vCefrss', { auth: { persistSession: false } });



const batches = JSON.parse(fs.readFileSync('/tmp/dji-translate-batches.json', 'utf-8'));

const SYSTEM_PROMPT = `You are a translator. Translate ALL non-English text to English in the JSON array. Keep English text unchanged. For Chinese place names use standard English names (广州市→Guangzhou, 广东省→Guangdong Province). For store names translate fully. Return JSON object with key "results" containing array of {id, name, address, city, state}. Keep IDs unchanged.`;

async function translateBatch(batch) {
  const input = batch.map(r => ({ id: r.id, name: r.name, address: r.address, city: r.city, state: r.state }));
  
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(input) }
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' }
    })
  });
  
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI error ${resp.status}: ${err}`);
  }
  
  const result = await resp.json();
  let content = result.choices[0].message.content;
  const parsed = JSON.parse(content);
  return parsed.results;
}

async function run() {
  let totalUpdated = 0;
  
  for (let i = 0; i < batches.length; i++) {
    try {
      const translated = await translateBatch(batches[i]);
      
      // Update DB
      let batchUpdated = 0;
      for (const t of translated) {
        const { error } = await db.from('dji_resellers').update({
          name: t.name,
          address: t.address,
          city: t.city,
          state: t.state,
          updated_at: new Date().toISOString()
        }).eq('id', t.id);
        
        if (error) {
          console.error(`  Error updating id=${t.id}:`, error.message);
        } else {
          batchUpdated++;
        }
      }
      
      totalUpdated += batchUpdated;
      console.log(`Batch ${i + 1}/${batches.length}: translated ${translated.length}, updated ${batchUpdated} rows`);
    } catch (e) {
      console.error(`Batch ${i + 1} FAILED:`, e.message);
    }
  }
  
  console.log(`\nDone! Total updated: ${totalUpdated} / ${batches.length * 50}`);
  
  // Verify - check remaining non-Latin
  const { data } = await db.from('dji_resellers').select('id, name, city, state').order('id');
  const nonLatinRegex = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af\u0400-\u04ff\u0600-\u06ff\u0e00-\u0e7f]/;
  const remaining = data.filter(r => ['name','city','state'].some(f => r[f] && nonLatinRegex.test(r[f])));
  console.log(`Remaining non-Latin records: ${remaining.length}`);
  if (remaining.length > 0) {
    remaining.slice(0, 5).forEach(r => console.log(`  id=${r.id}: ${r.name} | ${r.city} | ${r.state}`));
  }
}

run();
