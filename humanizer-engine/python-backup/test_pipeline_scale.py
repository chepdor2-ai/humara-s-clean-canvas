"""Scale test: ~1000 words to test concurrent chunking & distribution shaping."""
import asyncio
import time
from llm_pipeline import run_pipeline_async
from nltk.tokenize import sent_tokenize

# ~1000 words of AI-generated text (simulating humanizer output with varied lengths)
sample = """The rise of renewable energy sources has reshaped how nations approach their power infrastructure and long-term sustainability goals. Solar panel installations across residential and commercial properties have grown by roughly forty percent in the last decade alone. Wind farms now dot coastlines and open plains, generating clean electricity for millions of households that previously depended on coal and natural gas. Battery storage technology has improved enough to make intermittent sources like solar and wind far more reliable than they were just five years ago, which is changing how grid operators plan for peak demand periods.

Governments around the world have responded with policy changes that encourage adoption of green energy while phasing out subsidies for fossil fuels. Tax credits for homeowners who install solar panels have been expanded in several countries, making the upfront cost more manageable for middle-income families. Carbon pricing mechanisms are being tested across multiple jurisdictions, though their long-term effectiveness remains a subject of debate among economists. Some critics argue that these policies place an unfair burden on industries that lack viable alternatives to petroleum-based processes, particularly in manufacturing and heavy transport sectors.

The automotive sector stands out as one area where the shift has been remarkably swift. Electric vehicle sales doubled between two thousand twenty and two thousand twenty-three across most major markets. Legacy automakers have announced plans to electrify their entire fleets by the end of this decade, investing billions into battery research and charging networks. Consumer attitudes have shifted as well; range anxiety has declined sharply now that most new electric cars can travel over three hundred miles on a single charge, and charging stations are becoming as common as gas stations in urban areas.

Agricultural practices are also evolving in response to environmental pressures and changing market conditions. Precision farming techniques, which rely on satellite data and automated equipment, have allowed farmers to reduce water usage by up to thirty percent while maintaining or even increasing crop yields. Organic farming has moved from a niche market to a mainstream choice for consumers who are concerned about pesticide residues and soil health. Vertical farming operations in urban centers are producing fresh greens year-round, reducing transportation costs and carbon emissions associated with long-distance food distribution. The challenge remains scaling these innovations to feed a global population expected to reach ten billion people by the middle of this century, which requires cooperation between governments, private industry, and research institutions.

Healthcare delivery has been transformed by digital technologies that connect patients with providers regardless of geographic distance. Telemedicine appointments now account for nearly a quarter of all primary care visits in the United States, a figure that was below five percent before the pandemic accelerated adoption. Remote monitoring devices allow doctors to track vital signs in real time, catching potential problems before they become emergencies that require expensive hospital stays. Electronic health records have streamlined administrative tasks, though concerns about data privacy and cybersecurity continue to grow as more sensitive information moves to cloud-based systems managed by third-party vendors.

Education systems have adapted to incorporate technology in ways that would have seemed unlikely just a decade ago. Online learning platforms offer courses from top universities to anyone with an internet connection, breaking down barriers that once limited access to quality instruction. Adaptive learning software adjusts lesson difficulty based on individual student performance, providing targeted practice where it is needed most. Teachers report that blended classroom models, which combine in-person instruction with digital resources, have improved engagement among students who previously struggled with traditional lecture formats. The debate continues over screen time limits and the social development impact of replacing face-to-face interaction with virtual alternatives, but the trajectory toward greater integration of technology in schools appears irreversible."""


async def main():
    words = len(sample.split())
    sents_in = sent_tokenize(sample)
    lengths_in = [len(s.split()) for s in sents_in]
    print("=" * 70)
    print(f"SCALE TEST — {words} words, {len(sents_in)} sentences")
    print("=" * 70)
    print(f"Input lengths: min={min(lengths_in)}, max={max(lengths_in)}, avg={sum(lengths_in)/len(lengths_in):.1f}")
    print()

    start = time.time()
    result = await run_pipeline_async(sample, no_contractions=True)
    elapsed = time.time() - start

    print()
    sents = sent_tokenize(result)
    lengths = [len(s.split()) for s in sents]
    print(f"OUTPUT: {len(result.split())} words, {len(sents)} sentences")
    print(f"Lengths: min={min(lengths)}, max={max(lengths)}, avg={sum(lengths)/len(lengths):.1f}")

    violations = [l for l in lengths if l < 10 or l > 50]
    print(f"Violations (<10 or >50): {violations if violations else 'None'}")

    buckets = {(10, 15): 0, (16, 25): 0, (26, 35): 0, (36, 45): 0, (46, 50): 0}
    for l in lengths:
        for (lo, hi) in buckets:
            if lo <= l <= hi:
                buckets[(lo, hi)] += 1
                break
    total = len(lengths)
    print("\nDistribution:")
    for (lo, hi), count in sorted(buckets.items()):
        pct = (count / total * 100) if total else 0
        target = {(10,15): 6, (16,25): 13, (26,35): 28, (36,45): 31, (46,50): 22}[(lo,hi)]
        print(f"  {lo}-{hi} words: {count} ({pct:.0f}%) [target: {target}%]")

    has_emdash = "\u2014" in result or "\u2013" in result
    has_semicolon = ";" in result
    print(f"\nEm-dashes: {'FOUND (BAD)' if has_emdash else 'None (GOOD)'}")
    print(f"Semicolons: {'FOUND (BAD)' if has_semicolon else 'None (GOOD)'}")
    print(f"\nTotal time: {elapsed:.1f}s (target: <5s for 5000 words)")
    print(f"Projected 5000-word time: ~{elapsed:.1f}s (concurrent — same wall time)")


asyncio.run(main())
