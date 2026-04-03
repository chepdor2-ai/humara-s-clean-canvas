import { CreditCard, LogOut, Settings, User, Bell, Key, HelpCircle, CheckCircle2 } from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Profile', icon: User },
  { label: 'Billing & Plans', icon: CreditCard },
  { label: 'API Keys', icon: Key },
  { label: 'Notifications', icon: Bell },
  { label: 'Support', icon: HelpCircle },
];

export default function SettingsPage() {
  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-5">
      <header>
        <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
          <Settings className="text-brand-600 w-5 h-5" /> Settings
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage account, billing, and preferences</p>
      </header>

      <div className="flex bg-white rounded-xl border border-slate-200 overflow-hidden flex-col lg:flex-row min-h-[500px]">
        <nav className="w-full lg:w-56 bg-slate-50 p-4 border-r border-slate-200 space-y-0.5">
          {NAV_ITEMS.map((item, i) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                className={`w-full text-left px-3 py-2.5 text-sm font-medium transition-colors flex items-center gap-2.5 rounded-lg ${
                  i === 1 ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-white hover:text-slate-900'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            );
          })}
          <div className="pt-4 mt-4 border-t border-slate-200">
            <button className="w-full text-left px-3 py-2.5 text-sm font-medium text-red-500 hover:bg-red-50 flex items-center gap-2.5 transition-colors rounded-lg">
              <LogOut className="w-4 h-4" /> Sign Out
            </button>
          </div>
        </nav>

        <section className="flex-1 p-6 overflow-y-auto">
          <div className="mb-10">
            <h2 className="text-lg font-semibold text-slate-900 mb-1">Billing & Plans</h2>
            <p className="text-sm text-slate-500 mb-6">You are on the <strong className="text-brand-600">Pro Plan ($15/mo)</strong>.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-5 border border-brand-200 bg-brand-50/50 rounded-xl relative">
                <span className="absolute -top-2.5 right-4 bg-brand-600 text-white text-[10px] font-semibold px-2.5 py-0.5 rounded-full">Current</span>
                <h3 className="text-base font-semibold text-slate-900">Pro Plan</h3>
                <div className="text-2xl font-semibold text-slate-900 my-3">$15 <span className="text-sm text-slate-400 font-normal">/month</span></div>
                <ul className="space-y-2 text-sm text-slate-600 mb-5">
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-brand-600 shrink-0" /> 50,000 words/month</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-brand-600 shrink-0" /> Standard detector bypass</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-brand-600 shrink-0" /> 3 style profiles</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-brand-600 shrink-0" /> Email support</li>
                </ul>
                <button className="w-full py-2 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors border border-slate-200 rounded-lg">Manage</button>
              </div>

              <div className="p-5 border border-slate-200 bg-white rounded-xl hover:border-emerald-300 transition-colors relative">
                <span className="absolute -top-2.5 right-4 bg-emerald-500 text-white text-[10px] font-semibold px-2.5 py-0.5 rounded-full">Upgrade</span>
                <h3 className="text-base font-semibold text-slate-900">Enterprise</h3>
                <div className="text-2xl font-semibold text-slate-900 my-3">$49 <span className="text-sm text-slate-400 font-normal">/month</span></div>
                <ul className="space-y-2 text-sm text-slate-600 mb-5">
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> Unlimited words</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> Deep stealth mode</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> Unlimited style profiles</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> Priority support + API</li>
                </ul>
                <button className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition-colors rounded-lg">Upgrade</button>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-100 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">Payment Methods</h3>
            <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-900 flex items-center justify-center text-white rounded-lg">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">Mastercard ending in 4242</p>
                  <p className="text-xs text-slate-400">Expires 12/26</p>
                </div>
              </div>
              <button className="px-3 py-1.5 bg-white text-slate-600 border border-slate-200 text-xs font-medium hover:bg-slate-50 transition-colors rounded-lg">Edit</button>
            </div>
            <button className="text-brand-600 hover:text-brand-700 text-sm font-medium">+ Add payment method</button>
          </div>
        </section>
      </div>
    </div>
  );
}

