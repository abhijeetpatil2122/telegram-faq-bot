import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { searchKnowledge } from '../scripts/search-engine.mjs';

const DATA=path.join(process.cwd(),'data/knowledge.json');
const CATEGORIES=path.join(process.cwd(),'config/categories.json');
const MAX_AGE=86400;
let cachedKnowledge=null;
let cachedCategories=null;
function stores(){
  if(!cachedKnowledge)cachedKnowledge=JSON.parse(fs.readFileSync(DATA,'utf8'));
  if(!cachedCategories)cachedCategories=JSON.parse(fs.readFileSync(CATEGORIES,'utf8'));
  return {data:cachedKnowledge,config:cachedCategories};
}
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

function htmlEscape(value=''){return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&apos;");}
function shareUrl(value){try{const url=new URL(String(value||''));return ['https:','http:'].includes(url.protocol)?url.href:null}catch{return null}}
function promoteExternalLinks(html){
  const parts=String(html??'').split(/(<table\b[\s\S]*?<\/table>)/gi);
  return parts.map(part=>{
    if(/^<table\b/i.test(part))return part;
    return part.replace(/<a\b([^>]*?)\bhref=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi,(match,before,href,after,labelHtml)=>{
      const url=shareUrl(href);if(!url)return match;
      const label=String(labelHtml).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()||'Open link';
      return '<tg-button type="url" style="primary" url="'+htmlEscape(url)+'">'+htmlEscape(label)+'</tg-button>';
    });
  }).join('');
}
function preparedAnswerHtml(item){
  const title=String(item.question??item.title??'Telegram documentation');
  const category=item.category?'<blockquote><b>Category:</b> '+htmlEscape(String(item.category).replaceAll('_',' ').toLowerCase())+'</blockquote>':'';
  const answer=promoteExternalLinks(String(item.answer_html??'').trim()||'<p>'+htmlEscape(item.answer??'No answer text is available for this entry.')+'</p>');
  const sourceTitle=String(item.source?.title??'Official Telegram source');
  const source=shareUrl(item.source?.url);
  const sourceMarkup=source?'<footer>Source: <tg-button type="url" style="primary" url="'+htmlEscape(source)+'">'+htmlEscape(sourceTitle)+'</tg-button></footer>':'<footer>Source: '+htmlEscape(sourceTitle)+'</footer>';
  let html='<h2>❓ '+htmlEscape(title)+'</h2>'+category+'<details><summary>Answer</summary>'+answer+'</details><hr/>'+sourceMarkup;
  if(Buffer.byteLength(html,'utf8')>32768){
    const plain=String(item.answer??'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
    const clipped=Buffer.from(plain).subarray(0,28500).toString('utf8');
    html='<h2>'+htmlEscape(title)+'</h2><p>'+htmlEscape(clipped)+'</p>'+sourceMarkup;
  }
  return html;
}
async function savePreparedAnswer(user,item){
  const token=process.env.BOT_TOKEN;
  const result={type:'article',id:'faq-share-'+crypto.createHash('sha256').update(String(item.id??item.question??item.title)).digest('hex').slice(0,32),title:String(item.question??item.title??'Telegram documentation').slice(0,256),description:String((item.source?.title??'Official Telegram source')+' · '+(item.category??'Telegram help')).slice(0,255),input_message_content:{rich_message:{html:preparedAnswerHtml(item)}}};
  const response=await fetch('https://api.telegram.org/bot'+token+'/savePreparedInlineMessage',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({user_id:user.id,result,allow_user_chats:true,allow_group_chats:true,allow_channel_chats:true})});
  const data=await response.json().catch(()=>null);
  if(!response.ok||!data?.ok||typeof data.result?.id!=='string')throw Object.assign(new Error('Telegram could not prepare this answer for sharing.'),{status:502});
  return {id:data.result.id,expiration_date:Number(data.result.expiration_date)||null};
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
    const {data,config}=stores();
    if(body.action==='prepare-share'){
      const itemId=typeof body.itemId==='string'?body.itemId.slice(0,160):'';
      const item=(data.items??[]).find(entry=>String(entry.id??'')===itemId);
      if(!item)return res.status(404).json({ok:false,error:'This FAQ entry is no longer available.'});
      const prepared=await savePreparedAnswer(user,item);
      return res.status(200).json({ok:true,prepared_message_id:prepared.id,expiration_date:prepared.expiration_date});
    }
    const query=typeof body.query==='string'?body.query.trim().slice(0,180):'', category=typeof body.category==='string'?body.category.toUpperCase():'';
    if(category&&!Object.hasOwn(config,category))return res.status(400).json({ok:false,error:'Unknown category.'});
    let results=searchKnowledge(data.items??[],query,{minScore:24,diversify:true});
    if(category)results=results.filter(x=>String(x.category??'').toUpperCase()===category);
    if(!query)results=[...results].sort((a,b)=>Number(b.metadata?.priority??0)-Number(a.metadata?.priority??0));
    return res.status(200).json({ok:true,query,category:category||null,count:results.length,results:results.slice(0,30).map(publicItem)});
  }catch(error){const status=Number.isInteger(error?.status)?error.status:400;if(status>=500)console.error('Mini App search failed:',error);return res.status(status).json({ok:false,error:status>=500?'Search is temporarily unavailable.':error?.message??'Unable to search the Help Desk.'});}
}