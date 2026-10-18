import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, BookOpen, BrainCircuit, Check, ChevronDown, Copy, Database, FileImage, ImagePlus, LoaderCircle, Menu, MessageCircle, MoreHorizontal, Plus, RotateCcw, Search, Sparkles, Square, Trash2, X, Pencil, PanelLeftClose, CircleAlert } from 'lucide-react';
import { datasets } from './data';
import { AgentPicker } from './AgentPicker';
import MedicalAgent from './MedicalAgent';
import { ThemeSwitch } from './ThemeSwitch';
import { useThemePreference } from './theme';
import './styles.css';
import './theme.css';
import './Banner.css';
import { Brand } from './Brand';
import { apiUrl } from './config';

type ModelId = 'base' | 'final';
type ModelStatus = {id:ModelId;label:string;state:'ready'|'offline'|'error';message?:string};
type Status = {state:'ready'|'offline'|'error'; models?:ModelStatus[]; message?:string; control_enabled?:boolean};
type Part = {type:'text';text:string}|{type:'image_url';image_url:{url:string}};
type Message = {id:string;role:'user'|'assistant';content:string|Part[];model?:ModelId;upstream_model?:string;source?:string;error?:string;finish_reason?:string};
type Chat = {id:string;title:string;updated:number;selectedModel?:ModelId;messages:Message[]};
type Draft = {text:string;images:string[]};
const MODEL_LABELS:Record<ModelId,string> = {base:'天府·慧研',final:'天府·慧研 医学版'};
const STORAGE_KEY = 'intern-research-chats-v1';
const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const contentText = (content:Message['content']) => typeof content === 'string' ? content : content.filter(p=>p.type==='text').map(p=>(p as {text:string}).text).join('\n');
function readChats():Chat[] { try { const v = JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]'); return Array.isArray(v) ? v.filter(c=>typeof c.id==='string'&&typeof c.title==='string'&&Array.isArray(c.messages)).slice(0,100) : []; } catch { return []; } }
async function apiError(response:Response) { try { const body=await response.json(); return typeof body.detail==='string'?body.detail:'请求未完成，请稍后重试。'; } catch { return `请求未完成（${response.status}），请稍后重试。`; } }

function App() {
  const theme = useThemePreference();
  const [route,setRoute] = useState(location.pathname);
  const [chats,setChats] = useState<Chat[]>(readChats);
  const [activeId,setActiveId] = useState<string|null>(null);
  const [drafts,setDrafts] = useState<Record<string,Draft>>({});
  const [status,setStatus] = useState<Status>({state:'offline',message:'正在连接模型服务…'});
  const [newModel,setNewModel] = useState<ModelId>('final');
  const [generating,setGenerating] = useState(false);
  const [toast,setToast] = useState('');
  const [agentPickerOpen,setAgentPickerOpen] = useState(()=>new URLSearchParams(location.search).get('agent')==='1');
  const agentTrigger = useRef<HTMLElement|null>(null);
  const [storageIssue,setStorageIssue] = useState(false);
  const [sidebarOpen,setSidebarOpen] = useState(false);
  const [editingChat,setEditingChat] = useState<Chat|null>(null);
  const [deleteChat,setDeleteChat] = useState<Chat|null>(null);
  const [renameValue,setRenameValue] = useState('');
  const [search,setSearch] = useState('');
  const [copied,setCopied] = useState('');
  const controller = useRef<AbortController|null>(null);
  const scrollEnd = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const textInput = useRef<HTMLTextAreaElement>(null);
  const activeChat=chats.find(c=>c.id===activeId);
  const selectedModel=activeChat?.selectedModel || activeChat?.messages.filter(m=>m.role==='assistant').at(-1)?.model || newModel;
  const selectedStatus=status.models?.find(m=>m.id===selectedModel);
  const modelState=selectedStatus?.state || 'offline';
  const modelMessage=selectedStatus?.message || status.message;
  const draftKey=activeId||'new';
  const draft=drafts[draftKey]||{text:'',images:[]};
  const notify=(message:string)=>setToast(message);
  const navigate=(path:string)=>{if(path!==location.pathname){history.pushState({},'',path);setRoute(path);window.scrollTo(0,0);}setSidebarOpen(false);};
  const setDraft=(value:Partial<Draft>)=>setDrafts(old=>({...old,[draftKey]:{...(old[draftKey]||{text:'',images:[]}),...value}}));
  useEffect(()=>{const fn=()=>{setRoute(location.pathname);setAgentPickerOpen(new URLSearchParams(location.search).get('agent')==='1');};window.addEventListener('popstate',fn);return()=>window.removeEventListener('popstate',fn);},[]);
  useEffect(()=>{if(toast){const t=setTimeout(()=>setToast(''),4500);return()=>clearTimeout(t);}},[toast]);
  useEffect(()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify(chats));setStorageIssue(false);}catch{setStorageIssue(true);}},[chats]);
  useEffect(()=>{
    let stopped=false;let request:AbortController|null=null;
    const update=async()=>{if(request)return;const current=new AbortController();request=current;const timeout=setTimeout(()=>current.abort(),8000);try{const response=await fetch(apiUrl('/api/status'),{signal:current.signal});if(!response.ok)throw new Error();const data:Status=await response.json();if(!stopped){setStatus(data);}}catch{if(!stopped)setStatus({state:'offline',message:'暂时无法连接模型服务，请稍后重试。'});}finally{clearTimeout(timeout);request=null;}};
    void update();const timer=setInterval(()=>void update(),4000);return()=>{stopped=true;request?.abort();clearInterval(timer);};
  },[]);
  useEffect(()=>{if(route==='/chat')scrollEnd.current?.scrollIntoView({behavior:generating?'instant':'smooth',block:'end'});},[activeChat?.messages,activeId,route]);
  useEffect(()=>{if(textInput.current){textInput.current.style.height='auto';textInput.current.style.height=`${Math.min(textInput.current.scrollHeight,180)}px`;}},[draft.text,route]);
  const agentClick=(event:React.MouseEvent<HTMLButtonElement>)=>{agentTrigger.current=event.currentTarget;setAgentPickerOpen(true);};
  const closeAgentPicker=()=>{setAgentPickerOpen(false);const url=new URL(location.href);if(url.searchParams.has('agent')){url.searchParams.delete('agent');history.replaceState(history.state,'',url.pathname+url.search+url.hash);}};
  const newChat=()=>{if(generating){notify('请先等待当前回答完成，或停止接收。');return;}setActiveId(null);setSidebarOpen(false);navigate('/chat');textInput.current?.focus();};
  const chooseModel=(model:ModelId)=>{if(generating)return;if(activeId)setChats(old=>old.map(c=>c.id===activeId?{...c,selectedModel:model}:c));else setNewModel(model);};
  const uploadImages=async(files:FileList|null)=>{if(!files)return;const slots=2-draft.images.length;if(slots<=0){notify('每条消息最多添加 2 张图片。');return;}const results:string[]=[];for(const file of Array.from(files).slice(0,slots)){if(!['image/jpeg','image/png','image/webp'].includes(file.type)){notify('请选择 JPG、PNG 或 WebP 图片。');continue;}if(file.size>15*1024*1024){notify('单张图片需小于 15 MB。');continue;}try{const source=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result as string);r.onerror=reject;r.readAsDataURL(file);});const resized=await new Promise<string>((resolve,reject)=>{const img=new Image();img.onload=()=>{const ratio=Math.min(1,1280/Math.max(img.width,img.height));const canvas=document.createElement('canvas');canvas.width=Math.round(img.width*ratio);canvas.height=Math.round(img.height*ratio);const ctx=canvas.getContext('2d');if(!ctx)return reject(new Error());ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);resolve(canvas.toDataURL('image/jpeg',0.87));};img.onerror=reject;img.src=source;});results.push(resized);}catch{notify('这张图片无法读取，请重新选择。');}}setDrafts(old=>({...old,[draftKey]:{...(old[draftKey]||{text:'',images:[]} ),images:[...(old[draftKey]?.images||[]),...results].slice(0,2)}}));if(fileInput.current)fileInput.current.value='';};
  const send=async(regenerate=false)=>{
    if(generating||modelState!=='ready')return;
    if(!regenerate&&!draft.text.trim()&&!draft.images.length)return;
    const chatId=activeId||uid();const replyId=uid();const selected=selectedModel;
    let historyMessages=activeChat?.messages||[];
    if(regenerate){let lastUser=historyMessages.length-1;while(lastUser>=0&&historyMessages[lastUser].role!=='user')lastUser--;if(lastUser<0)return;historyMessages=historyMessages.slice(0,lastUser+1);}
    else{const text=draft.text.trim()||(draft.images.length?'请描述这张图片。':'');const content:Message['content']=draft.images.length?[{type:'text',text},...draft.images.map(url=>({type:'image_url' as const,image_url:{url}}))]:text;historyMessages=[...historyMessages,{id:uid(),role:'user',content}];}
    const outgoing: {role:'user'|'assistant';content:Message['content']}[]=[];let pendingUser:Message|null=null;for(const message of historyMessages){if(message.role==='user')pendingUser=message;else if(pendingUser&&contentText(message.content).trim()){outgoing.push({role:'user',content:pendingUser.content},{role:'assistant',content:message.content});pendingUser=null;}}if(pendingUser)outgoing.push({role:'user',content:pendingUser.content});if(outgoing.length>59)outgoing.splice(0,outgoing.length-59);
    const pending:Message={id:replyId,role:'assistant',content:'',model:selected};
    const newRecord:Chat={id:chatId,title:activeChat?.title||contentText(historyMessages[0].content).slice(0,26)||'图片对话',updated:Date.now(),selectedModel:selected,messages:[...historyMessages,pending]};
    setChats(old=>[newRecord,...old.filter(c=>c.id!==chatId)]);setActiveId(chatId);setGenerating(true);
    if(!regenerate)setDrafts(old=>({...old,[draftKey]:{text:'',images:[]},[chatId]:{text:'',images:[]}}));
    controller.current=new AbortController();
    const editReply=(update:Partial<Message>|((m:Message)=>Partial<Message>))=>setChats(old=>old.map(c=>c.id===chatId?{...c,messages:c.messages.map(m=>m.id===replyId?{...m,...(typeof update==='function'?update(m):update)}:m)}:c));
    let receivedDone=false;
    try{
      const response=await fetch(apiUrl('/api/chat'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:selected,messages:outgoing,max_tokens:1024}),signal:controller.current.signal});
      if(!response.ok)throw new Error(await apiError(response));
      if(!response.body)throw new Error('没有收到模型响应，请重试。');
      const reader=response.body.getReader();const decoder=new TextDecoder();let buffer='';
      const handleEvent=(block:string)=>{let event='message';const values:string[]=[];for(const line of block.split('\n')){if(line.startsWith('event:'))event=line.slice(6).trim();if(line.startsWith('data:'))values.push(line.slice(5).trimStart());}if(!values.length)return;const raw=values.join('\n');if(raw==='[DONE]'){receivedDone=true;return;}let value;try{value=JSON.parse(raw);}catch{return;}if(event==='meta'&&value.model)editReply({model:value.model,upstream_model:value.upstream_model,source:value.source});if(event==='delta'&&typeof value.content==='string')editReply(m=>({content:contentText(m.content)+value.content}));if(event==='done'){receivedDone=true;editReply({finish_reason:value.finish_reason});}if(event==='error')throw new Error(value.message||'模型暂时无法回答，请重试。');};
      while(true){const {value,done}=await reader.read();buffer=(buffer+decoder.decode(value,{stream:!done})).replace(/\r\n/g,'\n');let boundary;while((boundary=buffer.indexOf('\n\n'))!==-1){const block=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);handleEvent(block);}if(done){if(buffer.trim())handleEvent(buffer);break;}}
      if(!receivedDone)editReply({error:'连接已中断，以上内容可能不完整。'});
    }catch(error){if(error instanceof DOMException&&error.name==='AbortError')editReply({error:'已停止接收，以上内容可能不完整。'});else editReply({error:error instanceof Error?error.message:'连接出现问题，请稍后重试。'});}
    finally{setGenerating(false);controller.current=null;}
  };
  const copy=async(m:Message)=>{try{const value=contentText(m.content);let success=false;if(navigator.clipboard&&window.isSecureContext){try{await navigator.clipboard.writeText(value);success=true;}catch{}}if(!success){const field=document.createElement('textarea');field.value=value;field.readOnly=true;field.style.position='fixed';field.style.left='-9999px';document.body.appendChild(field);field.select();try{success=document.execCommand('copy');}finally{field.remove();}}if(!success)throw new Error('copy failed');setCopied(m.id);setTimeout(()=>setCopied(''),1800);}catch{notify('当前连接不支持直接复制，请选择回答文字后复制。');}};
  const link=(path:string,label:string)=><a href={path} className={route===path?'nav-link active':'nav-link'} onClick={e=>{e.preventDefault();navigate(path);}}>{label}</a>;
  const agentPage=route.startsWith('/agent/');
  const statusLabel=generating?'正在回答':({ready:'已就绪',offline:'未连接',error:'服务异常'}[modelState]);
  const canSend=modelState==='ready'&&!generating;
  const lastAssistant=activeChat?.messages.filter(m=>m.role==='assistant').at(-1)?.id;

  return <>
    <header className={`tianfu-banner ${agentPage?'agent-masthead':''}`}>{agentPage?<div className="tianfu-brand"><Brand/><span className="agent-masthead-title">医学知识问答 Agent</span></div>:<a href="/" className="tianfu-brand" onClick={e=>{e.preventDefault();navigate('/');}} aria-label="天府·慧研 首页"><Brand/></a>}{!agentPage&&<nav aria-label="主导航">{link('/','首页')}{link('/chat','天府·慧研')}{link('/data','科学数据中心')}<button className={`nav-link ${route.startsWith('/agent/')||agentPickerOpen?'active':''}`} data-agent-trigger aria-haspopup="dialog" aria-expanded={agentPickerOpen} aria-controls="agent-picker" onClick={agentClick}>智能体广场</button></nav>}<div className="tianfu-banner-actions">{!agentPage&&<span>科学研究平台</span>}<ThemeSwitch preference={theme.preference} resolved={theme.resolved} onChange={theme.choose}/></div></header>
    {route==='/'&&<main className="home-page">
      <div className="home-hero"><div className="eyebrow"><span/> AI FOR SCIENCE</div><h1>天府·慧研<span>科学研究平台</span><span className="title-spark">✳</span></h1><p>从一次提问开始，连接知识、数据与灵感。<br/>让科学研究的每一步，都多一种可能。</p><div className="hero-line"><span/>模型对话 · 科研数据 · 专业智能体<span/></div></div>
      <div className="portal-grid">
        <a className="portal-card portal-chat" href="/chat" onClick={e=>{e.preventDefault();navigate('/chat');}}><div className="portal-card-top"><span className="portal-icon"><MessageCircle size={30}/></span><span className="portal-number">01 / DIALOGUE</span></div><div className="card-graphic chat-graphic"><div/><div/><span>✦</span></div><div className="portal-text"><h2>Chat</h2><h3>与模型，展开对话</h3><p>从文字到影像，让疑问得到回应，<br/>让思考延伸到更远的地方。</p></div><div className="portal-bottom"><span>开启一段对话</span><span className="round-arrow"><ArrowUpRight size={20}/></span></div></a>
        <a className="portal-card portal-data" href="/data" onClick={e=>{e.preventDefault();navigate('/data');}}><div className="portal-card-top"><span className="portal-icon"><Database size={30}/></span><span className="portal-number">02 / KNOWLEDGE</span></div><div className="card-graphic data-graphic">{Array.from({length:12},(_,i)=><span key={i}/>)}</div><div className="portal-text"><h2>Data</h2><h3>每一份数据，都有价值</h3><p>探索医学训练与评测数据，<br/>了解模型能力背后的知识来源。</p></div><div className="portal-bottom"><span>探索医学数据集</span><span className="round-arrow"><ArrowUpRight size={20}/></span></div></a>
        <button className="portal-card portal-agent" data-agent-trigger aria-haspopup="dialog" aria-expanded={agentPickerOpen} aria-controls="agent-picker" onClick={agentClick}><div className="portal-card-top"><span className="portal-icon"><BrainCircuit size={30}/></span><span className="portal-number">03 / INTELLIGENCE</span></div><div className="card-graphic agent-graphic"><span/><span/><span/><i>✧</i></div><div className="portal-text"><h2>Agent</h2><h3>让智能，走近研究</h3><p>连接专业知识与研究任务，<br/>探索智能协作的更多可能。</p></div><div className="portal-bottom"><span>探索智能体</span><span className="round-arrow"><ArrowUpRight size={20}/></span></div></button>
      </div><footer className="home-footer"><span>BUILT FOR CURIOSITY. DESIGNED FOR RESEARCH.</span><span>人工智能驱动科学研究</span></footer>
    </main>}
    {route==='/data'&&<main className="data-page"><div className="page-breadcrumb"><a href="/" onClick={e=>{e.preventDefault();navigate('/');}}><ArrowLeft size={15}/> 返回首页</a><span>研究资源 / DATA</span></div><section className="data-heading"><div><div className="eyebrow">THE FOUNDATION OF KNOWLEDGE</div><h1>医学数据集<span>。</span></h1><p>从影像理解到临床推理，探索模型背后的知识来源。</p></div><div className="data-stat"><strong>06</strong><span>精选医学数据集<br/>多模态 · 专业领域</span></div></section><div className="data-toolbar"><span><Database size={16}/> 全部数据集 <b>6</b></span></div><div className="dataset-grid">{datasets.map((dataset,i)=><article className={`dataset-card tone-${dataset.color}`} key={dataset.name}><div className="dataset-top"><span className="dataset-icon">{i===2||i===4?<BookOpen size={21}/>:<FileImage size={21}/>}</span><span className="dataset-type">{dataset.type}</span></div><h2>{dataset.name}</h2><h3>{dataset.subtitle}</h3><p className="dataset-description">{dataset.description}</p><div className="dataset-metrics">{dataset.metrics.map(m=><div key={m.label}><strong>{m.value}</strong><span>{m.label}</span></div>)}</div><p className="dataset-note">{dataset.note}</p><a href={dataset.source} target="_blank" rel="noreferrer" className="dataset-source">数据来源 <ArrowUpRight size={16}/></a></article>)}</div><footer className="home-footer"><span>DATA INSPIRES DISCOVERY.</span></footer></main>}
    {route==='/chat'&&<div className="chat-layout">
      {sidebarOpen&&<div className="sidebar-scrim" onClick={()=>setSidebarOpen(false)}/>}
      <aside className={`chat-sidebar ${sidebarOpen?'open':''}`}><button className="sidebar-mobile-close icon-button" aria-label="收起侧栏" onClick={()=>setSidebarOpen(false)}><PanelLeftClose size={19}/></button><button className="new-chat-button" onClick={newChat}><Plus size={18}/>新建对话<span>＋</span></button><label className="chat-search"><Search size={15}/><input aria-label="搜索对话" placeholder="搜索对话" value={search} onChange={e=>setSearch(e.target.value)}/></label><div className="history-label">最近对话 <span>{chats.length||''}</span></div><div className="history-list">{chats.filter(c=>c.title.toLowerCase().includes(search.toLowerCase())).map(chat=><div key={chat.id} className={`history-item ${chat.id===activeId?'selected':''}`}><button className="history-select" onClick={()=>{if(generating&&chat.id!==activeId){notify('请先等待回答完成，或停止接收。');return;}setActiveId(chat.id);setSidebarOpen(false);}}><MessageCircle size={15}/><span>{chat.title}</span></button><details className="history-menu"><summary aria-label={`管理 ${chat.title}`}><MoreHorizontal size={17}/></summary><div><button onClick={()=>{setEditingChat(chat);setRenameValue(chat.title);}}><Pencil size={13}/>重命名</button><button disabled={generating} onClick={()=>setDeleteChat(chat)}><Trash2 size={13}/>删除</button></div></details></div>)}{chats.length===0&&<p className="empty-history">从一个问题开始，<br/>你的探索会保存在这里。</p>}</div><div className="sidebar-bottom"><a href="/" onClick={e=>{e.preventDefault();navigate('/');}}><ArrowLeft size={17}/><span>返回首页</span></a><p><span className="local-dot"/>对话保存在当前浏览器</p></div></aside>
      <main className="chat-main"><header className="chat-header"><div><button className="mobile-menu icon-button" aria-label="展开会话侧栏" onClick={()=>setSidebarOpen(true)}><Menu size={21}/></button><span className="chat-title">{activeChat?.title||'新对话'}</span><span className="chat-header-divider"/><span className="chat-label">Chat</span></div><div className={`model-status state-${modelState}`} title={modelMessage}>{generating?<LoaderCircle size={13} className="spinning"/>:<span/>}{statusLabel}</div></header>
      <div className="conversation-scroll">{(!activeChat||activeChat.messages.length===0)?<div className="chat-welcome"><div className="welcome-symbol"><Sparkles size={29}/></div><div className="eyebrow">A SPACE FOR YOUR CURIOSITY</div><h1>今天，想探索什么？</h1><p>与天府·慧研一起，探索科学问题与研究思路。</p><div className="suggestion-grid"><button onClick={()=>{setDraft({text:'请用通俗的语言解释什么是 AI for Science，以及人工智能如何辅助科学研究。'});textInput.current?.focus();}}><BookOpen size={18}/><span>理解一个概念<small>把复杂的科学概念讲清楚</small></span><ArrowUpRight size={15}/></button><button onClick={()=>fileInput.current?.click()}><FileImage size={18}/><span>探索一张影像<small>上传图片，开始视觉问答</small></span><ArrowUpRight size={15}/></button></div></div>:<div className="messages">{activeChat.messages.map(message=><article key={message.id} className={`message message-${message.role}`}><div className="message-avatar">{message.role==='assistant'?<Sparkles size={18}/>:<span>你</span>}</div><div className="message-body"><div className="message-author">{message.role==='assistant'?MODEL_LABELS[message.model||selectedModel]:'你'}</div>{Array.isArray(message.content)&&<div className="message-images">{message.content.filter(p=>p.type==='image_url').map((p,i)=><a href={(p as {image_url:{url:string}}).image_url.url} key={i} target="_blank" rel="noreferrer"><img src={(p as {image_url:{url:string}}).image_url.url} alt={`上传的图片 ${i+1}`}/></a>)}</div>}{contentText(message.content)?<div className={message.role==='assistant'?'markdown':'user-text'}>{message.role==='assistant'?<ReactMarkdown remarkPlugins={[remarkGfm]} components={{a:({children,...props})=><a {...props} target="_blank" rel="noreferrer">{children}</a>}}>{contentText(message.content)}</ReactMarkdown>:contentText(message.content)}</div>:generating&&message.id===lastAssistant?<div className="thinking"><span/><span/><span/><small>正在思考你的问题</small></div>:null}{message.error&&<p className="message-error"><CircleAlert size={14}/>{message.error}</p>}{message.finish_reason==='length'&&<p className="message-notice">回答达到长度上限，可继续提问“请继续”。</p>}{message.role==='assistant'&&(contentText(message.content)||message.error)&&<div className="message-actions">{contentText(message.content)&&<button aria-label="复制回答" title="复制回答" onClick={()=>void copy(message)}>{copied===message.id?<Check size={15}/>:<Copy size={15}/>}</button>}{message.id===lastAssistant&&<button aria-label="重新生成" title="重新生成" disabled={!canSend} onClick={()=>void send(true)}><RotateCcw size={15}/></button>}</div>}</div></article>)}<div ref={scrollEnd}/></div>}</div>
      <div className="composer-area">{modelState!=='ready'&&!generating&&<div className="service-banner"><div><CircleAlert size={16}/><span>{modelMessage||'所选模型暂不可用。'}</span></div></div>}<form className="composer" onSubmit={e=>{e.preventDefault();void send();}}>{draft.images.length>0&&<div className="draft-images">{draft.images.map((src,i)=><div key={i}><img src={src} alt={`待发送图片 ${i+1}`}/><button type="button" aria-label={`移除图片 ${i+1}`} onClick={()=>setDraft({images:draft.images.filter((_,index)=>index!==i)})}><X size={13}/></button></div>)}</div>}<textarea ref={textInput} aria-label="输入问题" placeholder="输入问题，或上传一张图片…" rows={2} value={draft.text} onChange={e=>setDraft({text:e.target.value})} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send();}}}/><div className="composer-tools"><div><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={e=>void uploadImages(e.target.files)}/><button type="button" className="attach-button" aria-label="上传图片" title="上传公开教学或演示图片，最多 2 张" onClick={()=>fileInput.current?.click()}><ImagePlus size={19}/></button><span className="tool-divider"/><label className="model-select"><span className="model-dot"/><select aria-label="选择模型" value={selectedModel} disabled={generating} onChange={e=>chooseModel(e.target.value as ModelId)}><option value="base">天府·慧研</option><option value="final">天府·慧研 医学版</option></select><ChevronDown size={13}/></label></div>{generating?<button className="stop-button" type="button" onClick={()=>controller.current?.abort()}><Square size={12} fill="currentColor"/>停止接收</button>:<button type="submit" className="send-button" disabled={!canSend||(!draft.text.trim()&&!draft.images.length)} aria-label="发送消息"><ArrowUp size={21}/></button>}</div></form><div className="composer-footer">{storageIssue&&<span>浏览器存储空间不足，新内容尚未保存；可删除旧会话释放空间。</span>}<span>Enter 发送 · Shift + Enter 换行</span></div></div>
      </main></div>}
    {(route==='/agent/medical/'||route==='/agent/medical')&&<MedicalAgent/>}
    {!['/','/chat','/data','/agent/medical/','/agent/medical'].includes(route)&&<main className="not-found"><h1>这个页面还没有开始探索</h1><button className="primary-button" onClick={()=>navigate('/')}>返回首页 <ArrowRight size={16}/></button></main>}
    {toast&&<div className="toast" role="status"><CircleAlert size={17}/><span>{toast}</span><button aria-label="关闭提示" onClick={()=>setToast('')}><X size={15}/></button></div>}
    {editingChat&&<div className="modal-backdrop"><form className="modal" onSubmit={e=>{e.preventDefault();if(!renameValue.trim())return;setChats(old=>old.map(c=>c.id===editingChat.id?{...c,title:renameValue.trim().slice(0,60)}:c));setEditingChat(null);}}><h2>重命名对话</h2><input className="rename-input" autoFocus maxLength={60} aria-label="对话名称" value={renameValue} onChange={e=>setRenameValue(e.target.value)}/><div className="modal-actions"><button type="button" className="secondary-button" onClick={()=>setEditingChat(null)}>取消</button><button className="primary-button" disabled={!renameValue.trim()}>保存</button></div></form></div>}
    {deleteChat&&<div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true"><h2>删除这段对话？</h2><p>“{deleteChat.title}”将从当前浏览器中删除。</p><div className="modal-actions"><button className="secondary-button" onClick={()=>setDeleteChat(null)}>取消</button><button className="danger-button" onClick={()=>{setChats(old=>old.filter(c=>c.id!==deleteChat.id));if(activeId===deleteChat.id)setActiveId(null);setDeleteChat(null);}}>删除对话</button></div></section></div>}
    {agentPickerOpen&&<AgentPicker onClose={closeAgentPicker} returnFocus={agentTrigger.current}/>}
  </>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
