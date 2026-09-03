import { MSG_START_PICKER, type PickerMessage } from '../types';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    let isPicking = false;

    browser.runtime.onMessage.addListener((msg) => {
      if ((msg as PickerMessage | null)?.action === MSG_START_PICKER) {
        enablePickerMode();
      }
    });

    function enablePickerMode(): void {
      if (isPicking) return;
      isPicking = true;

      let hoveredEl: HTMLElement | null = null;
      let originalOutline = '';

      const onMouseOver = (e: MouseEvent) => {
        const target = e.target as HTMLElement | null;
        if (!target || target.closest('#wxt-extractor-root')) return;
        if (hoveredEl) hoveredEl.style.outline = originalOutline;
        hoveredEl = target;
        originalOutline = target.style.outline;
        target.style.outline = '2px dashed #3b82f6';
      };

      const onClick = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!hoveredEl) {
          cleanup();
          return;
        }
        const el = hoveredEl;
        const extractedText = (el.innerText || el.textContent || '').trim();
        cleanup();
        showEditModal(extractedText);
      };

      const onKeydown = (e: KeyboardEvent) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        cleanup();
      };

      function cleanup(): void {
        if (hoveredEl) {
          hoveredEl.style.outline = originalOutline;
          hoveredEl = null;
        }
        document.removeEventListener('mouseover', onMouseOver, true);
        document.removeEventListener('click', onClick, true);
        document.removeEventListener('keydown', onKeydown, true);
        isPicking = false;
      }

      document.addEventListener('mouseover', onMouseOver, true);
      document.addEventListener('click', onClick, true);
      document.addEventListener('keydown', onKeydown, true);
    }

    function showEditModal(text: string): void {
      const existing = document.getElementById('wxt-extractor-root');
      if (existing) existing.remove();

      const host = document.createElement('div');
      host.id = 'wxt-extractor-root';
      const shadow = host.attachShadow({ mode: 'open' });

      shadow.innerHTML = `
        <style>
          .overlay {
            position: fixed;
            top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0,0,0,0.45);
            display: flex; justify-content: center; align-items: center;
            z-index: 2147483647;
            font-family: system-ui, -apple-system, sans-serif;
          }
          .dialog {
            background: #ffffff;
            width: 460px;
            max-width: 90vw;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
            display: flex;
            flex-direction: column;
            gap: 12px;
            box-sizing: border-box;
          }
          .title { margin: 0; font-size: 16px; font-weight: 600; color: #1f2937; }
          textarea {
            width: 100%;
            height: 180px;
            padding: 10px;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            resize: vertical;
            font-size: 14px;
            line-height: 1.5;
            box-sizing: border-box;
            font-family: inherit;
          }
          textarea:focus { outline: 2px solid #2563eb; border-color: transparent; }
          .actions { display: flex; justify-content: flex-end; gap: 8px; }
          button {
            padding: 8px 14px;
            border-radius: 6px;
            font-size: 13px;
            cursor: pointer;
            border: 1px solid transparent;
          }
          .btn-cancel, .btn-reselect { background: #f3f4f6; color: #374151; }
          .btn-reselect { margin-right: auto; }
          .btn-copy { background: #2563eb; color: #fff; }
          .btn-copy:hover { background: #1d4ed8; }
        </style>
        <div class="overlay">
          <div class="dialog">
            <h3 class="title">编辑并提取文本</h3>
            <textarea id="text-input"></textarea>
            <div class="actions">
              <button class="btn-reselect" id="reselect-btn">重新选择</button>
              <button class="btn-cancel" id="close-btn">取消</button>
              <button class="btn-copy" id="copy-btn">复制文本</button>
            </div>
          </div>
        </div>
      `;

      const overlay = shadow.querySelector<HTMLElement>('.overlay');
      const textarea = shadow.getElementById('text-input') as HTMLTextAreaElement;
      const reselectBtn = shadow.getElementById('reselect-btn') as HTMLButtonElement;
      const closeBtn = shadow.getElementById('close-btn') as HTMLButtonElement;
      const copyBtn = shadow.getElementById('copy-btn') as HTMLButtonElement;

      textarea.value = text;

      function close(): void {
        host.remove();
        document.removeEventListener('keydown', onKeydown, true);
      }

      const onKeydown = (e: KeyboardEvent) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        close();
      };

      if (overlay) {
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) close();
        });
      }
      closeBtn.onclick = close;
      reselectBtn.onclick = () => {
        close();
        enablePickerMode();
      };
      copyBtn.onclick = async () => {
        const ok = await copyText(textarea.value);
        if (ok) {
          copyBtn.textContent = '已复制！';
          setTimeout(close, 600);
        } else {
          copyBtn.textContent = '复制失败';
          setTimeout(() => {
            copyBtn.textContent = '复制文本';
          }, 1500);
        }
      };

      document.addEventListener('keydown', onKeydown, true);
      document.body.appendChild(host);
      textarea.focus();
    }

    async function copyText(text: string): Promise<boolean> {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        try {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.top = '0';
          ta.style.left = '0';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          const ok = document.execCommand('copy');
          ta.remove();
          return ok;
        } catch {
          return false;
        }
      }
    }
  },
});
