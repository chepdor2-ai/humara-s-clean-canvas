import { CreditCard, LogOut, Settings, User, Bell, Key, HelpCircle } from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Profile', icon: User },
  { label: 'Billing & Plans', icon: CreditCard },
  { label: 'API Keys', icon: Key },
  { label: 'Notifications', icon: Bell },
  { label: 'Support', icon: HelpCircle },
];

export default function SettingsPage() {
  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
          <Settings className="text-brand-600 w-8 h-8" /> Settings
        </h1>
        <p className="text-gray-600">Manage account, billing, and platform preferences.</p>
      </header>

      <div className="flex bg-white rounded-lg border border-gray-200 overflow-hidden flex-col lg:flex-row min-h-[600px]">
        <nav className="w-full lg:w-64 bg-gray-50 p-6 border-r border-gray-200 space-y-1">
          {NAV_ITEMS.map((item, i) => (
            <button
              key={item.label}
              className={`w-full text-left px-4 py-3 text-sm font-medium transition-colors flex items-center gap-3 rounded-lg ${
                i === 1 ? 'bg-brand-500 text-white' : 'text-gray-700 hover:bg-white hover:text-brand-600'
              }`}
            >\n              <item.icon className=\"w-5 h-5\" />
              {item.label}
            </button>
          ))}
          <div className="pt-6 mt-6 border-t border-gray-300">
            <button className="w-full text-left px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors rounded-lg">
              <LogOut className="w-5 h-5" /> Sign Out
            </button>
          </div>
        </nav>

        <section className="flex-1 p-8 overflow-y-auto">
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Billing & Plans</h2>
            <p className="text-gray-600 mb-8">You are currently on the <strong className="text-brand-600">Pro Plan ($15/mo)</strong>.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-6 border-2 border-brand-500 bg-brand-50 rounded-lg relative">
                <span className="absolute -top-3 right-6 bg-brand-500 text-white text-xs font-medium px-3 py-1 rounded-full">Current Plan</span>
                <h3 className="text-xl font-bold text-gray-900">Pro Plan</h3>
                <div className="text-4xl font-bold text-gray-900 my-4\">$15 <span className=\"text-lg text-gray-500 font-normal\">/month</span></div>
                <ul className=\"space-y-2 text-sm text-gray-700 mb-6 font-medium\">
                  <li className=\"flex items-center gap-2\"><svg className=\"w-4 h-4 text-brand-600\" fill=\"currentColor\" viewBox=\"0 0 20 20\"><path fillRule=\"evenodd\" d=\"M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z\" clipRule=\"evenodd\"></path></svg> 50,000 words/month</li>
                  <li className=\"flex items-center gap-2\"><svg className=\"w-4 h-4 text-brand-600\" fill=\"currentColor\" viewBox=\"0 0 20 20\"><path fillRule=\"evenodd\" d=\"M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z\" clipRule=\"evenodd\"></path></svg> Standard detector bypass</li>
                  <li className=\"flex items-center gap-2\"><svg className=\"w-4 h-4 text-brand-600\" fill=\"currentColor\" viewBox=\"0 0 20 20\"><path fillRule=\"evenodd\" d=\"M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z\" clipRule=\"evenodd\"></path></svg> 3 style memory slots</li>
                  <li className=\"flex items-center gap-2\"><svg className=\"w-4 h-4 text-brand-600\" fill=\"currentColor\" viewBox=\"0 0 20 20\"><path fillRule=\"evenodd\" d=\"M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z\" clipRule=\"evenodd\"></path></svg> Email support</li>
                </ul>
                <button className=\"w-full py-3 bg-white text-gray-900 text-sm font-medium hover:bg-gray-50 transition-colors border border-gray-300 rounded-lg\">Manage Subscription</button>
              </div>

              <div className=\"p-6 border-2 border-green-300 bg-white rounded-lg hover:border-green-500 transition-colors relative\">
                <span className=\"absolute -top-3 right-6 bg-green-500 text-white text-xs font-medium px-3 py-1 rounded-full\">Upgrade</span>
                <h3 className=\"text-xl font-bold text-gray-900\">Enterprise</h3>
                <div className=\"text-4xl font-bold text-gray-900 my-4\">$49 <span className=\"text-lg text-gray-500 font-normal\">/month</span></div>
                <ul className=\"space-y-2 text-sm text-gray-700 mb-6 font-medium\">
                  <li className=\"flex items-center gap-2\"><svg className=\"w-4 h-4 text-green-600\" fill=\"currentColor\" viewBox=\"0 0 20 20\"><path fillRule=\"evenodd\" d=\"M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z\" clipRule=\"evenodd\"></path></svg> Unlimited words</li>
                  <li className=\"flex items-center gap-2\"><svg className=\"w-4 h-4 text-green-600\" fill=\"currentColor\" viewBox=\"0 0 20 20\"><path fillRule=\"evenodd\" d=\"M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z\" clipRule=\"evenodd\"></path></svg> Deep stealth mode</li>
                  <li className=\"flex items-center gap-2\"><svg className=\"w-4 h-4 text-green-600\" fill=\"currentColor\" viewBox=\"0 0 20 20\"><path fillRule=\"evenodd\" d=\"M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z\" clipRule=\"evenodd\"></path></svg> Unlimited style memory</li>
                  <li className=\"flex items-center gap-2\"><svg className=\"w-4 h-4 text-green-600\" fill=\"currentColor\" viewBox=\"0 0 20 20\"><path fillRule=\"evenodd\" d=\"M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z\" clipRule=\"evenodd\"></path></svg> Priority support + API access</li>
                </ul>
                <button className=\"w-full py-3 bg-green-500 hover:bg-green-600 text-white text-sm font-medium transition-colors rounded-lg\">Upgrade Now</button>
              </div>
            </div>
          </div>

          <div className=\"mt-12 pt-8 border-t border-gray-200 space-y-6\">
            <h3 className=\"text-xl font-bold text-gray-900\">Payment Methods</h3>
            <div className=\"flex items-center justify-between p-5 bg-gray-50 border border-gray-200 rounded-lg\">
              <div className=\"flex items-center gap-4\">
                <div className=\"w-12 h-12 bg-gray-900 flex items-center justify-center text-white rounded\">
                  <CreditCard className=\"w-6 h-6\" />
                </div>
                <div>
                  <p className=\"font-medium text-gray-900\">Mastercard ending in 4242</p>
                  <p className=\"text-sm text-gray-600\">Expires 12/26</p>
                </div>
              </div>
              <button className=\"px-4 py-2 bg-white text-gray-900 border border-gray-300 text-sm font-medium hover:bg-gray-50 transition-colors rounded-lg\">Edit</button>
            </div>
            <button className=\"text-brand-600 hover:text-brand-700 text-sm font-medium\">+ Add payment method</button>
          </div>
        </section>
      </div>
    </div>
  );
}

