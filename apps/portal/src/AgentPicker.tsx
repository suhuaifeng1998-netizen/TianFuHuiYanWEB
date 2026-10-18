import { useEffect, useRef } from 'react';
import { ArrowRight, Atom, Bot, BrainCircuit, Stethoscope, X } from 'lucide-react';
import { agents } from './agents';
import './AgentPicker.css';

type AgentPickerProps = {
  onClose: () => void;
  returnFocus: HTMLElement | null;
};

export function AgentPicker({ onClose, returnFocus }: AgentPickerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const trigger = returnFocus || document.querySelector<HTMLElement>('[data-agent-trigger]');
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Native modal dialogs keep keyboard focus inside and make the page behind inert.
    dialog.showModal();
    dialog.querySelector<HTMLAnchorElement>('a[href]')?.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [returnFocus]);

  return (
    <dialog
      ref={dialogRef}
      className="agent-dialog"
      id="agent-picker"
      aria-labelledby="agent-picker-title"
      aria-describedby="agent-picker-description"
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}
    >
      <div className="agent-picker-content">
        <button type="button" className="agent-picker-close" aria-label="关闭 Agent 选择" onClick={onClose}><X size={20}/></button>
        <div className="agent-picker-heading">
          <span className="agent-picker-symbol"><BrainCircuit size={25}/></span>
          <div className="agent-picker-eyebrow">A SPACE FOR INTELLIGENCE</div>
          <h2 id="agent-picker-title">选择 Agent<span>。</span></h2>
          <p id="agent-picker-description">为当前研究任务，选择你的智能体。</p>
        </div>
        <div className="agent-picker-options">
          {agents.map(agent => {
            const Icon = agent.icon === 'robot' ? Bot : agent.icon === 'medical' ? Stethoscope : Atom;
            const content = <>
              <span className="agent-option-icon"><Icon size={27}/></span>
              <span className="agent-option-body">
                <span className="agent-option-category">{agent.category}</span>
                <strong>{agent.name}</strong>
                <span className="agent-option-description">{agent.description}</span>
                <span className="agent-option-action">{agent.action}{agent.href && <ArrowRight size={14}/>}</span>
              </span>
            </>;
            // Native new-tab links preserve the current portal page.
            return <div key={agent.id}>
              {agent.href
                ? <a href={agent.href} target="_blank" rel="noopener noreferrer" className="agent-option agent-option-available">{content}</a>
                : <button type="button" className="agent-option agent-option-placeholder" disabled>{content}</button>}

            </div>;
          })}
        </div>
        <div className="agent-picker-footer"><span>专业任务，从这里开始</span><span>按 Esc 返回</span></div>
      </div>
    </dialog>
  );
}
