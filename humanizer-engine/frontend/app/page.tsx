import Link from 'next/link';
import { ArrowRight, CheckCircle2, ShieldCheck, Zap, Sparkles, MoveRight, BookOpen, Fingerprint, MousePointer2, Settings2, Languages, HelpCircle } from 'lucide-react';

export default function Home() {
  return (
    <div className="flex flex-col items-center">
      {/* 1. Hero Section */}
      <section className="relative overflow-hidden w-full bg-brand-50 pt-24 pb-32">
          {/* Abstract illustrative backgrounds */}
          <div className="absolute inset-0 z-0 opacity-10">
              <svg className="absolute top-10 left-10 w-64 h-64 animate-float" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><path fill="#f97316" d="M45.7,-76.4C58.9,-69.3,68.9,-54.6,76.5,-40.1C84.1,-25.6,89.3,-11.3,86.9,1.7C84.5,14.7,74.5,26.4,65.6,39.3C56.7,52.2,48.9,66.4,36.5,74C24.1,81.6,7.1,82.6,-8.8,80.1C-24.7,77.6,-39.5,71.6,-53.4,62.8C-67.3,54,-80.3,42.4,-86.2,27.5C-92.1,12.6,-90.9,-5.6,-83.4,-20.9C-75.9,-36.2,-62.1,-48.6,-48,-55.8C-33.9,-63,-19.5,-65,-4.4,-59.6C10.7,-54.2,21.4,-41.4,45.7,-76.4Z" transform="translate(100 100)"/></svg>
          </div>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
              <span className="inline-block py-1 px-3 rounded-full bg-brand-100 text-brand-800 font-medium text-xs mb-6 border border-brand-300">V3 Engine is Live</span>
              <h1 className="text-5xl md:text-7xl font-bold text-gray-900 tracking-tight leading-tight mb-8">
                  Bypass AI Detection.<br />
                  <span className="text-brand-600">Rank Higher on Google.</span>
              </h1>
              <p className="mt-4 max-w-3xl mx-auto text-xl text-gray-600 mb-10 leading-relaxed">
                  Transform ChatGPT blocks into authentic, human-like prose. Humara structurally rewrites definitions, vocabulary, and burstiness to achieve 100% human scores on Turnitin & Originality.
              </p>
              <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
                  <Link href="/app" className="bg-brand-500 hover:bg-brand-600 text-white px-8 py-4 text-lg font-semibold sketch-btn w-full sm:w-auto text-center flex items-center justify-center gap-2">
                      Try the Humanizer Free <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6"></path></svg>
                  </Link>
                  <Link href="/pricing" className="bg-white text-gray-900 px-8 py-4 text-lg font-semibold sketch-btn w-full sm:w-auto text-center flex items-center justify-center gap-2">
                      View Pricing
                  </Link>
              </div>

              {/* Sketch UI Representation */}
              <div className="mt-20 mx-auto max-w-4xl bg-white sketch-card p-6 text-left">
                  <div className="flex justify-between mb-4 border-b pb-4">
                      <div className="flex space-x-2">
                          <div className="w-3 h-3 bg-red-400 rounded-full"></div>
                          <div className="w-3 h-3 bg-yellow-400 rounded-full"></div>
                          <div className="w-3 h-3 bg-green-400 rounded-full"></div>
                      </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div>
                          <span className="text-xs font-medium text-gray-500">Input: Robotic AI</span>
                          <p className="text-gray-500 text-sm mt-2 opacity-50 italic">"Artificial intelligence has fundamentally transformed numerous sectors..."</p>
                          <div className="mt-6 flex items-center text-red-500 font-semibold"><svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"></path></svg> 98% AI Detected</div>
                      </div>
                      <div className="border-l pl-8 border-dashed border-gray-200">
                          <span className="text-xs font-medium text-brand-600">Output: Humara</span>
                          <p className="text-gray-800 text-sm mt-2 font-medium leading-relaxed">"These tools radically shift how we work. Instead of typing by hand, machines spot patterns we can't see, changing fields like healthcare and finance overnight."</p>
                          <div className="mt-6 flex items-center text-green-500 font-semibold"><svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path></svg> 100% Human Score</div>
                      </div>
                  </div>
              </div>
          </div>
      </section>

      {/* 2. Trust Logos */}
      <section className="py-10 bg-white border-y border-gray-100 w-full">
          <div className="max-w-7xl mx-auto px-4 text-center">
              <p className="text-sm font-medium text-gray-500 mb-6">Trusted by SEO agencies, freelancers, and students to bypass:</p>
              <div className="flex flex-wrap justify-center gap-8 opacity-60 grayscale hover:grayscale-0 transition-all">
                  <span className="font-semibold text-xl text-gray-800">Turnitin</span>
                  <span className="font-semibold text-xl text-blue-900 border-l-2 border-blue-900 pl-2">GPTZero</span>
                  <span className="font-semibold text-xl text-green-700">Originality.AI</span>
                  <span className="font-semibold text-xl text-amber-600">Copyleaks</span>
              </div>
          </div>
      </section>

      {/* 3. Problem Section */}
      <section className="py-24 bg-white w-full">
          <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-16 items-center">
              <div>
                  <svg className="w-full text-gray-200 sketch-card bg-gray-50" viewBox="0 0 400 300" fill="none"><rect width="400" height="300" fill="#f9fafb"/><path d="M100 150 L150 100 L200 180 L250 120 L300 200" stroke="#f87171" strokeWidth="8" strokeLinejoin="round" strokeLinecap="round"/><circle cx="300" cy="200" r="10" fill="#ef4444"/><text x="150" y="80" fill="#ef4444" fontFamily="sans-serif" fontWeight="bold" fontSize="16">Google Core Update Penalty</text></svg>
              </div>
              <div>
                  <h2 className="text-4xl font-bold text-gray-900 mb-6">AI Discovery is Destroying Rankings & Grades</h2>
                  <p className="text-lg text-gray-600 mb-6 leading-relaxed">Most content spinners just swap synonyms (spintax), resulting in unreadable essays or weirdly phrased articles. Advanced AI detectors catch them immediately because the underlying sentence structure (burstiness and perplexity) still flags as machine-written.</p>
                  <ul className="space-y-4 text-gray-800 font-medium">
                      <li className="flex items-start"><svg className="w-6 h-6 text-red-500 mr-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg> Google penalizes robotic "helpful content"</li>
                      <li className="flex items-start"><svg className="w-6 h-6 text-red-500 mr-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg> Academic institutions flag false positives</li>
                      <li className="flex items-start"><svg className="w-6 h-6 text-red-500 mr-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg> Clients reject obvious AI fluff ("Delve into the realm...")</li>
                  </ul>
              </div>
          </div>
      </section>

      {/* 4. How it works */}
      <section className="py-24 bg-brand-950 border-t-2 border-brand-200 w-full">
          <div className="max-w-7xl mx-auto px-6">
              <div className="text-center max-w-3xl mx-auto mb-16">
                  <h2 className="text-4xl font-bold text-gray-900 mb-4">How Humara Outsmarts the Bots</h2>
                  <p className="text-xl text-gray-600">We don't just swap synonyms. Our 8-Phase contextual pipeline fundamentally restructures your textlike a pro editor would.</p>
              </div>
              
              <div className="grid md:grid-cols-3 gap-8">
                  {/* Card 1 */}
                  <div className="bg-white p-8 sketch-card">
                      <div className="w-14 h-14 bg-brand-100 rounded-full flex items-center justify-center mb-6">
                          <span className="text-2xl font-bold text-brand-600">1</span>
                      </div>
                      <h3 className="text-2xl font-semibold mb-3">AI Pattern Purge</h3>
                      <p className="text-gray-600">We aggressively strip out ChatGPT markers ("fundamentally transformed", "in conclusion", "crucial") before altering structure.</p>
                  </div>
                  {/* Card 2 */}
                  <div className="bg-white p-8 sketch-card">
                      <div className="w-14 h-14 bg-brand-100 rounded-full flex items-center justify-center mb-6">
                          <span className="text-2xl font-bold text-brand-600">2</span>
                      </div>
                      <h3 className="text-2xl font-semibold mb-3">Structural Rewrite</h3>
                      <p className="text-gray-600">We break the predictable lengths of AI sentences, matching human-like "burstiness", making it impossible for detectors to flag.</p>
                  </div>
                  {/* Card 3 */}
                  <div className="bg-white p-8 sketch-card">
                      <div className="w-14 h-14 bg-brand-100 rounded-full flex items-center justify-center mb-6">
                          <span className="text-2xl font-bold text-brand-600">3</span>
                      </div>
                      <h3 className="text-2xl font-semibold mb-3">Tone Restoration</h3>
                      <p className="text-gray-600">Most bypassers sound like they were written by a 5-year-old. Humara adapts to your desired level (High School, PhD, or Journalist).</p>
                  </div>
              </div>
          </div>
      </section>

      {/* 6. SEO Content Block: AI Detection Explained */}
      <section className="py-20 bg-brand-50 border-t-2 border-brand-200 w-full">
          <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-12 items-center">
              <div>
                  <h2 className="text-3xl font-bold text-gray-900 mb-4">Why Turnitin and Originality Catch ChatGPT</h2>
                  <p className="text-gray-700 leading-relaxed mb-4">Language models like GPT-4 predict the most statistically probable next word. This generates highly regular, predictable text known as low perplexity and low burstiness. Human writers naturally vary sentence lengths and vocabulary choices.</p>
                  <p className="text-gray-700 leading-relaxed font-semibold">Humara injects controlled chaos ("burstiness") back into the document, breaking algorithmic predictability.</p>
              </div>
              <div className="bg-white p-6 sketch-card text-center">
                  <svg className="w-24 h-24 mx-auto text-brand-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path></svg>
                  <h3 className="text-xl font-semibold">Algorithmic Chaos Engine</h3>
              </div>
          </div>
      </section>

      {/* 7. Use Cases / Target Audience */}
      <section className="py-20 bg-white w-full">
          <div className="max-w-7xl mx-auto px-6 text-center">
              <h2 className="text-4xl font-bold text-gray-900 mb-12">Who Uses Humara?</h2>
              <div className="grid md:grid-cols-3 gap-8">
                  <div className="p-6">
                      <h3 className="text-2xl font-semibold text-gray-900 mb-2">SEO Freelancers</h3>
                      <p className="text-gray-600">Scale high-quality blog content without throwing Google's "Helpful Content Update" spam filters.</p>
                  </div>
                  <div className="p-6">
                      <h3 className="text-2xl font-semibold text-gray-900 mb-2">Academics & Students</h3>
                      <p className="text-gray-600">Ensure research papers and essay drafts aren't falsely flagged by university Turnitin integrations.</p>
                  </div>
                  <div className="p-6">
                      <h3 className="text-2xl font-bold text-gray-900 mb-2">Content Agencies</h3>
                      <p className="text-gray-600">Deliver undetectable web copy to clients without worrying about them running ZeroGPT checks.</p>
                  </div>
              </div>
          </div>
      </section>

      {/* 8. Testimonials/Reviews */}
      <section className="py-20 bg-gray-900 text-white w-full">
          <div className="max-w-7xl mx-auto px-6">
              <h2 className="text-center text-4xl font-black mb-16">Ranked #1 for Making AI Look Human</h2>
              <div className="grid md:grid-cols-2 gap-8">
                  <div className="bg-gray-800 p-8 sketch-card border-brand-500">
                      <div className="flex text-yellow-400 mb-4">★★★★★</div>
                      <p className="text-xl italic mb-6">"Humara saved our agency. We were getting smashed by the March Google core update. Re-running our content through the Ninja pipeline brought our rankings back in 3 weeks."</p>
                      <p className="font-bold">— Sarah T. (SEO Director)</p>
                  </div>
                  <div className="bg-gray-800 p-8 sketch-card border-brand-500">
                      <div className="flex text-yellow-400 mb-4">★★★★★</div>
                      <p className="text-xl italic mb-6">"Originality.ai was flagging my 100% human-typed articles. Humara tweaked the burstiness just enough that I always score 95%+ human now."</p>
                      <p className="font-bold">— Mike R. (Freelancer)</p>
                  </div>
              </div>
          </div>
      </section>

      <section className="py-24 bg-white w-full">
          <div className="max-w-7xl mx-auto px-6 text-center">
              <h2 className="text-4xl font-black text-gray-900 mb-16">The Ultimate Anti-Detection Feature Set</h2>
              <div className="grid md:grid-cols-2 gap-12 text-left">
                  {/* Feature */}
                  <div className="flex">
                      <div className="mr-6 bg-brand-100 p-4 rounded sketch-card h-16 w-16 flex-shrink-0 flex items-center justify-center"><svg className="w-8 h-8 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg></div>
                      <div>
                          <h4 className="text-xl font-bold text-gray-900 mb-2">Preserve Strict Meaning</h4>
                          <p className="text-gray-600">Unlike rudimentary spinners, our Context Analyzer maps protected entities and nouns, ensuring technical accuracy for medical or legal writing.</p>
                      </div>
                  </div>
                  {/* Feature */}
                  <div className="flex">
                      <div className="mr-6 bg-brand-100 p-4 rounded sketch-card h-16 w-16 flex-shrink-0 flex items-center justify-center"><svg className="w-8 h-8 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg></div>
                      <div>
                          <h4 className="text-xl font-bold text-gray-900 mb-2">On-Demand Ninja LLM Refinement</h4>
                          <p className="text-gray-600">Switch from Humara Mini (Local Rule-based) to Ninja (LLM-driven multipass) for articles that need supreme academic vocabulary adjustments.</p>
                      </div>
                  </div>
                   {/* Feature */}
                  <div className="flex">
                      <div className="mr-6 bg-brand-100 p-4 rounded sketch-card h-16 w-16 flex-shrink-0 flex items-center justify-center"><svg className="w-8 h-8 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"></path></svg></div>
                      <div>
                          <h4 className="text-xl font-bold text-gray-900 mb-2">Built-In 22x Multi-Detector</h4>
                          <p className="text-gray-600">Scan texts before and after. We query Turnitin, Originality, ZeroGPT, Copyleaks, Winston, and 17 others instantly to guarantee security.</p>
                      </div>
                  </div>
                   {/* Feature */}
                  <div className="flex">
                      <div className="mr-6 bg-brand-100 p-4 rounded sketch-card h-16 w-16 flex-shrink-0 flex items-center justify-center"><svg className="w-8 h-8 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path></svg></div>
                      <div>
                          <h4 className="text-xl font-bold text-gray-900 mb-2">Granular Quality Controls</h4>
                          <p className="text-gray-600">Easily dictate the 'Tone' (Academic, Professional, Neutral), toggle structural splitting, and apply post-processing refinement layers.</p>
                      </div>
                  </div>
              </div>
          </div>
      </section>

      {/* 9. Pricing */}
      <section className="py-24 bg-brand-100 w-full text-center">
          <div className="max-w-7xl mx-auto px-6 text-center">
              <h2 className="text-4xl font-black text-gray-900 mb-4">Straightforward Pricing</h2>
              <p className="text-xl text-gray-600 mb-16">Humanize text efficiently without breaking the bank.</p>
              <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto text-left">
                  {/* Free */}
                  <div className="bg-white p-8 sketch-card border-gray-200 border-2">
                      <h3 className="text-2xl font-bold text-gray-900 mb-2">Starter</h3>
                      <p className="text-gray-500 mb-6">Perfect to test Humara Mini.</p>
                      <p className="text-4xl font-black text-gray-900 mb-6">$0<span className="text-base text-gray-500 font-normal">/mo</span></p>
                      <ul className="space-y-3 mb-8 text-gray-600 font-medium">
                          <li>— 2,000 words limit</li>
                          <li>— Standard Mini Engine</li>
                          <li>— Basic AI Detection</li>
                      </ul>
                      <Link href="/signup" className="block w-full text-center text-gray-900 border-2 border-gray-900 font-bold py-3 hover:bg-gray-100 transition-colors sketch-btn">Sign Up Free</Link>
                  </div>
                  {/* Pro */}
                  <div className="bg-gray-900 p-8 sketch-card border-brand-500 border-2 transform md:-translate-y-4">
                      <span className="bg-brand-500 text-white font-bold text-xs uppercase tracking-widest py-1 px-3 rounded inline-block mb-4">Most Popular</span>
                      <h3 className="text-2xl font-bold text-white mb-2">Humara Pro</h3>
                      <p className="text-gray-400 mb-6">For content creators and pros.</p>
                      <p className="text-4xl font-black text-white mb-6">$19<span className="text-base text-gray-500 font-normal">/mo</span></p>
                      <ul className="space-y-3 mb-8 text-gray-300 font-medium">
                          <li>— 100,000 words</li>
                          <li>— Advanced Humara Pro Engine</li>
                          <li>— Full 22x Detector suite</li>
                          <li>— SEO Tone formatting</li>
                      </ul>
                      <Link href="/signup" className="block w-full text-center bg-brand-500 text-white border-2 border-brand-500 font-bold py-3 sketch-btn ring-0">Go Humara Pro</Link>
                  </div>
                  {/* Agency */}
                  <div className="bg-white p-8 sketch-card border-gray-200 border-2">
                      <h3 className="text-2xl font-bold text-gray-900 mb-2">Ninja Suite</h3>
                      <p className="text-gray-500 mb-6">Unlimited precision rules.</p>
                      <p className="text-4xl font-black text-gray-900 mb-6">$49<span className="text-base text-gray-500 font-normal">/mo</span></p>
                      <ul className="space-y-3 mb-8 text-gray-600 font-medium">
                          <li>— 500,000 words</li>
                          <li>— Advanced Ninja LLM Multi-pass</li>
                          <li>— API Access</li>
                          <li>— Early Access to V4</li>
                      </ul>
                      <Link href="/signup" className="block w-full text-center text-gray-900 border-2 border-gray-900 font-bold py-3 hover:bg-gray-100 transition-colors sketch-btn">Contact Us</Link>
                  </div>
              </div>
          </div>
      </section>

      {/* 10. Final CTA */}
      <section className="py-24 bg-white text-center border-t-2 border-gray-100 w-full flex flex-col items-center">
          <h2 className="text-4xl md:text-5xl font-black text-gray-900 mb-6">Stop Failing AI Tests.</h2>
          <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">Join over 50,000 users who trust Humara to write naturally, rank highly, and read perfectly.</p>
          <Link href="/app" className="bg-gray-900 text-white px-10 py-5 text-xl font-black sketch-btn inline-block tracking-wide hover:bg-brand-500 hover:border-brand-500 transition-colors">Start Humanizing Text</Link>
      </section>

    </div>
  );
}

