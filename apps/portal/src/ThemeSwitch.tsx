import { useEffect, useRef } from 'react';
import { Check, ChevronDown, Monitor, Moon, Sun } from 'lucide-react';
import type { ThemePreference } from './theme';

const options = [
  { value: 'system' as const, label: '跟随系统', Icon: Monitor },
  { value: 'light' as const, label: '浅色模式', Icon: Sun },
  { value: 'dark' as const, label: '深色模式', Icon: Moon },
];

export function ThemeSwitch({ preference, resolved, onChange }: {
  preference: ThemePreference; resolved: 'light' | 'dark'; onChange: (value: ThemePreference) => void;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const Icon = resolved === 'dark' ? Moon : Sun;
  useEffect(() => {
    const close = (event: PointerEvent) => { if (event.target instanceof Node && !menu.current?.contains(event.target) && menu.current) menu.current.open = false; };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, []);
  return <details className="theme-control" ref={menu} onKeyDown={event => {
    if (event.key === 'Escape' && menu.current) { menu.current.open = false; menu.current.querySelector('summary')?.focus(); }
  }}>
    <summary aria-label="切换亮暗主题" title="切换亮暗主题"><Icon size={18}/><span>外观</span><ChevronDown size={14}/></summary>
    <div className="theme-options" role="group" aria-label="主题模式">
      {options.map(({ value, label, Icon: OptionIcon }) => <button key={value} type="button" aria-pressed={preference === value} onClick={() => {
        onChange(value);
        if (menu.current) { menu.current.open = false; menu.current.querySelector('summary')?.focus(); }
      }}><OptionIcon size={17}/><span>{label}</span>{preference === value && <Check size={15}/>}</button>)}
    </div>
  </details>;
}
