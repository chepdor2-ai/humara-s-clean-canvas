import { Settings, CreditCard, User, HelpCircle, LogOut } from 'lucide-react';

export default function SettingsPage() {
  return (
    <div className="max-w-4xl mx-auto h-full flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold font-sora text-[#5C4033] flex items-center gap-3">
          <Settings className="text-[#8A7263] w-8 h-8"/> Settings
        </h1>
        <p className="text-[#8A7263] mt-2">Manage your account, billing, and system preferences.</p>
      </header>

      <div className="flex bg-white rounded-3xl overflow-hidden shadow-sm border border-[#EADDCF] flex-col md:flex-row h-full">
        <nav className="w-full md:w-64 bg-[#FFF8F0] p-6 border-r border-[#EADDCF] space-y-2">
          {['Profile', 'Billing & Plans', 'API Keys', 'Notifications', 'Support'].map((item, i) => (
             <button key={i} className="w-full text-left px-5 py-3 rounded-xl font-bold transition-colors">
               {item}
             </button>
          ))}
          <div className="pt-8 mt-8 border-t border-[#EADDCF]">
            <button className="w-full text-left px-5 py-3 rounded-xl text-red-500 hover:bg-red-50 font-bold flex items-center gap-2 transition-colors">
              <LogOut className="w-4 h-4"/> Sign Out
            </button>
          </div>
        </nav>

        <section className="flex-1 p-8 overflow-y-auto">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-[#5C4033] mb-2 font-sora">Billing & Plans</h2>
            <p className="text-[#8A7263] mb-6">You are currently on the <strong className="text-[#D97757]">Pro Plan (/mo)</strong>.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <div className="p-6 border border-[#D97757] bg-[#FFF8F0] rounded-2xl relative">
                  <span className="absolute -top-3 right-6 bg-[#D97757] text-white text-xs font-bold px-3 py-1 rounded-full uppercase">Current</span>
                  <h3 className="text-xl font-bold text-[#5C4033]">Pro Plan</h3>
                  <div className="text-3xl font-black text-[#5C4033] my-3 font-sora"> <span className="text-sm text-[#8A7263] font-normal">/month</span></div>
                 <ul className="space-y-2 text-sm text-[#5C4033] mb-6 font-medium">
                    <li> 50,000 words/mo</li>
                    <li> Standard Detectors Bypass</li>
                    <li> Basic Style Memory</li>
                    <li> Email Support</li>
                 </ul>
                 <button className="w-full py-2 bg-white border border-[#EADDCF] text-[#5C4033] font-bold rounded-xl shadow-sm hover:bg-gray-50 transition-colors">Manage Subscription</button>
               </div>

               <div className="p-6 border border-[#EADDCF] bg-white rounded-2xl hover:border-[#7A8F6A] transition-colors relative">
                 <div className="absolute inset-0 bg-gradient-to-br from-[#7A8F6A]/5 to-transparent rounded-2xl"></div>
                 <span className="absolute -top-3 right-6 bg-[#7A8F6A] text-white text-xs font-bold px-3 py-1 rounded-full uppercase">Upgrade</span>
                  <h3 className="text-xl font-bold text-[#5C4033]">Enterprise</h3>
                  <div className="text-3xl font-black text-[#5C4033] my-3 font-sora"> <span className="text-sm text-[#8A7263] font-normal">/month</span></div>
                 <ul className="space-y-2 text-sm text-[#5C4033] mb-6 font-medium">
                    <li> Unlimited words</li>
                    <li> Turnitin/ZeroGPT Bypass</li>
                    <li> Unlimited Style Memory</li>
                    <li> Priority Support & API Access</li>
                 </ul>
                 <button className="w-full py-2 bg-[#7A8F6A] text-white font-bold rounded-xl shadow-sm hover:bg-[#687C59] transition-colors">Upgrade Now</button>
               </div>
            </div>
          </div>
          
          <div className="mt-12 pt-8 border-t border-[#EADDCF] space-y-6">
            <h3 className="text-xl font-bold text-[#5C4033] font-sora">Payment Methods</h3>
            <div className="flex items-center justify-between p-5 bg-[#F5EBE1] border border-[#EADDCF] rounded-2xl">
              <div className="flex items-center gap-4">
                 <div className="w-12 h-8 bg-[#5C4033] rounded flex items-center justify-center text-white font-bold text-xs"><CreditCard className="w-5 h-5"/></div>
                 <div>
                   <p className="font-bold text-[#5C4033]">Mastercard ending in 4242</p>
                   <p className="text-xs text-[#8A7263]">Expires 12/26</p>
                 </div>
              </div>
              <button className="px-4 py-2 bg-white text-[#5C4033] border border-[#EADDCF] rounded-lg text-sm font-bold shadow-sm hover:bg-gray-50">Edit</button>
            </div>
            <button className="text-[#D97757] hover:text-[#C96342] font-bold text-sm">+ Add new payment method</button>
          </div>
        </section>
      </div>
    </div>
  );
}
