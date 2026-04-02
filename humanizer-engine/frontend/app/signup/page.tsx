import Link from 'next/link';
import { ArrowRight, Globe, Mail } from 'lucide-react';

export default function Signup() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FFF8F0] px-6 py-20 selection:bg-[#D97757]/10">
      <div className="w-full max-w-[480px] bg-white p-12 shadow-[0_40px_100px_-20px_rgba(92,64,51,0.15)] border border-[#EADDCF] animate-in fade-in zoom-in-95 duration-700">
        <div className="text-center mb-12">
           <Link href="/" className="inline-flex items-center text-2xl font-bold font-sora tracking-tight mb-8 group">
             <span className="text-[#5C4033]">Huma</span>
             <span className="text-[#D97757]">ra</span>
             <div className="w-1.5 h-1.5 rounded-full bg-[#7A8F6A] ml-1 group-hover:scale-150 transition-transform"></div>
           </Link>
           <h1 className="text-3xl font-bold text-[#5C4033] mb-3 font-sora">Create an account</h1>
           <p className="text-[#8A7263] text-sm font-medium">Precision-tuned humanization awaits.</p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-10">
           <button className="flex items-center justify-center gap-3 py-4 border border-[#EADDCF] hover:bg-[#FFF8F0] transition-all text-[11px] font-black uppercase tracking-widest text-[#5C4033]">
               <Globe className="w-4 h-4" /> SSO
           </button>
           <button className="flex items-center justify-center gap-3 py-4 border border-[#EADDCF] hover:bg-[#FFF8F0] transition-all text-[11px] font-black uppercase tracking-widest text-[#5C4033]">
              <Mail className="w-4 h-4" /> Google
           </button>
        </div>

        <div className="relative mb-10">
           <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[#EADDCF]"></div></div>
           <div className="relative flex justify-center text-[10px] uppercase font-black tracking-[0.3em]"><span className="px-4 bg-white text-[#8A7263]/40">Or continue with</span></div>
        </div>
        
        <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8A7263] block">Full Name</label>
            <input type="text" className="w-full px-5 py-4 bg-[#FFF8F0] border border-[#EADDCF] focus:border-[#D97757] outline-none text-[#5C4033] text-sm font-bold placeholder:text-[#8A7263]/40 transition-colors" placeholder="Alex Sterling" />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8A7263] block">Email Address</label>
            <input type="email" className="w-full px-5 py-4 bg-[#FFF8F0] border border-[#EADDCF] focus:border-[#D97757] outline-none text-[#5C4033] text-sm font-bold placeholder:text-[#8A7263]/40 transition-colors" placeholder="alex@sterling.com" />
          </div>
          <div className="space-y-2 pb-4">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8A7263] block">Password</label>
            <input type="password" className="w-full px-5 py-4 bg-[#FFF8F0] border border-[#EADDCF] focus:border-[#D97757] outline-none text-[#5C4033] text-sm font-bold transition-colors" />
          </div>
          <Link href="/app/dashboard" className="w-full flex items-center justify-center gap-3 py-5 bg-[#5C4033] hover:bg-[#D97757] text-white text-[12px] font-black uppercase tracking-[0.2em] shadow-xl shadow-[#5C4033]/20 transition-all active:scale-95">
            Create Account <ArrowRight className="w-4 h-4"/>
          </Link>
        </form>

        <div className="mt-12 text-center">
           <p className="text-[11px] font-bold text-[#8A7263] uppercase tracking-widest">
             Already have an account? <Link href="/login" className="text-[#D97757] hover:underline">Sign in</Link>
           </p>
        </div>
        
        <div className="mt-12 pt-8 border-t border-[#EADDCF] text-center">
           <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#8A7263]/40 leading-relaxed">
             By joining, you agree to our <Link href="/terms" className="underline hover:text-[#5C4033]">Terms of Service</Link> and <Link href="/privacy" className="underline hover:text-[#5C4033]">Privacy Policy</Link>.
           </p>
        </div>
      </div>
    </div>
  );
}
