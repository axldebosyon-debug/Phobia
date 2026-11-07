"use strict";
const fs=require("fs"),path=require("path");
const settingsPath=process.env.BOT_SETTINGS_PATH?path.resolve(process.env.BOT_SETTINGS_PATH):path.join(process.env.DATA_DIR?path.resolve(process.env.DATA_DIR):__dirname,"bot-settings.json");
const DEFAULTS={reaction:{enabled:true,emoji:"😆",target:"bot_replies",probability:100,cooldownSeconds:0},groups:{}};
const reactionCooldowns=new Map();
function clamp(v,min,max,fallback){const n=Number(v);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;}
function validTime(v){return typeof v==="string"&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v);}
function sanitizeReaction(i={}){return {enabled:i.enabled!==false,emoji:String(i.emoji??"😆").trim().slice(0,16)||"😆",target:["bot_replies","incoming_messages","both"].includes(i.target)?i.target:"bot_replies",probability:clamp(i.probability,0,100,100),cooldownSeconds:clamp(i.cooldownSeconds,0,86400,0)};}
const envBool=(v,f)=>v==null||v===""?f:/^(1|true|yes|on)$/i.test(String(v));
function sanitizeGlobal(i={}){return {commandsEnabled:i.commandsEnabled!==false,defaultOn:i.defaultOn==null?envBool(process.env.BANAT_DEFAULT_ON,false):i.defaultOn===true,sendLimit:Math.round(clamp(i.sendLimit??process.env.BANAT_GLOBAL_SEND_LIMIT,1,10,2)),threadCooldownMs:Math.round(clamp(i.threadCooldownMs??process.env.BANAT_THREAD_COOLDOWN_MS,0,300000,2500)),typoRate:clamp(i.typoRate??process.env.BANAT_TYPO_RATE,0,0.5,0.02),shorthandRate:clamp(i.shorthandRate??process.env.BANAT_SHORTHAND_RATE,0,1,0.08),hesitationRate:clamp(i.hesitationRate??process.env.BANAT_HESITATION_RATE,0,0.35,0.11)};}
function sanitizeGroup(i={}){return {banatMode:["inherit","on","off"].includes(i.banatMode)?i.banatMode:"inherit",typingEnabled:i.typingEnabled!==false,replyDelayMs:i.replyDelayMs==null||i.replyDelayMs===""?null:clamp(i.replyDelayMs,0,30000,0),cooldownMs:i.cooldownMs==null||i.cooldownMs===""?null:clamp(i.cooldownMs,0,300000,0),quietStart:validTime(i.quietStart)?i.quietStart:"",quietEnd:validTime(i.quietEnd)?i.quietEnd:""};}
function load(){try{const p=JSON.parse(fs.readFileSync(settingsPath,"utf8"));const groups={};for(const [id,g] of Object.entries(p.groups||{}).slice(0,500))groups[String(id).slice(0,128)]=sanitizeGroup(g);return {reaction:sanitizeReaction(p.reaction),global:sanitizeGlobal(p.global),groups};}catch(_){return {reaction:{...DEFAULTS.reaction},global:sanitizeGlobal({}),groups:{}};}}
let settings=load();
function persist(){try{fs.mkdirSync(path.dirname(settingsPath),{recursive:true});fs.writeFileSync(settingsPath,JSON.stringify(settings,null,2)+"\n",{mode:0o600});return true;}catch(e){console.error("[SETTINGS] Could not save settings:",e.message||e);return false;}}
function getSettings(){return JSON.parse(JSON.stringify(settings));}
function getReactionSettings(){return {...settings.reaction};}
function getGroupSettings(id){return {...sanitizeGroup(settings.groups[String(id)]||{})};}
function getGlobalSettings(){return {...sanitizeGlobal(settings.global||{})};}
function updateGlobal(input){settings.global=sanitizeGlobal({...settings.global,...input});if(!persist())throw Error("Settings could not be saved to disk.");return getGlobalSettings();}
function updateReaction(input){settings.reaction=sanitizeReaction({...settings.reaction,...input});if(!persist())throw Error("Settings could not be saved to disk.");return getReactionSettings();}
function updateGroup(id,input){id=String(id||"").trim();if(!id||id.length>128)throw Error("A valid group thread ID is required.");settings.groups[id]=sanitizeGroup({...settings.groups[id],...input});if(!persist())throw Error("Settings could not be saved to disk.");return {threadID:id,...getGroupSettings(id)};}
function isQuietNow(g,now=new Date()){if(!g?.quietStart||!g?.quietEnd||g.quietStart===g.quietEnd)return false;const p=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Manila",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(now).split(":").map(Number),cur=p[0]*60+p[1],[sh,sm]=g.quietStart.split(":").map(Number),[eh,em]=g.quietEnd.split(":").map(Number),s=sh*60+sm,e=eh*60+em;return s<e?cur>=s&&cur<e:cur>=s||cur<e;}
function shouldReact(threadID,target){const c=settings.reaction;if(!c.enabled||(c.target!=="both"&&c.target!==target))return false;const key=String(threadID),now=Date.now(),cd=c.cooldownSeconds*1000;if(cd&&now-Number(reactionCooldowns.get(key)||0)<cd)return false;if(Math.random()*100>=c.probability)return false;reactionCooldowns.set(key,now);return true;}
module.exports={getGlobalSettings,updateGlobal,getSettings,getReactionSettings,getGroupSettings,updateReaction,updateGroup,isQuietNow,shouldReact,settingsPath};
