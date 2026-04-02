import Link from 'next/link';
import { Sparkles, ArrowRight } from 'lucide-react';

export default function Signup() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FFF8F0] p-6">
      <div className="w-full max-w-md bg-white p-8 rounded-3xl shadow-xl border border-[#EADDCF]">
        <div className="flex justify-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-[#D97757] shadow-lg shadow-[#D97757]/30">
             <Sparkles className="text-white w-6 h-6" />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-center text-[#5C4033] mb-2 font-sora">Create Account</h1>
        <p className="text-center text-[#8A7263] mb-8">Start humanizing text instantly.</p>
        
        <form className="space-y-5">
          <div>
            <label className="block text-sm font-bold text-[#5C4033] mb-1">Full Name</label>
            <input type="text" className="w-full p-3 rounded-xl border border-[#EADDCF] bg-[#FFF8F0] focus:ring-2 focus:ring-[#D97757]/20 outline-none text-[#5C4033]" placeholder="Dr. Jane Doe" />
          </div>
          <div>
            <label className="block text-sm font-bold text-[#5C4033] mb-1">Email</label>
            <input type="email" className="w-full p-3 rounded-xl border border-[#EADDCF] bg-[#FFF8F0] focus:ring-2 focus:ring-[#D97757]/20 outline-none text-[#5C4033]" placeholder="jane@university.edu" />
          </div>
          <div>
            <label className="block text-sm font-bold text-[#5C4033] mb-1">Password</label>
            <input type="password" className="w-full p-3 rounded-xl border border-[#EADDCF] bg-[#FFF8F0] focus:ring-2 focus:ring-[#D97757]/20 outline-none text-[#5C4033]" placeholder="" />
          </div>
          <button className="w-full flex items-center justify-center gap-2 py-3 bg-[#D97757] hover:bg-[#C96342] text-white font-bold rounded-xl shadow-md transition-all active:scale-95 text-lg">
            Sign Up <ArrowRight className="w-5 h-5"/>
          </button>
        </form>
        <p className="text-center mt-6 text-[#8A7263]">Already have an account? <Link href="/login" className="text-[#D97757] font-bold hover:underline">Log in</Link></p>
      </div>
    </div>
  );
}
