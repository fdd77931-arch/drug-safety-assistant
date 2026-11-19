export function configuredProvider(env) {
 if (env.MODEL_PROVIDER === 'bailian') {
  if (!env.BAILIAN_API_KEY || !env.BAILIAN_BASE_URL || !env.BAILIAN_MODEL) return null;
  let base;
  try { base = new URL(env.BAILIAN_BASE_URL); } catch { return null; }
  if (base.protocol !== 'https:' || !base.hostname.endsWith('.maas.aliyuncs.com') ||
      !/^\/compatible-mode\/v1\/?$/.test(base.pathname) ||
      base.username || base.password || base.port || base.search || base.hash) return null;
  return {
   endpoint: base.href.replace(/\/$/,'')+'/chat/completions',
   secret: env.BAILIAN_API_KEY,
   model: env.BAILIAN_MODEL,
  };
 }
 if (!env.DEEPSEEK_API_KEY) return null;
 return {
  endpoint:'https://api.deepseek.com/chat/completions',
  secret:env.DEEPSEEK_API_KEY,
  model:'deepseek-flash',
  extra:{thinking:{type:'disabled'}},
 };
}

export async function complete(provider, system, input, send = fetch) {
 const response = await send(provider.endpoint,{
  method:'POST',
  headers:{Authorization:'Bearer '+provider.secret,'Content-Type':'application/json'},
  body:JSON.stringify({
   model:provider.model,
   ...provider.extra,
   messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(input)}],
   response_format:{type:'json_object'},
   max_tokens:2500,
  }),
  signal:AbortSignal.timeout(120000),
 });
 if(!response.ok) throw Error('provider unavailable');
 const data=await response.json();
 return JSON.parse(data.choices[0].message.content);
}
