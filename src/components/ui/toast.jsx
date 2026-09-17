// ============================================================================
// PronoScope — Système de notifications (toasts)
// ============================================================================
import { createRoot } from 'react-dom/client';
import { Icon } from '../icons';

const STACK_ID = 'pronoscope-toast-stack';

function ensureStack() {
  let stack = document.getElementById(STACK_ID);
  if (!stack) {
    stack = document.createElement('div');
    stack.id = STACK_ID;
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }
  return stack;
}

const ICONS = { info: 'info', ok: 'checkCircle', bad: 'xCircle', warn: 'alert' };

function ToastItem({ kind, message, onDone }) {
  const ref = { current: null };
  setTimeout(() => {
    const el = ref.current;
    if (el) {
      el.classList.add('out');
      setTimeout(onDone, 320);
    }
  }, 4600);
  return (
    <div
      className="toast glass-strong"
      ref={(node) => {
        ref.current = node;
      }}
      role="status"
    >
      <Icon name={ICONS[kind] ?? 'info'} size={19} className={`toast-${kind}`} />
      <div className="toast-msg">{message}</div>
    </div>
  );
}

function push(kind, message) {
  const stack = ensureStack();
  const holder = document.createElement('div');
  stack.appendChild(holder);
  const itemRoot = createRoot(holder);
  itemRoot.render(
    <ToastItem
      kind={kind}
      message={message}
      onDone={() => {
        itemRoot.unmount();
        holder.remove();
      }}
    />,
  );
}

export const toast = {
  info: (m) => push('info', m),
  ok: (m) => push('ok', m),
  bad: (m) => push('bad', m),
  warn: (m) => push('warn', m),
};
