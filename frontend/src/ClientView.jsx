import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import SignaturePad from 'signature_pad';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const WS_URL  = (import.meta.env.VITE_API_URL || 'http://localhost:3001')
  .replace('https://', 'wss://')
  .replace('http://', 'ws://');

export default function ClientView() {
  const [searchParams]  = useSearchParams();
  const sessionId       = searchParams.get('session')?.toUpperCase() || '';

  const [sigEmpty, setSigEmpty] = useState(true);
  const [status,   setStatus]   = useState('idle'); // idle | sent | processing | approved | rejected | error
  const [result,   setResult]   = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  const canvasRef = useRef(null);
  const padRef    = useRef(null);
  const wsRef     = useRef(null);

  /* ── Initialize SignaturePad ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const pad = new SignaturePad(canvas, {
      backgroundColor: 'rgb(255,255,255)',
      penColor:        'rgb(15,23,42)',
      minWidth: 1.5,
      maxWidth: 3,
    });
    padRef.current = pad;
    pad.addEventListener('endStroke', () => setSigEmpty(pad.isEmpty()));

    function sizeCanvas() {
      if (!canvas.offsetWidth || !canvas.offsetHeight) return;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const saved = pad.toData();
      canvas.width  = canvas.offsetWidth  * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext('2d').scale(ratio, ratio);
      pad.clear();
      if (saved.length) pad.fromData(saved);
    }

    const ro = new ResizeObserver(sizeCanvas);
    ro.observe(canvas);
    return () => { ro.disconnect(); padRef.current = null; };
  }, []);

  /* ── Connect WebSocket ── */
  useEffect(() => {
    if (!sessionId) return;
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen    = () => ws.send(JSON.stringify({ type: 'join', sessionId }));
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'processing') setStatus('processing');
      if (msg.type === 'result')     { setResult(msg); setStatus(msg.approved ? 'approved' : 'rejected'); }
      if (msg.type === 'error')      { setErrorMsg(msg.message); setStatus('error'); }
    };
    return () => ws.close();
  }, [sessionId]);

  /* ── Handlers ── */
  function clearSignature() { padRef.current?.clear(); setSigEmpty(true); }

  function handleSend() {
    if (sigEmpty || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const base64 = canvasRef.current.toDataURL('image/png').split(',')[1];
    wsRef.current.send(JSON.stringify({ type: 'signature', sessionId, data: base64 }));
    setStatus('sent');
  }

  /* ── No session in URL ── */
  if (!sessionId) {
    return (
      <div className="app">
        <main className="main" style={{ flex: 1, justifyContent: 'center' }}>
          <div className="result-card result-error solo-panel" role="alert">
            <div className="result-body">
              <h3>Sessão inválida</h3>
              <p>Nenhum código de sessão encontrado na URL. Peça ao atendente um novo link ou QR Code.</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app">

      <header className="header">
        <div className="header-inner">
          <svg className="shield-icon" width="32" height="32" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <div>
            <h1>Verificador de Assinaturas</h1>
            <p>
              Sessão:&nbsp;
              <strong style={{ color: '#fff', letterSpacing: '0.1em' }}>{sessionId}</strong>
            </p>
          </div>
        </div>
      </header>

      <main className="main">

        {/* ── Signature canvas (always in DOM — SignaturePad must stay bound to the same canvas) ── */}
        <section
          className="panel solo-panel"
          style={{ display: (status === 'idle' || status === 'sent') ? undefined : 'none' }}
        >
            <div className="panel-title">
              <span className="step-badge" aria-hidden="true">✍</span>
              <h2>Sua Assinatura</h2>
            </div>

            <div className="canvas-wrapper" aria-label="Campo de assinatura">
              <canvas ref={canvasRef} className="sig-canvas" />
              {sigEmpty && (
                <span className="canvas-hint" aria-hidden="true">
                  Assine aqui com o dedo ou mouse
                </span>
              )}
            </div>

            <button className="btn-ghost" type="button"
              onClick={clearSignature} disabled={sigEmpty || status === 'sent'}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="1 4 1 10 7 10"/>
                <path d="M3.51 15a9 9 0 1 0 .49-4.95"/>
              </svg>
              Limpar
            </button>

            <div className="cta">
              <button className="btn-primary" type="button"
                onClick={handleSend} disabled={sigEmpty || status === 'sent'}>
                {status === 'sent' ? (
                  <><span className="spinner" aria-hidden="true" /> Aguardando análise…</>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="22" y1="2" x2="11" y2="13"/>
                      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                    </svg>
                    Enviar Assinatura
                  </>
                )}
              </button>
              {sigEmpty && status === 'idle' && (
                <p className="cta-hint">Assine no campo acima para continuar</p>
              )}
            </div>
          </section>

        {/* ── Analysing ── */}
        {status === 'processing' && (
          <div className="status-waiting">
            <span className="spinner"
              style={{ borderColor: 'rgba(37,99,235,.2)', borderTopColor: '#2563eb' }}
              aria-hidden="true" />
            Analisando sua assinatura…
          </div>
        )}

        {/* ── Result ── */}
        {(status === 'approved' || status === 'rejected') && result && (
          <div className={`result-card solo-panel ${result.approved ? 'result-approved' : 'result-rejected'}`}
            role="alert">
            <div className="result-icon-wrap">
              {result.approved ? (
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              ) : (
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="15" y1="9"  x2="9"  y2="15"/>
                  <line x1="9"  y1="9"  x2="15" y2="15"/>
                </svg>
              )}
            </div>
            <div className="result-body">
              <h3 style={{ fontSize: '1.3rem' }}>
                {result.approved ? 'Assinatura Aprovada ✅' : 'Tente Novamente ❌'}
              </h3>
              {!result.approved && (
                <button className="btn-retry" type="button" onClick={() => {
                  setStatus('idle'); setResult(null); clearSignature();
                }}>
                  Assinar novamente
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {status === 'error' && (
          <div className="result-card solo-panel result-error" role="alert">
            <div className="result-body">
              <h3>Erro</h3>
              <p>{errorMsg}</p>
              <button className="btn-retry" type="button" onClick={() => {
                setStatus('idle'); setErrorMsg(null);
              }}>
                Tentar novamente
              </button>
            </div>
          </div>
        )}

      </main>

      <footer className="footer">
        <p>Verificador de Assinaturas · Powered by Claude AI</p>
      </footer>
    </div>
  );
}
