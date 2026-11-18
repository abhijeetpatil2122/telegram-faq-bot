import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { searchKnowledge } from '../scripts/search-engine.mjs';

const DATA=path.join(process.cwd(),'data/knowledge.json');
const CATEGORIES=path.join(process.cwd(),'config/categories.json');
const MAX_AGE=86400;\nlet cachedKnowledge=null;\nlet cachedCategories=null;\nfunction stores(){\n  if(!cachedKnowledge)cachedKnowledge=JSON.parse(fs.readFileSync(DATA,'utf8'));\n  if(!cachedCategories)cachedCategories=JSON.parse(fs.readFileSync(CATEGORIES,'utf8'));\n  return {data:cachedKnowledge,config:cachedCategories};\n}
function validateInitData(raw){
  if(typeof raw!=='string'||!raw||raw.length>8192) throw Object.assign(new Error('Open this Help Desk from Telegram to search.'),{status:401});
  const token=process.env.BOT_TOKEN;
  if(!token) throw new Error('The FAQ bot is not configured.');
  const params=new URLSearchParams(raw), hash=params.get('hash');
  if(!hash||!/^[a-f0-9]{64}$/i.test(hash)) throw Object.assign(new Error('Invalid Telegram session.'),{status:401});
  params.delete('hash'); params.sort();
  const check=[...params.entries()].map(([k,v])=>k+'='+v).join('\n');
  const secret=crypto.createHmac('sha256','WebAppData').update(token).digest();
  const calculated=crypto.createHmac('sha256',secret).update(check).digest('hex');
  const a=Buffer.from(hash,'hex'), b=Buffer.from(calculated,'hex');
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b)) throw Object.assign(new Error('Telegram session verification failed. Reopen the Mini App from the bot.'),{status:401});
  const authDate=Number(params.get('auth_date')), age=Math.floor(Date.now()/1000)-authDate;
  if(!Number.isFinite(authDate)||age < -60||age > MAX_AGE) throw Object.assign(new Error('Your Telegram session has expired. Close and reopen the Mini App.'),{status:401});
  let user; try{user=JSON.parse(params.get('user')||'null');}catch{throw Object.assign(new Error('Invalid Telegram user data.'),{status:401});}
  if(!user||!Number.isSafeInteger(user.id)) throw Object.assign(new Error('Telegram user information is missing.'),{status:401});
  return user;
}
function publicItem(item){return {id:String(item.id??''),type:String(item.type??'guide'),category:String(item.category??'USER_HELP'),question:String(item.question??item.title??'Telegram help'),title:String(item.title??item.question??'Telegram help'),section:String(item.section??''),answer:String(item.answer??''),answer_html:String(item.answer_html??''),source:{title:String(item.source?.title??'Official Telegram source'),url:String(item.source?.url??'')}};}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  if(req.method==='GET'){
    try{
      const {data,config}=stores(), counts=new Map();
      for(const item of data.items??[]){const key=String(item.category??'USER_HELP').toUpperCase();counts.set(key,(counts.get(key)??0)+1);}
      const categories=Object.entries(config).map(([id,description])=>({id,title:id.replaceAll('_',' ').toLowerCase().replace(/\b\p{L}/gu,c=>c.toUpperCase()),description,count:counts.get(id)??0})).filter(x=>x.count>0);
      return res.status(200).json({ok:true,bot:'TeleFQBot',total:data.items?.length??0,categories});
    }catch(error){console.error('Mini App bootstrap failed:',error);return res.status(500).json({ok:false,error:'The Help Desk could not load its knowledge index.'});}
  }
  if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return res.status(405).json({ok:false,error:'Method not allowed.'});}
  try{
    const body=req.body&&typeof req.body==='object'?req.body:{}, user=validateInitData(body.initData);
    const query=typeof body.query==='string'?body.query.trim().slice(0,180):'', category=typeof body.category==='string'?body.category.toUpperCase():'';
    const {data,config}=stores();
    if(category&&!Object.hasOwn(config,category))return res.status(400).json({ok:false,error:'Unknown category.'});
    let results=searchKnowledge(data.items??[],query,{minScore:24,diversify:true});
    if(category)results=results.filter(x=>String(x.category??'').toUpperCase()===category);
    if(!query)results=[...results].sort((a,b)=>Number(b.metadata?.priority??0)-Number(a.metadata?.priority??0));
    return res.status(200).json({ok:true,query,category:category||null,count:results.length,results:results.slice(0,30).map(publicItem)});
  }catch(error){const status=Number.isInteger(error?.status)?error.status:400;if(status>=500)console.error('Mini App search failed:',error);return res.status(status).json({ok:false,error:status>=500?'Search is temporarily unavailable.':error?.message??'Unable to search the Help Desk.'});}
}