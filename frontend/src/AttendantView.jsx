import { useState, useRef, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const APP_URL = import.meta.env.VITE_APP_URL  || window.location.origin;
const WS_URL  = (import.meta.env.VITE_API_URL || 'http://localhost:3001')
  .replace('https://', 'wss://')
  .replace('http://', 'ws://');

export default function AttendantView() {
  const [cnhFile,    setCnhFile]    = useState(null);
  const [cnhPreview, setCnhPreview] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [sessionId,  setSessionId]  = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [wsStatus,   setWsStatus]   = useState('idle'); // idle | connected | processing | complete | error
  const [result,     setResult]     = useState(null);
  const [error,      setError]      = useState(null);

  const fileInputRef = useRef(null);
  const wsRef        = useRef(null);

  useEffect(() => () => wsRef.current?.close(), []);
  useEffect(() => () => { if (cnhPreview) URL.revokeObjectURL(cnhPreview); }, [cnhPreview]);

  /* ── File handling ── */
  function acceptFile(file) {
    if (!file?.type.startsWith('image/')) return;
    setCnhFile(file);
    setCnhPreview(URL.createObjectURL(file));
    setResult(null);
    setError(null);
    setSessionId(null);
  }
  function handleFileInput(e)  { acceptFile(e.target.files[0]); e.target.value = ''; }
  function handleDragOver(e)   { e.preventDefault(); setIsDragging(true); }
  function handleDragLeave()   { setIsDragging(false); }
  function handleDrop(e)       { e.preventDefault(); setIsDragging(false); acceptFile(e.dataTransfer.files[0]); }

  /* ── Create session ── */
  async function handleCreateSession() {
    if (!cnhFile) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('cnh', cnhFile);
      const res  = await fetch(`${API_URL}/api/session/create`, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao criar sessão.');
      setSessionId(data.sessionId);
      connectWebSocket(data.sessionId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  /* ── WebSocket ── */
  function connectWebSocket(sid) {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen    = () => { setWsStatus('connected'); ws.send(JSON.stringify({ type: 'join', sessionId: sid })); };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'processing') setWsStatus('processing');
      if (msg.type === 'result')     { setResult(msg); setWsStatus('complete'); }
      if (msg.type === 'error')      { setError(msg.message); setWsStatus('error'); }
    };
    ws.onclose   = () => setWsStatus(s => s === 'complete' ? s : 'idle');
  }

  function resetSession() {
    wsRef.current?.close();
    setSessionId(null);
    setResult(null);
    setWsStatus('idle');
    setError(null);
  }

  const clientUrl = `${APP_URL}/client?session=${sessionId}`;

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
            <p>Painel do Atendente</p>
          </div>
        </div>
      </header>

      <main className="main">

        {/* ── Step 1: upload CNH and create session ── */}
        {!sessionId && (
          <>
            <section className="panel solo-panel">
              <div className="panel-title">
                <span className="step-badge">1</span>
                <h2>Assinatura da CNH</h2>
              </div>

              <div
                className={`upload-zone${isDragging ? ' dragging' : ''}${cnhPreview ? ' has-file' : ''}`}
                onDragOver={handleDragOver} onDragEnter={handleDragOver}
                onDragLeave={handleDragLeave} onDrop={handleDrop}
                onClick={() => !cnhPreview && fileInputRef.current?.click()}
                role="button" tabIndex={cnhPreview ? -1 : 0}
                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && !cnhPreview && fileInputRef.current?.click()}
                aria-label="Área de upload da assinatura da CNH"
              >
                {cnhPreview ? (
                  <div className="preview">
                    <img src={cnhPreview} alt="Assinatura da CNH carregada" />
                    <button className="btn-change" type="button"
                      onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                      Trocar imagem
                    </button>
                  </div>
                ) : (
                  <div className="upload-placeholder">
                    <div className="upload-icon-wrap" aria-hidden="true">
                      <svg width="38" height="38" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                        <polyline points="17 8 12 3 7 8"/>
                        <line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                    </div>
                    <p>Arraste a imagem aqui</p>
                    <span className="or-text">ou</span>
                    <button className="btn-outline-sm" type="button"
                      onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                      Selecionar arquivo
                    </button>
                    <small>JPG, PNG, WEBP…</small>
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept="image/*"
                  className="sr-only" onChange={handleFileInput} tabIndex={-1} />
              </div>
            </section>

            <div className="cta">
              <button className="btn-primary" type="button"
                onClick={handleCreateSession} disabled={!cnhFile || loading}>
                {loading ? (
                  <><span className="spinner" aria-hidden="true" /> Criando sessão...</>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="16"/>
                      <line x1="8" y1="12" x2="16" y2="12"/>
                    </svg>
                    Iniciar Sessão
                  </>
                )}
              </button>
              {!cnhFile && <p className="cta-hint">Faça upload da assinatura da CNH para continuar</p>}
              {error    && <p className="cta-hint" style={{ color: '#dc2626' }}>{error}</p>}
            </div>
          </>
        )}

        {/* ── Step 2: session active ── */}
        {sessionId && (
          <div className="session-panel">

            <div className="session-code-block">
              <p className="session-label">Código da Sessão</p>
              <span className="session-code">{sessionId}</span>
              <p className="session-hint">Passe o código ao cliente ou mostre o QR Code abaixo</p>
            </div>

            <div className="qr-block">
              <QRCodeSVG value={clientUrl} size={180} />
              <p className="qr-url">{clientUrl}</p>
            </div>

            {wsStatus === 'connected' && (
              <div className="status-waiting">
                <span className="pulse-dot" aria-hidden="true" />
                Aguardando assinatura do cliente…
              </div>
            )}

            {wsStatus === 'processing' && (
              <div className="status-waiting">
                <span className="spinner"
                  style={{ borderColor: 'rgba(37,99,235,.2)', borderTopColor: '#2563eb' }}
                  aria-hidden="true" />
                Analisando assinatura…
              </div>
            )}

            {result && (
              <div className={`result-card ${result.approved ? 'result-approved' : 'result-rejected'}`} role="alert">
                <div className="result-icon-wrap">
                  {result.approved ? (
                    <svg width="38" height="38" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                      <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                  ) : (
                    <svg width="38" height="38" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                      <line x1="12" y1="9" x2="12" y2="13"/>
                      <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                  )}
                </div>
                <div className="result-body">
                  <h3>{result.approved ? 'Assinatura Aprovada' : 'Assinatura Não Confirmada'}</h3>
                  <p className="result-message">{result.message}</p>
                  <div className="score-row">
                    <span>Similaridade</span>
                    <strong>{Math.round(result.score)}%</strong>
                  </div>
                  <div className="score-track" role="meter"
                    aria-valuenow={Math.round(result.score)} aria-valuemin={0} aria-valuemax={100}>
                    <div className="score-fill" style={{ width: `${Math.min(100, Math.round(result.score))}%` }} />
                  </div>
                  <button className="btn-retry" type="button" onClick={resetSession}>
                    Nova verificação
                  </button>
                </div>
              </div>
            )}

            {error && wsStatus === 'error' && (
              <div className="result-card result-error" role="alert">
                <div className="result-body">
                  <h3>Erro na verificação</h3>
                  <p>{error}</p>
                  <button className="btn-retry" type="button" onClick={resetSession}>Tentar novamente</button>
                </div>
              </div>
            )}

          </div>
        )}

      </main>

      <footer className="footer">
        <p>Verificador de Assinaturas · Powered by Claude AI</p>
      </footer>
    </div>
  );
}
