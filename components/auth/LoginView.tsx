import React, { useState } from 'react';

interface LoginViewProps {
  onLoginSuccess: (role: 'planner' | 'viewer') => void;
}

export default function LoginView({ onLoginSuccess }: LoginViewProps) {
  const [loginError, setLoginError] = useState('');
  const [isLoginSuccess, setIsLoginSuccess] = useState(false);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoginError('');
    const form = e.currentTarget;
    const username = (form.elements.namedItem('username') as HTMLInputElement).value;
    const password = (form.elements.namedItem('password') as HTMLInputElement).value;

    try {
      const res = await fetch('/api/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', username, password })
      });
      const result = await res.json();
      if (result.success) {
        const assignedRole: 'planner' | 'viewer' = result.role === 'viewer' ? 'viewer' : 'planner';
        try {
          sessionStorage.setItem('pc_aio_user_role', assignedRole);
        } catch {}
        setIsLoginSuccess(true);
        setTimeout(() => {
          try {
            onLoginSuccess(assignedRole);
          } catch (err) {
            console.error('Login transition error:', err);
          } finally {
            setIsLoginSuccess(false);
          }
        }, 1200);
      } else {
        setLoginError(result.error || 'Incorrect username or password.');
      }
    } catch {
      setLoginError('Server communication failed.');
    }
  };

  return (
    <div className="flex w-full h-screen font-sans overflow-hidden bg-white">
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes slideUp { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes checkmark { 0% { stroke-dashoffset: 100; opacity: 0; } 100% { stroke-dashoffset: 0; opacity: 1; } }
        @keyframes fluidMove1 { 0% { transform: translate(0px, 0px) scale(1); } 50% { transform: translate(80px, 60px) scale(1.15); } 100% { transform: translate(0px, 0px) scale(1); } }
        @keyframes fluidMove2 { 0% { transform: translate(0px, 0px) scale(1.1); } 50% { transform: translate(-70px, -50px) scale(0.95); } 100% { transform: translate(0px, 0px) scale(1.1); } }
        @keyframes fluidMove3 { 0% { transform: translate(0px, 0px) scale(1); } 50% { transform: translate(60px, -70px) scale(1.2); } 100% { transform: translate(0px, 0px) scale(1); } }
        .animate-enter { animation: slideUp 0.5s ease-out forwards; }
        .checkmark-path { stroke-dasharray: 100; stroke-dashoffset: 100; animation: checkmark 0.6s ease-in-out forwards; }
        .fluid-blob-1 { animation: fluidMove1 14s ease-in-out infinite; }
        .fluid-blob-2 { animation: fluidMove2 18s ease-in-out infinite; }
        .fluid-blob-3 { animation: fluidMove3 16s ease-in-out infinite; }
      `}} />

      <div className="hidden md:block w-[60%] h-full relative bg-[#090d16] overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#12082b] via-[#210e4a] to-[#0a1f24]" />
        <div className="fluid-blob-1 absolute -top-24 -left-24 w-[520px] h-[520px] rounded-full opacity-90 mix-blend-screen pointer-events-none" style={{ background: 'radial-gradient(circle, #8beb3a 0%, #43ca55 45%, transparent 70%)', filter: 'blur(75px)' }} />
        <div className="fluid-blob-2 absolute -bottom-32 -right-20 w-[600px] h-[600px] rounded-full opacity-95 mix-blend-screen pointer-events-none" style={{ background: 'radial-gradient(circle, #7a22cf 0%, #48118d 50%, transparent 75%)', filter: 'blur(80px)' }} />
        <div className="fluid-blob-3 absolute top-1/3 left-1/4 w-[480px] h-[480px] rounded-full opacity-70 mix-blend-screen pointer-events-none" style={{ background: 'radial-gradient(circle, #299e74 0%, #1f5068 55%, transparent 75%)', filter: 'blur(90px)' }} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/30 pointer-events-none" />
      </div>

      <div className="w-full md:w-[40%] flex flex-col justify-center px-12 lg:px-20 bg-white relative z-20">
        {isLoginSuccess ? (
          <div className="flex flex-col items-center justify-center animate-enter text-center">
            <svg className="w-20 h-20 text-emerald-500 mb-6" viewBox="0 0 52 52" fill="none">
              <circle cx="26" cy="26" r="25" fill="none" stroke="currentColor" strokeWidth="2"/>
              <path className="checkmark-path" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
            </svg>
            <h2 className="text-2xl font-black text-slate-900">Success</h2>
            <p className="text-slate-500 font-medium">Loading workspace...</p>
          </div>
        ) : (
          <div className="w-full max-w-sm mx-auto animate-enter">
            <h2 className="text-[clamp(2rem,3vw,3rem)] font-black text-slate-900 tracking-tight mb-2">Welcome Back</h2>
            <p className="text-sm text-slate-500 font-medium mb-12">Enter your credentials to continue.</p>

            <form onSubmit={handleLogin} className="space-y-8">
              <div className="relative group">
                <input name="username" type="text" required placeholder=" " className="peer w-full bg-transparent border-b-2 border-slate-200 text-slate-900 font-bold py-3 outline-none focus:border-indigo-600 transition-colors placeholder-transparent" />
                <label className="absolute left-0 top-3 text-slate-400 font-semibold text-sm transition-all peer-focus:-top-4 peer-focus:text-xs peer-focus:text-indigo-600 peer-valid:-top-4 peer-valid:text-xs peer-valid:text-slate-500 cursor-text pointer-events-none">Username</label>
              </div>
              <div className="relative group">
                <input name="password" type="password" required placeholder=" " className="peer w-full bg-transparent border-b-2 border-slate-200 text-slate-900 font-bold py-3 outline-none focus:border-indigo-600 transition-colors placeholder-transparent" />
                <label className="absolute left-0 top-3 text-slate-400 font-semibold text-sm transition-all peer-focus:-top-4 peer-focus:text-xs peer-focus:text-indigo-600 peer-valid:-top-4 peer-valid:text-xs peer-valid:text-slate-500 cursor-text pointer-events-none">Password</label>
              </div>

              {loginError && <div className="text-rose-500 text-xs font-bold">{loginError}</div>}

              <button type="submit" className="w-full bg-[#111827] hover:bg-indigo-600 text-white font-bold py-4 rounded-full transition-colors mt-8 text-sm">
                Continue
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}