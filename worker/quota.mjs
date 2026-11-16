export class Quota {
 constructor(state,env){this.storage=state.storage;this.limit=Number(env.DAILY_LIMIT)||100}
 async fetch(request){
  const {ip}=await request.json(),now=Date.now(),day=new Date(now+28800000).toISOString().slice(0,10),minute=Math.floor(now/60000);
  const ok=await this.storage.transaction(async s=>{
   let v=await s.get('quota')||{};if(v.day!==day)v={day,count:0};if(v.minute!==minute){v.minute=minute;v.ips={}}
   if(v.count>=this.limit||(v.ips[ip]||0)>=6)return false;
   v.count++;v.ips[ip]=(v.ips[ip]||0)+1;await s.put('quota',v);return true;
  });
  return Response.json(ok?{ok:true}:{detail:'演示调用额度已用完或请求过于频繁，请稍后再试。'},{status:ok?200:429});
 }
}
