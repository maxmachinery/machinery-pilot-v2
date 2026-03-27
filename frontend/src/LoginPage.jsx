import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LOGO_URL } from './logo.js';

const C = { red: '#CC0000', black: '#1A1A1A', grey: '#CCCCCC', greyBg: '#F7F7F7', greyDk: '#888888' };

export default function LoginPage() {
  const navigate = useNavigate();
  const [step, setStep]           = useState('email'); // 'email' | 'code'
  const [email, setEmail]         = useState('');
  const [digits, setDigits]       = useState(['', '', '', '']);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [resendTimer, setResendTimer] = useState(0);
  const inputRefs = [useRef(), useRef(), useRef(), useRef()];
  const timerRef = useRef(null);

  useEffect(() => {
    if (resendTimer > 0) {
      timerRef.current = setTimeout(() => setResendTimer(t => t - 1), 1000);
    }
    return () => clearTimeout(timerRef.current);
  }, [resendTimer]);

  async function sendCode(emailToSend) {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/auth/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailToSend }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to send code'); return; }
      setStep('code');
      setDigits(['', '', '', '']);
      setResendTimer(30);
      setTimeout(() => inputRefs[0].current?.focus(), 100);
    } catch {
      setError('Network error — is the server running?');
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(code) {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Invalid code'); setLoading(false); return; }
      localStorage.setItem('mp_token', data.token);
      localStorage.setItem('mp_email', data.email);
      navigate('/dashboard');
    } catch {
      setError('Network error');
      setLoading(false);
    }
  }

  function handleDigit(i, val) {
    const v = val.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = v;
    setDigits(next);
    if (v && i < 3) inputRefs[i + 1].current?.focus();
    if (next.every(d => d !== '') && next.join('').length === 4) {
      verifyCode(next.join(''));
    }
  }

  function handleDigitKey(i, e) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      inputRefs[i - 1].current?.focus();
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: C.greyBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ background: '#fff', width: 380, padding: '40px 36px', boxShadow: '0 4px 32px rgba(0,0,0,0.10)', borderTop: `4px solid ${C.red}` }}>
        {/* Brand */}
        <div style={{ marginBottom: 32, textAlign: 'center' }}>
          <div style={{ display: 'inline-block', background: C.black, padding: '8px 16px', marginBottom: 8 }}>
            <img src={LOGO_URL} alt="RK6 Machinery Services" style={{ height: 36, width: 'auto', display: 'block' }} />
          </div>
          <div style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: C.greyDk, marginTop: 6 }}>SafetyCulture to Catalyst Converter</div>
        </div>

        {step === 'email' && (
          <>
            <label style={lblStyle}>Email Address</label>
            <input
              style={inputStyle}
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && email && !loading && sendCode(email)}
              placeholder="you@example.com"
              autoFocus
            />
            {error && <div style={errStyle}>{error}</div>}
            <button
              style={{ ...btnStyle, opacity: (!email || loading) ? 0.6 : 1 }}
              disabled={!email || loading}
              onClick={() => sendCode(email)}
            >
              {loading ? 'Sending…' : 'Send Code'}
            </button>
          </>
        )}

        {step === 'code' && (
          <>
            <p style={{ fontSize: 13, color: '#444', margin: '0 0 20px', lineHeight: 1.5 }}>
              Enter the 4-digit code sent to<br />
              <strong style={{ color: C.black }}>{email}</strong>
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 20 }}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={inputRefs[i]}
                  style={digitStyle}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={e => handleDigit(i, e.target.value)}
                  onKeyDown={e => handleDigitKey(i, e)}
                  disabled={loading}
                />
              ))}
            </div>
            {error && <div style={errStyle}>{error}</div>}
            {loading && <div style={{ textAlign: 'center', fontSize: 13, color: C.greyDk, marginBottom: 12 }}>Verifying…</div>}
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              {resendTimer > 0
                ? <span style={{ fontSize: 12, color: C.greyDk }}>Resend code in {resendTimer}s</span>
                : <button style={linkBtnStyle} onClick={() => sendCode(email)}>Resend code</button>
              }
            </div>
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button style={linkBtnStyle} onClick={() => { setStep('email'); setError(''); setDigits(['','','','']); }}>
                ← Use a different email
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const lblStyle = { display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#888', marginBottom: 6 };
const inputStyle = { width: '100%', boxSizing: 'border-box', border: '1px solid #CCCCCC', padding: '10px 14px', fontSize: 14, outline: 'none', marginBottom: 16, fontFamily: 'Arial,sans-serif' };
const btnStyle = { width: '100%', background: '#CC0000', color: '#fff', border: 'none', padding: '12px', fontSize: 14, fontWeight: 700, letterSpacing: 1, cursor: 'pointer', textTransform: 'uppercase' };
const errStyle = { background: '#fde8e6', border: '1px solid #CC0000', color: '#CC0000', padding: '8px 12px', fontSize: 12, marginBottom: 14, letterSpacing: 0.5 };
const digitStyle = { width: 56, height: 64, textAlign: 'center', fontSize: 28, fontWeight: 700, border: '2px solid #CCCCCC', fontFamily: 'Arial,sans-serif', outline: 'none' };
const linkBtnStyle = { background: 'none', border: 'none', color: '#CC0000', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', padding: 0 };
