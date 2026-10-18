export type PresentationSource = { title: string; publisher?: string; language?: string; topic?: string; excerpt?: string };

export function hasEnglishProse(text: string) {
  const prose = text.replace(/\[[^\]\n]{1,160}\]|https?:\/\/\S+/g, '');
  const words = prose.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || [];
  return words.some(word => word.length >= 2 && /[a-z]/.test(word)
    && !/^(intern|mmhg|mmol|mol|kg|cm|mm|mg|ml|dl|bpm|iu|ug|mcg)$/i.test(word)
    && !(word.length <= 12 && (word.match(/[A-Z]/g) || []).length >= 2));
}

export function sourceDisplayTitle(source: PresentationSource, index: number) {
  const title = source.title.replace(/[（(][^）)]*[A-Za-z][^）)]*[）)]/g, '').trim();
  return /[\u3400-\u9fff]/.test(title) ? title : `${source.topic || '医学知识'}参考资料 ${index + 1}`;
}

export function publisherDisplayName(publisher = '') {
  if (/MedlinePlus|National Library of Medicine|\bNLM\b/i.test(publisher)) return '美国国立医学图书馆';
  if (/NIDDK|National Institute of Diabetes/i.test(publisher)) return '美国国立糖尿病、消化与肾病研究所';
  return /[\u3400-\u9fff]/.test(publisher) ? publisher : '医学资料发布机构';
}

export function sourceDisplayExcerpt(source: PresentationSource) {
  if (source.language?.startsWith('zh') && hasEnglishProse(source.excerpt || '')) {
    return '原始资料含外文术语，点击“阅读来源”可查阅完整原文。解答以中文整理。';
  }
  return source.language === 'en' || hasEnglishProse(source.excerpt || '')
    ? '原始资料为外文，点击“阅读来源”可查阅原文。解答以中文整理。'
    : source.excerpt || '';
}

export function safeRevealPrefix(text: string, requestedLength: number) {
  let length = Math.min(text.length, Math.max(0, Math.floor(requestedLength)));
  if (length === text.length) return text;
  if (length < text.length && /[\uD800-\uDBFF]/.test(text.charAt(length - 1))) length--;
  const prefix = text.slice(0, length);
  const opening = prefix.lastIndexOf('[');
  if (opening > prefix.lastIndexOf(']')) length = opening;
  return text.slice(0, length);
}
