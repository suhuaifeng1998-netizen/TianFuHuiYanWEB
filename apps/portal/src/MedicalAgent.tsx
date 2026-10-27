import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowRight, ArrowUpRight, BookOpen, Check, ChevronDown, CircleAlert, Compass, Copy, FileText, HeartPulse, LoaderCircle, MapPin, Plus, RefreshCw, Search, Sparkles, Square } from 'lucide-react';
import './MedicalAgent.css';
import { hasEnglishProse, publisherDisplayName, safeRevealPrefix, sourceDisplayExcerpt, sourceDisplayTitle } from './medicalPresentation';
import { apiUrl } from './config';

type Question = { id: string; text: string; topic: string; source_ids: string[]; short_title?: string; scenario_id?: string };
type Source = { id: string; title: string; url: string; publisher?: string; topic?: string; published_at?: string; section?: string; excerpt?: string; language?: string; retrieved_at?: string; jurisdiction_note?: string; regions?: string[]; regional_topic?: string; source_kind?: string; evidence_role?: string; dataset_subset?: string; dataset_split?: string; dataset_row?: number; dataset_revision?: string; date_note?: string; text_note?: string };
type ComparisonPoint = { claim: string; evidence: { source_id: string; quote: string; publisher: string; origin_group: string }[] };
type Comparison = { state: 'complete' | 'single_publisher' | 'unavailable'; common_points: ComparisonPoint[]; differences: ComparisonPoint[]; complementary_points?: ComparisonPoint[]; overview: { publisher_groups: number; publishers: string[] }; note: string };
type Meta = { answer_id: string; root_id: string; parent_answer_id?: string | null; depth: number; max_depth: number; question: string; topic?: string; sources: Source[]; evidence_status: 'found' | 'insufficient'; answer_mode?: 'grounded' | 'general_knowledge' | 'out_of_scope' | 'clarify'; comparison?: Comparison };
type Answer = { key: string; question: string; text: string; parent: string | null; meta?: Meta; state: 'loading' | 'complete' | 'failed'; error?: string; stopped?: boolean };
type Service = { state: 'ready' | 'offline'; model: string; message?: string; knowledge?: { version: string; sources: number; reference_sources_total?: number; questions: number; topics: number | string[]; regional_topics?: string[]; research_qa?: { answer_records: number; consultation_records: number } } };
type QuestionResult = { questions: Question[]; can_followup?: boolean; message?: string; regional_topics?: string[]; featured_questions?: Question[] };
type Saved = { session: string; answers: Answer[]; active: string | null };
const STORAGE = 'ai4s-medical-workbench-v1';
const NO_REFERENCE_NOTE = '本次未匹配到知识库资料，以下为 天府·慧研 的一般医学知识解答，无资料引用。';
const RESEARCH_NOTE = '资料说明：本次引用包含华佗历史研究问答，原始医学出处和审核日期未逐条核实，不作为现行诊疗指南。';
function displayAnswer(answer: Answer) {
  const legacyNote = NO_REFERENCE_NOTE.replace('天府·慧研', 'intern s2');
  let text = answer.text.trimStart();
  for (const note of [NO_REFERENCE_NOTE, legacyNote, RESEARCH_NOTE]) {
    if (text.startsWith(note)) text = text.slice(note.length).trimStart();
  }
  if (answer.meta?.answer_mode === 'out_of_scope') {
    text = text.replace('模型选型、系统搭建及其他非医学问题，请移步通用聊天。', '').trimEnd();
  }
  if (hasEnglishProse(text)) return '这条历史答复包含外文内容，请重新回答以获取中文解答。';
  return text;
}
const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
function restore(): Saved {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE) || 'null');
    if (data && typeof data.session === 'string' && Array.isArray(data.answers)) {
      const answers = data.answers.filter((a: Answer) => typeof a.key === 'string' && typeof a.question === 'string' && typeof a.text === 'string').slice(-24).map((a: Answer) => a.state === 'loading' ? { ...a, state: 'failed', error: '上次回答已中断，请重试。' } : a);
      return { session: data.session, answers, active: data.active };
    }
  } catch { /* Storage may be disabled. The workbench remains usable. */ }
  return { session: uid(), answers: [], active: null };
}
async function failure(response: Response) {
  try {
    const body = await response.json();
    return typeof body.detail === 'string' ? body.detail : typeof body.message === 'string' ? body.message : `请求失败（${response.status}）`;
  } catch { return `请求失败（${response.status}），请稍后重试。`; }
}
class MedicalApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
async function jsonRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 45000);
  try {
    const response = await fetch(apiUrl(url), { ...init, signal: abort.signal });
    if (!response.ok) throw new MedicalApiError(await failure(response), response.status);
    return await response.json();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('请求超时，请点击重试。');
    throw error;
  } finally { clearTimeout(timeout); }
}
const readableError = (error: unknown) => error instanceof TypeError ? '网络连接失败，请检查连接后重试。' : error instanceof Error ? error.message : '请求未完成，请重试。';
const safeLink = (url: string) => /^https?:\/\//i.test(url) ? url : undefined;
const sectionLabel = (section?: string) => section === 'Health topic summary' ? '健康主题摘要' : section === 'Medical test article (references excluded)' ? '医学检查资料' : /[\u3400-\u9fff]/.test(section || '') ? section : undefined;
function readableCitations(text: string, sources: Source[] = [], linked = false) {
  return text.replace(/\[(?:资料\s*(?:ID|编号)?\s*[:：]\s*)?([a-zA-Z0-9_-]+)\s*\](?!\()/g, (original, id) => {
    const sourceIndex = sources.findIndex(source => source.id === id);
    const index = sourceIndex >= 0 ? sourceIndex : /^\d+$/.test(id) && Number(id) > 0 && Number(id) <= sources.length ? Number(id) - 1 : -1;
    return index >= 0 ? linked ? `[${index + 1}](#med-source-${index + 1})` : `[${index + 1}]` : original;
  });
}

export default function MedicalAgent() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = '医学知识问答 · 天府·慧研';
    return () => { document.title = previousTitle; };
  }, []);
  const [initial] = useState(restore);
  const [session] = useState(initial.session);
  const [answers, setAnswers] = useState<Answer[]>(initial.answers);
  const [active, setActive] = useState<string | null>(initial.active);
  const [draft, setDraft] = useState('');
  const [service, setService] = useState<Service | null>(null);
  const [statusError, setStatusError] = useState('');
  const [statusLoading, setStatusLoading] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [regionalTopics, setRegionalTopics] = useState<string[]>([]);
  const [selectedRegionalTopic, setSelectedRegionalTopic] = useState('');
  const [questionMode, setQuestionMode] = useState<'random' | 'related'>('random');
  const [questionLoading, setQuestionLoading] = useState(true);
  const [questionError, setQuestionError] = useState('');
  const [questionNotice, setQuestionNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [expired, setExpired] = useState(false);
  const [resumableId, setResumableId] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(false);
  const [sessionCheckError, setSessionCheckError] = useState('');
  const [revealAnswerKey, setRevealAnswerKey] = useState<string | null>(null);
  const [presentedText, setPresentedText] = useState('');
  const revealPosition = useRef({ key: '', length: 0 });
  const controller = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const historySeen = useRef<string[]>([]);
  const followupSeen = useRef<Record<string, string[]>>({});
  const mounted = useRef(true);
  const input = useRef<HTMLTextAreaElement>(null);
  const answerPanel = useRef<HTMLElement>(null);
  const regionalPanel = useRef<HTMLDetailsElement>(null);
  const current = answers.find(a => a.key === active);
  const scopeRedirect = current?.meta?.answer_mode === 'out_of_scope' || current?.meta?.answer_mode === 'clarify';
  const canContinue = current?.state === 'complete' && !!current.meta && current.meta.depth < 3 && !expired && !scopeRedirect && !checkingSession && resumableId === current.meta.answer_id;
  const limit = current?.state === 'complete' && (current.meta?.depth ?? 0) >= 3;
  const legacyUnreferenced = current?.meta?.evidence_status === 'insufficient' && !current.meta.answer_mode;
  const legacyEnglish = !!current && hasEnglishProse(current.text);
  const finalText = current?.state === 'complete' ? displayAnswer(current) : '';
  const visibleText = current?.key === revealAnswerKey ? presentedText : finalText;
  const isWriting = !!current && current.key === revealAnswerKey && visibleText !== finalText;
  const completedCount = answers.filter(a => a.state === 'complete').length;

  useEffect(() => {
    if (!current || current.key !== revealAnswerKey) return;
    if (revealPosition.current.key !== current.key) revealPosition.current = { key: current.key, length: 0 };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { revealPosition.current.length = finalText.length; setPresentedText(finalText); return; }
    let frame = 0;
    let previous = performance.now();
    const speed = Math.max(85, finalText.length / 4.5);
    const tick = (now: number) => {
      revealPosition.current.length = Math.min(finalText.length, revealPosition.current.length + Math.min(64, Math.max(0, now - previous)) * speed / 1000);
      previous = now;
      setPresentedText(safeRevealPrefix(finalText, revealPosition.current.length));
      if (revealPosition.current.length < finalText.length) frame = requestAnimationFrame(tick);
    };
    if (finalText) frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [current?.key, finalText, revealAnswerKey]);

  async function loadStatus() {
    setStatusLoading(true);
    try { const result = await jsonRequest<Service>('/api/medical/status'); if (mounted.current) { setService(result); setStatusError(''); if (Array.isArray(result.knowledge?.regional_topics)) setRegionalTopics(result.knowledge.regional_topics); } }
    catch (error) { if (mounted.current) setStatusError(readableError(error)); }
    finally { if (mounted.current) setStatusLoading(false); }
  }
  async function loadQuestions(answer?: Answer, shuffle = false, regionalTopic = selectedRegionalTopic) {
    const request = ++requestId.current;
    setQuestionLoading(true); setQuestionError(''); setQuestionNotice(''); setQuestions([]);
    setResumableId(null); setSessionCheckError('');
    if (answer?.meta?.answer_mode === 'out_of_scope' || answer?.meta?.answer_mode === 'clarify') {
      setCheckingSession(false); setQuestionMode('related'); setQuestionLoading(false);
      setQuestionNotice('请在输入框直接提出新的医学或健康问题。');
      return;
    }
    const currentRequest = () => mounted.current && request === requestId.current;
    let related = false;
    if (answer?.state === 'complete' && answer.meta) {
      setCheckingSession(true); setExpired(false);
      try {
        const result = await jsonRequest<{ available_answer_ids: string[] }>('/api/medical/session/check', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: session, answer_ids: [answer.meta.answer_id] }),
        });
        if (!currentRequest()) return;
        const available = result.available_answer_ids.includes(answer.meta.answer_id);
        setExpired(!available);
        if (available) setResumableId(answer.meta.answer_id);
        related = available && answer.meta.depth < 3;
      } catch (error) {
        if (!currentRequest()) return;
        if (error instanceof MedicalApiError && error.status === 404) setExpired(true);
        else setSessionCheckError('暂时无法连接历史问答。仍可阅读记录，或重新询问本题。');
      } finally { if (currentRequest()) setCheckingSession(false); }
    } else setCheckingSession(false);
    if (!currentRequest()) return;
    setQuestionMode(related ? 'related' : 'random');
    if (related) setSelectedRegionalTopic('');
    const rootQuestions = async () => {
      const params = new URLSearchParams();
      if (shuffle) params.set('exclude', historySeen.current.slice(-30).join(','));
      if (regionalTopic) params.set('regional_topic', regionalTopic);
      params.set('sichuan_only', 'true');
      const result = await jsonRequest<QuestionResult>(`/api/medical/questions?${params}`);
      if (!shuffle && !regionalTopic && result.featured_questions?.length) result.questions = result.featured_questions;
      historySeen.current = [...new Set([...historySeen.current, ...result.questions.map(q => q.id)])].slice(-40);
      return result;
    };
    try {
      let result: QuestionResult;
      if (related) {
        const answerId = answer!.meta!.answer_id;
        try {
          result = await jsonRequest('/api/medical/followups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: session, answer_id: answerId, exclude: shuffle ? followupSeen.current[answerId] || [] : [] }) });
          const shown = result.questions.map(q => q.id); followupSeen.current[answerId] = [...(followupSeen.current[answerId] || []).filter(id => !shown.includes(id)), ...shown].slice(-40);
        } catch (error) {
          if (!currentRequest()) return;
          if (!(error instanceof MedicalApiError) || ![404,409].includes(error.status)) throw error;
          setExpired(true); setResumableId(null); setQuestionMode('random'); related = false;
          result = await rootQuestions();
        }
      } else result = await rootQuestions();
      if (currentRequest()) {
        if (Array.isArray(result.regional_topics)) setRegionalTopics(result.regional_topics);
        setQuestions(result.questions.slice(0, 5));
        if (!result.questions.length) setQuestionNotice(related ? '暂时没有与当前问题直接相关的推荐，可在输入框继续追问。' : '可在输入框提出你的医学问题。');
      }
    } catch (error) { if (currentRequest()) { setQuestions([]); setQuestionError(readableError(error)); } }
    finally { if (currentRequest()) setQuestionLoading(false); }
  }
  useEffect(() => {
    mounted.current = true;
    void loadStatus();
    void loadQuestions(initial.answers.find(a => a.key === initial.active));
    return () => { mounted.current = false; controller.current?.abort(); requestId.current++; };
  }, []);
  useEffect(() => {
    try { localStorage.setItem(STORAGE, JSON.stringify({ session, answers: answers.slice(-24), active })); setStorageError(false); }
    catch { setStorageError(true); }
  }, [session, answers, active]);

  function newTopic(regionalTopic = '') {
    if (controller.current) return;
    if (regionalPanel.current) regionalPanel.current.open = false;
    setActive(null); setRevealAnswerKey(null); setDraft(''); setExpired(false); setCopied(false); setSelectedRegionalTopic(regionalTopic);
    // Root questions do not depend on server ancestry, including after a restart.
    void loadQuestions(undefined, false, regionalTopic);
    input.current?.focus();
  }
  function selectAnswer(answer: Answer) {
    if (controller.current) return;
    setActive(answer.key); setRevealAnswerKey(null); setExpired(false); setCopied(false); setDraft(''); setSelectedRegionalTopic('');
    void loadQuestions(answer, false, '');
  }
  function prepareReask(answer: Answer) {
    const prior: string[] = []; let cursor = answer.parent;
    while (cursor && prior.length < 3) {
      const item = answers.find(value => value.meta?.answer_id === cursor);
      if (!item) break; prior.unshift(item.question); cursor = item.parent;
    }
    setDraft([...prior, answer.question].join('\n补充问题：').slice(0, 2000));
    setExpired(false); setResumableId(null); setActive(null); setSessionCheckError('');
    void loadQuestions(); input.current?.focus();
  }
  async function ask(text: string, parent: string | null = null, retryKey?: string) {
    const question = text.trim();
    if (!question || controller.current || checkingSession || question.length > 2000) return;
    const key = retryKey || uid();
    const abort = new AbortController();
    controller.current = abort;
    revealPosition.current = { key, length: 0 }; setPresentedText(''); setRevealAnswerKey(key);
    setBusy(true); setCopied(false); setDraft(''); setExpired(false); setActive(key);
    setCheckingSession(false); setSessionCheckError(''); setResumableId(null);
    const pending: Answer = { key, question, text: '', parent, state: 'loading' };
    setAnswers(old => retryKey ? old.map(a => a.key === key ? pending : a) : [...old, pending].slice(-24));
    ++requestId.current; setQuestionLoading(true); setQuestions([]); setQuestionError(''); setQuestionNotice('');
    let record = pending;
    let done = false;
    let streamError = false;
    const update = (patch: Partial<Answer>) => { record = { ...record, ...patch }; if (mounted.current) setAnswers(old => old.map(a => a.key === key ? { ...a, ...patch } : a)); };
    // Move once to the reading panel, without stealing the reader's scroll position on every token.
    setTimeout(() => { if (mounted.current) answerPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
    let timeout: ReturnType<typeof setTimeout>;
    const resetTimeout = () => { clearTimeout(timeout); timeout = setTimeout(() => abort.abort('timeout'), 120000); };
    resetTimeout();
    try {
      const response = await fetch(apiUrl('/api/medical/ask'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: session, question, parent_answer_id: parent }), signal: abort.signal });
      if (!response.ok) throw new MedicalApiError(await failure(response), response.status);
      if (!response.body) throw new Error('服务未返回回答内容，请重试。');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const event = (block: string) => {
        let name = 'message'; const data: string[] = [];
        for (const line of block.split('\n')) { if (line.startsWith('event:')) name = line.slice(6).trim(); if (line.startsWith('data:')) data.push(line.slice(5).trimStart()); }
        if (!data.length) return;
        let value: any;
        try { value = JSON.parse(data.join('\n')); } catch { throw new Error('服务返回了无法读取的数据，请重试。'); }
        if (name === 'meta') update({ meta: value });
        if (name === 'evidence_comparison' && record.meta) update({ meta: { ...record.meta, comparison: value } });
        if (name === 'delta' && typeof value.content === 'string') update({ text: record.text + value.content });
        if (name === 'replace' && typeof value.content === 'string') update({ text: value.content });
        if (name === 'done') { done = true; update({ state: 'complete' }); }
        if (name === 'error') { streamError = true; throw new Error(value.message || '模型暂时无法回答，请重试。'); }
      };
      while (true) {
        const chunk = await reader.read(); resetTimeout();
        buffer += decoder.decode(chunk.value, { stream: !chunk.done });
        buffer = buffer.replace(/\r\n/g, '\n');
        let boundary: number;
        while ((boundary = buffer.indexOf('\n\n')) !== -1) { event(buffer.slice(0, boundary)); buffer = buffer.slice(boundary + 2); }
        if (chunk.done) { if (buffer.trim()) event(buffer); break; }
      }
      if (!done || !record.text.trim() || streamError) throw new Error('连接中断或未收到完整答案，请重试。');
      if (mounted.current) void loadQuestions(record);
    } catch (error) {
      const stopped = abort.signal.aborted && abort.signal.reason !== 'timeout';
      const message = abort.signal.aborted ? stopped ? '已停止生成，以下内容尚未完成。' : '等待回答超时，以下内容可能不完整。请重试。' : readableError(error);
      const parentUnavailable = !!parent && ((error instanceof MedicalApiError && error.status === 404) || /不存在|失效|过期|not found|expired|unknown answer/i.test(message));
      update({ state: 'failed', error: message, stopped });
      if (parentUnavailable) {
        setExpired(true); setResumableId(null);
        update({ error: '原对话已结束，请确认完整问题后重新提交。' });
        void loadQuestions();
      }
      if (mounted.current && !parentUnavailable) { setQuestionLoading(false); setQuestions([]); setQuestionNotice('解答完成后再提供相关问题，也可重新回答。'); }
      if (!abort.signal.aborted) abort.abort();
    } finally {
      clearTimeout(timeout!);
      if (controller.current === abort) controller.current = null;
      if (mounted.current) setBusy(false);
    }
  }
  async function copyAnswer() {
    if (!current?.text) return;
    const sources = current.meta?.sources || [];
    const references = sources.length ? '\n\n参考资料：\n' + sources.map((source, index) => `[${index + 1}] ${sourceDisplayTitle(source, index)}\n${source.url}`).join('\n') : '';
    const text = `${current.question}\n\n${readableCitations(displayAnswer(current), sources)}${references}`;
    let success = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        try { await navigator.clipboard.writeText(text); success = true; } catch { /* Fall back to selection on HTTP portals. */ }
      }
      if (!success) {
        const previous = document.activeElement as HTMLElement | null;
        const field = document.createElement('textarea');
        field.value = text; field.readOnly = true;
        field.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0';
        document.body.appendChild(field);
        try { field.focus({ preventScroll: true }); field.select(); success = document.execCommand('copy'); }
        finally { field.remove(); previous?.focus({ preventScroll: true }); }
      }
    } catch { success = false; }
    setCopied(success); setCopyError(!success);
    if (success) setTimeout(() => setCopied(false), 2200);
  }
  const parentForDraft = canContinue ? current.meta!.answer_id : null;
  return <main className="med-workbench">
    <header className="med-heading">
      <div><div className="med-eyebrow"><HeartPulse size={16} /> 医学知识与资料查询</div><h1>医学知识<span>问答</span></h1><p>围绕四川地域环境、川西高原、地方病、就医服务与用药安全，解答医学与健康问题。</p></div>
      <div className="med-heading-side"><span className="med-model"><Sparkles size={15} /> 天府·慧研</span><span className={`med-service ${service?.state === 'ready' && !statusError ? 'ready' : ''}`}><i />{statusLoading ? '连接中' : service?.state === 'ready' && !statusError ? '知识服务已就绪' : '服务暂未就绪'}</span></div>
    </header>
    {(statusError || service?.state === 'offline') && <div className="med-alert" role="status"><CircleAlert size={17} /><span>{statusError || service?.message || '模型服务暂不可用。'}</span><button onClick={() => void loadStatus()} disabled={statusLoading}>{statusLoading ? '检查中…' : '重新检查'}</button></div>}
    {storageError && <p className="med-storage-note">浏览器无法保存问答记录，本次页面仍可正常使用。</p>}
    <div className="med-layout">
      <div className="med-main">
        <section className="med-question-box" aria-labelledby="med-input-heading">
          <div className="med-section-label"><Search size={16} /><h2 id="med-input-heading">{canContinue ? '继续追问' : selectedRegionalTopic || '请输入你的医学问题'}</h2>{current && <button className="med-text-button" onClick={() => newTopic()} disabled={busy}><Plus size={14} /> 新问题</button>}</div>
          {canContinue && <p className="med-context">接着「{current.question}」提问 · 追问 {current.meta!.depth + 1} / 3</p>}
          <form onSubmit={event => { event.preventDefault(); void ask(draft, parentForDraft); }}>
            <textarea ref={input} value={draft} onChange={event => setDraft(event.target.value)} maxLength={2000} disabled={busy} aria-label="医学知识问题" placeholder={canContinue ? '写下你想进一步了解的问题…' : '例如：四川潮湿气候会增加类风湿关节炎风险吗？'} onKeyDown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void ask(draft, parentForDraft); } }} />
            <div className="med-input-footer"><span>纯文字问答 <b>·</b> Ctrl + Enter 发送 <b>·</b> {draft.length}/2000</span>{busy ? <button type="button" className="med-secondary" onClick={() => controller.current?.abort()}><Square size={14} /> 停止生成</button> : <button type="submit" className="med-primary" disabled={!draft.trim() || checkingSession || service?.state !== 'ready' || !!statusError}>获取解答 <ArrowRight size={16} /></button>}</div>
          </form>
        </section>
        {checkingSession && <p className="med-storage-note">正在确认此记录是否还能继续追问…</p>}
        {sessionCheckError && <p className="med-storage-note">{sessionCheckError}<button className="med-text-button" onClick={() => void loadQuestions(current)} disabled={busy}>重新连接</button></p>}
        {expired && current && <div className="med-history-note"><BookOpen size={18} /><span>这是一条历史记录，可继续阅读。重新询问本题后即可开启新的追问。</span><button className="med-text-button" onClick={() => prepareReask(current)} disabled={busy}>重新询问本题</button></div>}
        {answers.length > 0 && <nav className="med-trail" aria-label="问答记录"><div className="med-trail-label"><FileText size={15} /> 问答记录 <span>{completedCount} 个解答</span></div><div className="med-trail-items">{answers.map((answer, index) => <button key={answer.key} disabled={busy} className={active === answer.key ? 'active' : ''} onClick={() => selectAnswer(answer)} title={answer.question}><span>{index + 1}</span>{answer.question}{answer.state === 'failed' && <CircleAlert size={13} />}</button>)}</div></nav>}
        {current ? <section className="med-answer" ref={answerPanel} aria-labelledby="med-answer-heading" aria-busy={busy}>
          <div className="med-answer-top"><span><BookOpen size={16} /> 知识解答</span><span>{current.meta?.topic || '医学知识'} {current.meta && <b>· {current.meta.depth === 0 ? '起始问题' : `追问 ${current.meta.depth} / 3`}</b>}</span></div>
          <h2 id="med-answer-heading">{current.question}</h2>
          {visibleText ? <div className={`med-prose${isWriting ? ' med-writing' : ''}`}><ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} components={{ img: ({ alt }) => <span>{alt || ''}</span>, a: ({ children, href }) => {
            const reference = /^#med-source-([1-9]\d*)$/.exec(href || '');
            if (reference && Number(reference[1]) <= (current.meta?.sources.length || 0)) return <a className="med-citation" href={href} aria-label={`查看参考资料 ${reference[1]}`} onClick={event => { event.preventDefault(); const source = document.getElementById(`med-source-${reference[1]}`); if (source instanceof HTMLDetailsElement) { source.open = true; source.scrollIntoView({ behavior: 'smooth', block: 'start' }); source.querySelector('summary')?.focus({ preventScroll: true }); } }}>{children}</a>;
            return current.meta?.sources.some(source => safeLink(source.url) && source.url === href) ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>;
          } }}>{readableCitations(visibleText, current.meta?.sources, true)}</ReactMarkdown></div> : current.state === 'loading' || isWriting ? <div className="med-reading-state med-thinking" role="status"><span className="med-thinking-orbit"><Sparkles size={23} /></span><strong>正在思考中<span className="med-thinking-dots"><i /><i /><i /></span></strong><span>正在整理与核对资料，请稍候</span></div> : null}
          {isWriting && visibleText && <div className="med-streaming" role="status"><span /> 正在呈现解答…</div>}
          {current.error && <div className="med-answer-error" role="alert"><CircleAlert size={17} /><span>{current.error}</span></div>}
          {current.state === 'complete' && !isWriting && current.meta && !scopeRedirect && <div className="med-sources"><div className="med-source-heading"><FileText size={16} /><h3>参考资料</h3><span>{current.meta.sources.length} 项</span></div>{current.meta.sources.length ? current.meta.sources.map((source, index) => <details id={`med-source-${index + 1}`} key={`${source.id}-${index}`}><summary><span className="med-source-number">{index + 1}</span><span><strong>{sourceDisplayTitle(source, index)}</strong><small>{[publisherDisplayName(source.publisher), source.published_at, sectionLabel(source.section)].filter(Boolean).join(' · ')}</small></span><ChevronDown size={16} /></summary><div className="med-source-detail">{source.excerpt && <blockquote>{sourceDisplayExcerpt(source)}</blockquote>}{source.text_note && <p className="med-source-context">{source.text_note}</p>}{source.evidence_role === 'research_qa' && source.dataset_row && <p className="med-source-context">来源定位：{source.dataset_subset === 'encyclopedia' ? '百科问答' : '知识图谱问答'} · {source.dataset_split === 'train' ? '训练集' : source.dataset_split === 'validation' ? '验证集' : '测试集'} · 原文件第 {source.dataset_row.toLocaleString()} 行 · 版本 {source.dataset_revision?.slice(0, 12)}</p>}{!!source.regions?.length && <p className="med-source-context">适用地区：{source.regions.join('、')}</p>}{source.jurisdiction_note && <p className="med-source-context">适用背景：{source.jurisdiction_note}</p>}{source.date_note && <p className="med-source-context">时间范围：{source.date_note}</p>}<p className="med-source-context">{source.published_at ? `发布日期：${source.published_at}` : '原文未公开发布或更新日期'}{source.retrieved_at ? ` · 取用：${source.retrieved_at}` : ''}</p><div><span>资料 {index + 1}{source.evidence_role === 'research_qa' ? ' · 研究问答' : source.language === 'en' ? ' · 外文原文' : ' · 中文原文'}</span>{safeLink(source.url) && <a href={source.url} target="_blank" rel="noopener noreferrer">阅读来源 <ArrowUpRight size={14} /></a>}</div></div></details>) : <p className="med-no-sources">本次解答没有可展示的知识库来源。</p>}</div>}
          {current.state === 'complete' && !isWriting && current.meta?.comparison && <section className="med-comparison" aria-label="多来源对照"><div className="med-source-heading"><BookOpen size={16} /><h3>多来源对照</h3><span>{current.meta.comparison.overview.publisher_groups} 套发布体系</span></div>{(['common_points', 'complementary_points', 'differences'] as const).map(kind => (current.meta!.comparison![kind] || []).filter(point => !hasEnglishProse(point.claim)).map((point, index) => <details className={kind === 'differences' ? 'med-comparison-difference' : ''} key={`${kind}-${index}`}><summary><span>{kind === 'common_points' ? '共同要点' : kind === 'complementary_points' ? '补充信息' : '口径或内容差异'}</span><strong>{point.claim}</strong><ChevronDown size={14} /></summary><div>{point.evidence.map(evidence => { const number = current.meta!.sources.findIndex(source => source.id === evidence.source_id) + 1; return <blockquote key={evidence.source_id}>{/[\u3400-\u9fff]/.test(evidence.quote) && !hasEnglishProse(evidence.quote) ? <p>{evidence.quote}</p> : <><small>中文要点（原文见来源）</small><p>{point.claim}</p></>}<cite>{publisherDisplayName(evidence.publisher)}{number > 0 && <> · <a href={`#med-source-${number}`}>资料 [{number}]</a></>}</cite></blockquote>; })}</div></details>))}<p className="med-comparison-note">{current.meta.comparison.note}</p></section>}
          {copyError && <p className="med-storage-note" role="status">自动复制未成功，请选择解答文字复制。</p>}<div className="med-answer-footer"><span><Sparkles size={13} /> 天府·慧研 <b>·</b> {isWriting ? '正在呈现解答' : current.state === 'complete' ? '解答完成' : current.state === 'loading' ? '正在思考中' : '回答未完成'}</span><div>{current.text && !isWriting && !legacyEnglish && <button className="med-text-button" onClick={() => void copyAnswer()}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? '已复制' : '复制'}</button>}{((current.state === 'failed' && !expired) || legacyUnreferenced || legacyEnglish) && <button className="med-text-button" disabled={busy} onClick={() => expired ? prepareReask(current) : void ask(current.question, legacyUnreferenced || legacyEnglish ? null : current.parent, current.key)}><RefreshCw size={14} /> 重新回答</button>}</div></div>
        </section> : <section className="med-empty"><div className="med-orbit"><HeartPulse size={37} /><span /><span /></div><span className="med-eyebrow">医学知识 · 有据可查</span><h2>请输入你的医学问题</h2><p>可查询疾病知识、症状含义、检查指标及预防措施，<br />也可选择右侧常见问题。回答附参考来源，便于核查。</p><div className="med-empty-steps"><span><Search size={15} /> 提出问题</span><ArrowRight size={13} /><span><BookOpen size={15} /> 获取解答</span><ArrowRight size={13} /><span><FileText size={15} /> 查阅来源</span></div></section>}
        <p className="med-reference-note">用于医学知识查询与参考。个体诊疗、检查判读与用药请咨询医疗专业人员。</p>
      </div>
      <aside className="med-recommendations" aria-labelledby="med-rec-heading">
        <div className="med-rec-heading"><div><span className="med-eyebrow">{scopeRedirect ? '医学提问引导' : questionMode === 'related' ? '关联追问' : '四川健康问答'}</span><h2 id="med-rec-heading">{scopeRedirect ? '请询问医学问题' : questionMode === 'related' ? '相关问题' : '四川场景示例'}</h2></div><button className="med-shuffle" onClick={() => void loadQuestions(!expired ? current : undefined, true)} disabled={questionLoading || busy || scopeRedirect} aria-label="刷新推荐问题"><RefreshCw size={14} className={questionLoading ? 'med-spin' : ''} /> 换一组</button></div>
        <p className="med-rec-description">{scopeRedirect ? '可询问症状、检查、药物知识、疾病预防或医学研究。' : busy ? '解答完成后，将展示相关问题。' : expired ? '历史答案仍可阅读；可重新询问本题，或选择下列四川场景。' : limit ? '已完成 3 轮追问，可选择常见问题开始新的问答。' : questionMode === 'related' ? `可选择下列问题，继续追问（${(current?.meta?.depth ?? 0) + 1} / 3）。` : selectedRegionalTopic ? `${selectedRegionalTopic} · 点击问题获取解答。` : '点击四川场景可编辑完整提问，也可直接输入你的疑问。'}</p>
        {regionalTopics.length > 0 && <details className="med-regional" ref={regionalPanel}><summary><MapPin size={15} /><span><strong>四川健康专题</strong>{selectedRegionalTopic && <small>{selectedRegionalTopic}</small>}</span><ChevronDown size={15} /></summary><div className="med-regional-body"><p>选择专题，开始新的医学问答。</p><div className="med-regional-topics"><button className={!selectedRegionalTopic && questionMode === 'random' ? 'active' : ''} aria-pressed={!selectedRegionalTopic && questionMode === 'random'} disabled={busy} onClick={() => newTopic()}>全部问题</button>{regionalTopics.map(topic => <button key={topic} className={selectedRegionalTopic === topic ? 'active' : ''} aria-pressed={selectedRegionalTopic === topic} disabled={busy} onClick={() => newTopic(topic)}>{topic}</button>)}</div>{selectedRegionalTopic && <span className="med-regional-selection">当前专题：{selectedRegionalTopic}<button onClick={() => newTopic()} disabled={busy}>取消筛选</button></span>}</div></details>}
        {questionError ? <div className="med-rec-error" role="status"><CircleAlert size={21} /><p>{questionError}</p><button className="med-secondary" onClick={() => void loadQuestions(!expired ? current : undefined)}>重新加载</button>{expired && <button className="med-text-button" onClick={() => newTopic()}>开启新问题 <ArrowRight size={14} /></button>}</div> : questionNotice ? <div className="med-related-empty" role="status"><BookOpen size={19} /><p>{questionNotice}</p></div> : <div className="med-question-list">{questionLoading ? Array.from({ length: 5 }, (_, index) => <div className="med-question-skeleton" key={index}><span /><span /></div>) : questions.map((question, index) => <button key={question.id} disabled={busy || (expired && questionMode === 'related') || service?.state !== 'ready' || !!statusError} title={question.text} onClick={() => { if (question.scenario_id) { setDraft(question.text); input.current?.focus(); input.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } else void ask(question.text, questionMode === 'related' && canContinue ? current.meta!.answer_id : null); }}><div><span className="med-question-number">0{index + 1}</span><small>{question.topic}</small></div><strong>{question.short_title || question.text}</strong>{question.scenario_id && <p className="med-scenario-preview">{question.text}</p>}<ArrowUpRight size={16} className="med-question-arrow" /></button>)}</div>}
        <div className="med-depth"><div><Compass size={15} /><span>关联追问</span><strong>{current?.meta?.depth ?? 0} <small>/ 3</small></strong></div><div className="med-depth-track">{[1, 2, 3].map(level => <i key={level} className={(current?.meta?.depth ?? 0) >= level ? 'filled' : ''} />)}</div><p>每个起始问题最多关联追问 3 轮，也可随时开启新问题。</p></div>
        <div className="med-library"><BookOpen size={18} /><div><strong>医学参考资料</strong><p>{service?.knowledge ? `${(service.knowledge.reference_sources_total ?? service.knowledge.sources).toLocaleString()} 条参考资料${service.knowledge.research_qa ? ` · ${service.knowledge.research_qa.answer_records.toLocaleString()} 条研究问答` : ` · ${service.knowledge.questions} 个常见问题`}` : '来源与原文随解答展示'}</p><span>来源可查 · 适用条件随资料说明</span></div></div>
        {current && <button className="med-new-topic" onClick={() => newTopic()} disabled={busy}><Plus size={16} /> 开启一个新问题 <ArrowRight size={15} /></button>}
      </aside>
    </div>
  </main>;
}
