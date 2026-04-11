'use client';
import { useState } from 'react';
import { Send, CheckCircle2, AlertCircle } from 'lucide-react';

export default function ContactForm() {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.message) return;
    setStatus('sending');
    setErrorMsg('');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Something went wrong.');
        setStatus('error');
        return;
      }
      setStatus('success');
      setForm({ name: '', email: '', subject: '', message: '' });
    } catch {
      setErrorMsg('Network error. Please try again.');
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <div className="bg-zinc-900 rounded-xl border border-emerald-800 p-8 text-center">
        <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">Message sent!</h3>
        <p className="text-sm text-zinc-400">We&apos;ll get back to you within 24 hours.</p>
        <button onClick={() => setStatus('idle')} className="mt-4 text-sm text-brand-600 hover:text-brand-700 font-medium">
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 md:p-8 space-y-5">
      <h3 className="text-lg font-semibold text-white">Send us a message</h3>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">Name *</label>
          <input
            type="text"
            required
            value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            className="w-full px-4 py-2.5 text-sm border border-zinc-700 rounded-lg bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Your name"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">Email *</label>
          <input
            type="email"
            required
            value={form.email}
            onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
            className="w-full px-4 py-2.5 text-sm border border-zinc-700 rounded-lg bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="you@example.com"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1.5">Subject</label>
        <input
          type="text"
          value={form.subject}
          onChange={e => setForm(p => ({ ...p, subject: e.target.value }))}
          className="w-full px-4 py-2.5 text-sm border border-zinc-700 rounded-lg bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="How can we help?"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1.5">Message *</label>
        <textarea
          required
          rows={5}
          value={form.message}
          onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
          className="w-full px-4 py-2.5 text-sm border border-zinc-700 rounded-lg bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
          placeholder="Tell us what you need..."
        />
      </div>
      {status === 'error' && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-950/30 px-4 py-2.5 rounded-lg">
          <AlertCircle className="w-4 h-4 shrink-0" /> {errorMsg}
        </div>
      )}
      <button
        type="submit"
        disabled={status === 'sending'}
        className="w-full sm:w-auto bg-brand-600 hover:bg-brand-700 text-white px-7 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
      >
        {status === 'sending' ? 'Sending...' : <><Send className="w-4 h-4" /> Send Message</>}
      </button>
    </form>
  );
}
