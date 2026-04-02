import { CreditCard, LogOut, Settings } from 'lucide-react';

const NAV_ITEMS = ['Profile', 'Billing & Plans', 'API Keys', 'Notifications', 'Support'];

export default function SettingsPage() {
  return (
    <div className="max-w-5xl mx-auto h-full flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold font-sora text-[#5C4033] flex items-center gap-3">
          <Settings className="text-[#8A7263] w-8 h-8" /> Settings
        </h1>
        <p className="text-[#8A7263] mt-2">Manage account, billing, and platform preferences.</p>
      </header>

      <div className="flex bg-white overflow-hidden border border-[#EADDCF] flex-col md:flex-row h-full">
        <nav className="w-full md:w-72 bg-[#FFF8F0] p-6 border-r border-[#EADDCF] space-y-2">
          {NAV_ITEMS.map((item, i) => (
            <button
              key={item}
              className={`w-full text-left px-4 py-3 text-[11px] font-black uppercase tracking-[0.14em] transition-colors ${
                i === 1 ? 'bg-[#5C4033] text-white' : 'text-[#8A7263] hover:bg-white hover:text-[#5C4033]'
              }`}
            >
              {item}
            </button>
          ))}
          <div className="pt-8 mt-8 border-t border-[#EADDCF]">
            <button className="w-full text-left px-4 py-3 text-[11px] font-black uppercase tracking-[0.14em] text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors">
              <LogOut className="w-4 h-4" /> Sign Out
            </button>
          </div>
        </nav>

        <section className="flex-1 p-8 overflow-y-auto">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-[#5C4033] mb-2 font-sora">Billing & Plans</h2>
            <p className="text-[#8A7263] mb-6">You are currently on the <strong className="text-[#FF5A1F]">Pro Plan ($15/mo)</strong>.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-6 border border-[#FF5A1F] bg-[#FFF8F0] relative">
                <span className="absolute -top-3 right-6 bg-[#FF5A1F] text-white text-xs font-bold px-3 py-1 uppercase">Current</span>
                <h3 className="text-xl font-bold text-[#5C4033]">Pro Plan</h3>
                <div className="text-3xl font-black text-[#5C4033] my-3 font-sora">$15 <span className="text-sm text-[#8A7263] font-normal">/month</span></div>
                <ul className="space-y-2 text-sm text-[#5C4033] mb-6 font-medium">
                  <li>50,000 words/month</li>
                  <li>Standard detector bypass</li>
                  <li>3 style memory slots</li>
                  <li>Email support</li>
                </ul>
                <button className="w-full py-3 bg-white border border-[#EADDCF] text-[#5C4033] text-[11px] font-black uppercase tracking-[0.14em] hover:bg-[#FFF8F0] transition-colors">Manage Subscription</button>
              </div>

              <div className="p-6 border border-[#EADDCF] bg-white hover:border-[#7A8F6A] transition-colors relative">
                <span className="absolute -top-3 right-6 bg-[#7A8F6A] text-white text-xs font-bold px-3 py-1 uppercase">Upgrade</span>
                <h3 className="text-xl font-bold text-[#5C4033]">Enterprise</h3>
                <div className="text-3xl font-black text-[#5C4033] my-3 font-sora">$49 <span className="text-sm text-[#8A7263] font-normal">/month</span></div>
                <ul className="space-y-2 text-sm text-[#5C4033] mb-6 font-medium">
                  <li>Unlimited words</li>
                  <li>Deep stealth mode</li>
                  <li>Unlimited style memory</li>
                  <li>Priority support + API access</li>
                </ul>
                <button className="w-full py-3 bg-[#7A8F6A] text-white text-[11px] font-black uppercase tracking-[0.14em] hover:bg-[#687C59] transition-colors">Upgrade Now</button>
              </div>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-[#EADDCF] space-y-6">
            <h3 className="text-xl font-bold text-[#5C4033] font-sora">Payment Methods</h3>
            <div className="flex items-center justify-between p-5 bg-[#F5EBE1] border border-[#EADDCF]">
              <div className="flex items-center gap-4">
                <div className="w-12 h-8 bg-[#5C4033] flex items-center justify-center text-white">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-bold text-[#5C4033]">Mastercard ending in 4242</p>
                  <p className="text-xs text-[#8A7263]">Expires 12/26</p>
                </div>
              </div>
              <button className="px-4 py-2 bg-white text-[#5C4033] border border-[#EADDCF] text-[11px] font-black uppercase tracking-[0.14em] hover:bg-[#FFF8F0]">Edit</button>
            </div>
            <button className="text-[#FF5A1F] hover:text-[#C96342] text-[11px] font-black uppercase tracking-[0.14em]">+ Add payment method</button>
          </div>
        </section>
      </div>
    </div>
  );
}
