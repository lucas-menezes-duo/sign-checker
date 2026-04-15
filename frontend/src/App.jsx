import { useState, useRef, useEffect } from 'react';
import SignaturePad from 'signature_pad';
import axios from 'axios';
import './App.css';

const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/compare`;

export default function App() {
  const [cnhFile, setCnhFile]     = useState(null);
  const [cnhPreview, setCnhPreview] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [sigEmpty, setSigEmpty]   = useState(true);
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState(null);   // { score, approved, message }
  const [apiError, setApiError]   = useState(null);

  const canvasRef   = useRef(null);
  const padRef      = useRef(null);
  const fileInputRef = useRef(null);

  /* ── Initialize SignaturePad & handle canvas resize ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const pad = new SignaturePad(canvas, {
      backgroundColor: 'rgb(255,255,255)',
      penColor: 'rgb(15,23,42)',
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

    return () => {
      ro.disconnect();
      padRef.current = null;
    };
  }, []);

  /* ── Revoke object URL when preview changes ── */
  useEffect(() => {
    return () => { if (cnhPreview) URL.revokeObjectURL(cnhPreview); };
  }, [cnhPreview]);

  /* ── Handlers ── */
  function acceptCnhFile(file) {
    if (!file?.type.startsWith('image/')) return;
    setCnhFile(file);
    setCnhPreview(URL.createObjectURL(file));
    setResult(null);
    setApiError(null);
  }

  function handleFileInput(e) {
    acceptCnhFile(e.target.files[0]);
    e.target.value = ''; // allow re-selecting the same file
  }

  function handleDragOver(e)  { e.preventDefault(); setIsDragging(true); }
  function handleDragLeave()  { setIsDragging(false); }
  function handleDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    acceptCnhFile(e.dataTransfer.files[0]);
  }

  function clearSignature() {
    padRef.current?.clear();
    setSigEmpty(true);
    setResult(null);
    setApiError(null);
  }

  const canVerify = cnhFile !== null && !sigEmpty && !loading;

  async function handleVerify() {
    if (!canVerify) return;
    setLoading(true);
    setResult(null);
    setApiError(null);
    try {
      const sigBlob = await new Promise(resolve =>
        canvasRef.current.toBlob(resolve, 'image/png')
      );
      const form = new FormData();
      form.append('cnh', cnhFile);
      form.append('signature', sigBlob, 'signature.png');
      const { data } = await axios.post(API_URL, form);
      setResult(data);
    } catch (err) {
      setApiError(err.response?.data?.error ?? 'Erro ao conectar com o servidor.');
    } finally {
      setLoading(false);
    }
  }

  /* ── Hint text for disabled button ── */
  function hintText() {
    if (cnhFile && sigEmpty)   return 'Assine no campo acima para continuar';
    if (!cnhFile && !sigEmpty) return 'Faça upload da assinatura da CNH para continuar';
    if (!cnhFile && sigEmpty)  return 'Preencha os dois campos acima para verificar';
    return null;
  }

  return (
    <div className="app">

      {/* ── Header ── */}
      <header className="header">
        <div className="header-inner">
          <svg className="shield-icon" width="32" height="32" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <div>
            <h1>Verificador de Assinaturas</h1>
            <p>Envie a assinatura da CNH e colete a assinatura do cliente para validação</p>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="main">

        {/* Panels */}
        <div className="panels">

          {/* Panel 1 — CNH Upload */}
          <section className="panel">
            <div className="panel-title">
              <span className="step-badge">1</span>
              <h2>Assinatura da CNH</h2>
            </div>

            <div
              className={`upload-zone${isDragging ? ' dragging' : ''}${cnhPreview ? ' has-file' : ''}`}
              onDragOver={handleDragOver}
              onDragEnter={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => !cnhPreview && fileInputRef.current?.click()}
              role="button"
              tabIndex={cnhPreview ? -1 : 0}
              onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && !cnhPreview && fileInputRef.current?.click()}
              aria-label="Área de upload da assinatura da CNH"
            >
              {cnhPreview ? (
                <div className="preview">
                  <img src={cnhPreview} alt="Assinatura da CNH carregada" />
                  <button
                    className="btn-change"
                    type="button"
                    onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
                  >
                    Trocar imagem
                  </button>
                </div>
              ) : (
                <div className="upload-placeholder">
                  <div className="upload-icon-wrap" aria-hidden="true">
                    <svg width="38" height="38" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="1.4"
                      strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                  </div>
                  <p>Arraste a imagem aqui</p>
                  <span className="or-text">ou</span>
                  <button
                    className="btn-outline-sm"
                    type="button"
                    onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
                  >
                    Selecionar arquivo
                  </button>
                  <small>JPG, PNG, WEBP…</small>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleFileInput}
                tabIndex={-1}
              />
            </div>
          </section>

          {/* Panel 2 — Signature Canvas */}
          <section className="panel">
            <div className="panel-title">
              <span className="step-badge">2</span>
              <h2>Assinatura do Cliente</h2>
            </div>

            <div className="canvas-wrapper" aria-label="Campo de assinatura">
              <canvas ref={canvasRef} className="sig-canvas" />
              {sigEmpty && (
                <span className="canvas-hint" aria-hidden="true">
                  Assine aqui com o dedo ou mouse
                </span>
              )}
            </div>

            <button
              className="btn-ghost"
              type="button"
              onClick={clearSignature}
              disabled={sigEmpty}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="1 4 1 10 7 10"/>
                <path d="M3.51 15a9 9 0 1 0 .49-4.95"/>
              </svg>
              Limpar assinatura
            </button>
          </section>
        </div>

        {/* CTA */}
        <div className="cta">
          <button
            className="btn-primary"
            type="button"
            onClick={handleVerify}
            disabled={!canVerify}
          >
            {loading ? (
              <>
                <span className="spinner" aria-hidden="true" />
                Verificando...
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Verificar Assinatura
              </>
            )}
          </button>
          {!canVerify && !loading && hintText() && (
            <p className="cta-hint">{hintText()}</p>
          )}
        </div>

        {/* API Error */}
        {apiError && (
          <div className="result-card result-error" role="alert">
            <div className="result-icon-wrap">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <div className="result-body">
              <h3>Erro na verificação</h3>
              <p>{apiError}</p>
            </div>
          </div>
        )}

        {/* Result */}
        {result && (
          <div
            className={`result-card ${result.approved ? 'result-approved' : 'result-rejected'}`}
            role="alert"
          >
            <div className="result-icon-wrap">
              {result.approved ? (
                <svg width="38" height="38" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              ) : (
                <svg width="38" height="38" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              )}
            </div>

            <div className="result-body">
              <h3>
                {result.approved ? 'Assinatura Aprovada' : 'Assinatura Não Confirmada'}
              </h3>
              <p className="result-message">{result.message}</p>

              <div className="score-row">
                <span>Similaridade</span>
                <strong>{Math.round(result.score)}%</strong>
              </div>
              <div className="score-track" role="meter"
                aria-valuenow={Math.round(result.score)} aria-valuemin={0} aria-valuemax={100}>
                <div
                  className="score-fill"
                  style={{ width: `${Math.min(100, Math.round(result.score))}%` }}
                />
              </div>

              {!result.approved && (
                <button className="btn-retry" type="button" onClick={clearSignature}>
                  Limpar e tentar novamente
                </button>
              )}
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
