/**
 * 全螢幕計算中遮罩（overlay）+ 即時計時器。求解在 Web Worker，故主執行緒可持續更新計時。
 * 用法：const ov = showSolveOverlay('① 示意圖佈局…'); ov.setStatus('...'); ov.close() → 回傳耗時秒數。
 */

export function showSolveOverlay(title) {
  const start = (typeof performance !== 'undefined' ? performance.now() : Date.now());

  const root = document.createElement('div');
  root.setAttribute('data-schematic-overlay', '1');
  Object.assign(root.style, {
    position: 'fixed', inset: '0', zIndex: '2147483647',
    background: 'rgba(0,0,0,0.72)', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    fontFamily: 'system-ui, -apple-system, "Noto Sans TC", sans-serif',
  });

  const card = document.createElement('div');
  Object.assign(card.style, {
    background: '#1f2430', color: '#fff', borderRadius: '14px',
    padding: '28px 36px', minWidth: '320px', maxWidth: '90vw', textAlign: 'center',
    boxShadow: '0 12px 48px rgba(0,0,0,0.5)',
  });

  const spinner = document.createElement('div');
  Object.assign(spinner.style, {
    width: '40px', height: '40px', margin: '0 auto 18px',
    border: '4px solid rgba(255,255,255,0.18)', borderTopColor: '#7aa2ff',
    borderRadius: '50%', animation: 'schematicSpin 0.9s linear infinite',
  });
  if (!document.getElementById('schematic-overlay-style')) {
    const st = document.createElement('style');
    st.id = 'schematic-overlay-style';
    st.textContent = '@keyframes schematicSpin{to{transform:rotate(360deg)}}';
    document.head.appendChild(st);
  }

  const h = document.createElement('div');
  h.textContent = title || '計算中…';
  Object.assign(h.style, { fontSize: '17px', fontWeight: '600', marginBottom: '10px' });

  const timeEl = document.createElement('div');
  Object.assign(timeEl.style, { fontSize: '34px', fontWeight: '700', fontVariantNumeric: 'tabular-nums', margin: '6px 0' });
  timeEl.textContent = '0.0 秒';

  const statusEl = document.createElement('div');
  Object.assign(statusEl.style, { fontSize: '13px', opacity: '0.8', marginTop: '8px', minHeight: '18px' });
  statusEl.textContent = '準備中…';

  const note = document.createElement('div');
  Object.assign(note.style, { fontSize: '12px', opacity: '0.55', marginTop: '14px' });
  note.textContent = '精確八方向求解中，請勿關閉分頁（計算到完成為止）。';

  card.append(spinner, h, timeEl, statusEl, note);
  root.appendChild(card);
  document.body.appendChild(root);

  const elapsed = () => ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - start) / 1000;
  const timer = setInterval(() => { timeEl.textContent = elapsed().toFixed(1) + ' 秒'; }, 100);

  return {
    setStatus(msg) { if (msg) statusEl.textContent = msg; },
    close() {
      clearInterval(timer);
      const secs = elapsed();
      if (root.parentNode) root.parentNode.removeChild(root);
      return secs;
    },
    elapsed,
  };
}
