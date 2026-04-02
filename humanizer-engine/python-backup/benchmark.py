"""
Multi-Detector Accuracy Benchmark
==================================
Uses sklearn.metrics to compute real classification accuracy against a
labeled corpus of known-AI and known-human texts.

Metrics computed:
  - Accuracy, Precision, Recall, F1 Score
  - ROC AUC (area under the receiver operating characteristic curve)
  - Confusion Matrix
  - Per-threshold analysis
  - Error analysis (false positives / false negatives)
"""

import sys, os, time
sys.path.insert(0, os.path.dirname(__file__))

import numpy as np
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, confusion_matrix, classification_report,
    roc_curve
)
from multi_detector import MultiDetector

# ============================================================================
# LABELED BENCHMARK CORPUS
# ============================================================================
# label: 1 = AI-generated, 0 = Human-written
# Sources: diverse styles, lengths, topics

BENCHMARK_CORPUS = [
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # AI-GENERATED TEXTS (label=1)
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    # AI-01: Classic AI essay style - formal, hedged, comprehensive
    (1, "The impact of artificial intelligence on modern society cannot be overstated. "
        "As technological advancements continue to reshape various industries, it is "
        "crucial to examine the multifaceted implications of these developments. "
        "Furthermore, the integration of machine learning algorithms into everyday "
        "applications has significantly enhanced efficiency and productivity across "
        "numerous sectors. Moreover, the utilization of natural language processing "
        "has revolutionized the way humans interact with technology. Consequently, "
        "organizations must adapt their strategies to leverage these innovative tools "
        "effectively. Additionally, the ethical considerations surrounding AI deployment "
        "necessitate careful examination and robust governance frameworks."),

    # AI-02: Academic AI - policy analysis
    (1, "Education policy reform has been a subject of considerable debate among "
        "scholars and policymakers alike. The implementation of standardized testing "
        "frameworks has yielded mixed results in terms of student achievement and "
        "educational equity. Research indicates that comprehensive approaches to "
        "curriculum development, rather than narrow metric-based evaluations, tend "
        "to produce more holistic educational outcomes. Furthermore, the allocation "
        "of resources plays a pivotal role in determining the effectiveness of "
        "educational interventions. It is therefore imperative that stakeholders "
        "consider a wide range of factors when formulating education policy."),

    # AI-03: AI explaining a concept
    (1, "Climate change represents one of the most pressing challenges facing "
        "humanity in the 21st century. The scientific consensus indicates that "
        "anthropogenic greenhouse gas emissions are the primary driver of global "
        "warming. The consequences of rising temperatures include more frequent "
        "extreme weather events, rising sea levels, and disruptions to ecosystems "
        "worldwide. To address this challenge, a multifaceted approach is required, "
        "encompassing renewable energy adoption, sustainable land use practices, "
        "and international cooperation. The Paris Agreement serves as a foundational "
        "framework for global climate action, though many experts argue that more "
        "ambitious targets are necessary to limit warming to 1.5 degrees Celsius."),

    # AI-04: AI marketing/business content
    (1, "In today's rapidly evolving digital landscape, businesses must embrace "
        "innovative strategies to maintain competitive advantage. The proliferation "
        "of social media platforms has fundamentally transformed consumer engagement "
        "and brand communication. Organizations that effectively leverage data-driven "
        "insights can optimize their marketing campaigns and enhance customer "
        "experiences. Moreover, the integration of artificial intelligence and "
        "automation tools enables companies to streamline operations and reduce costs. "
        "It is essential for business leaders to stay abreast of emerging trends and "
        "adapt their approaches accordingly to thrive in this dynamic environment."),

    # AI-05: AI informational content
    (1, "The human brain is a remarkably complex organ that serves as the central "
        "processing unit of the nervous system. Comprising approximately 86 billion "
        "neurons, the brain facilitates a wide range of cognitive functions including "
        "memory, reasoning, and emotional regulation. Neuroscientific research has "
        "revealed that neuroplasticity allows the brain to reorganize and form new "
        "neural connections throughout an individual's lifespan. This adaptability "
        "is particularly significant in the context of learning and recovery from "
        "neurological injuries. Understanding the intricacies of brain function "
        "remains a fundamental objective of contemporary neuroscience."),

    # AI-06: AI-style persuasive essay
    (1, "Renewable energy sources offer a viable and sustainable alternative to "
        "fossil fuels. Solar, wind, and hydroelectric power have demonstrated "
        "significant potential in reducing carbon emissions and mitigating climate "
        "change. The declining costs of renewable energy technologies have made "
        "them increasingly accessible to both developed and developing nations. "
        "Furthermore, the transition to clean energy creates new employment "
        "opportunities and stimulates economic growth. It is imperative that "
        "governments implement supportive policies and incentives to accelerate "
        "the adoption of renewable energy solutions on a global scale."),

    # AI-07: AI technical explanation
    (1, "Machine learning algorithms can be broadly categorized into three main "
        "types: supervised learning, unsupervised learning, and reinforcement "
        "learning. Supervised learning involves training a model on labeled data, "
        "enabling it to make predictions on unseen examples. In contrast, "
        "unsupervised learning identifies patterns and structures within unlabeled "
        "datasets. Reinforcement learning employs a reward-based mechanism to train "
        "agents to make optimal decisions in complex environments. Each approach "
        "has distinct advantages and is suited to different types of problems and "
        "applications in the field of artificial intelligence."),

    # AI-08: AI health/wellness content
    (1, "Maintaining a balanced diet is essential for overall health and well-being. "
        "Nutritional research consistently demonstrates that a diet rich in fruits, "
        "vegetables, whole grains, and lean proteins provides the necessary nutrients "
        "for optimal bodily function. Additionally, adequate hydration plays a crucial "
        "role in supporting metabolic processes and cognitive performance. Regular "
        "physical activity, combined with proper nutrition, significantly reduces "
        "the risk of chronic diseases such as cardiovascular disease, diabetes, and "
        "obesity. It is advisable to consult with healthcare professionals to develop "
        "a personalized dietary plan that meets individual nutritional requirements."),

    # AI-09: AI history content
    (1, "The Industrial Revolution marked a transformative period in human history, "
        "fundamentally altering the socioeconomic landscape of Western civilization. "
        "Beginning in the late 18th century, the mechanization of production processes "
        "led to unprecedented increases in manufacturing output and economic growth. "
        "The development of steam power and subsequent innovations in transportation "
        "facilitated the expansion of trade networks and urbanization. However, this "
        "period was also characterized by significant social challenges, including "
        "labor exploitation, environmental degradation, and widening income inequality. "
        "The legacy of the Industrial Revolution continues to shape contemporary "
        "economic and social structures."),

    # AI-10: AI-style comparative analysis
    (1, "When comparing traditional and online education modalities, several key "
        "differences emerge. Traditional classroom instruction offers face-to-face "
        "interaction, structured schedules, and immediate feedback from instructors. "
        "Conversely, online learning provides flexibility, accessibility, and the "
        "ability to learn at one's own pace. Research suggests that both approaches "
        "can be equally effective when implemented with appropriate pedagogical "
        "strategies. The hybrid model, which combines elements of both modalities, "
        "has gained increasing popularity as it leverages the strengths of each "
        "approach while mitigating their respective limitations."),

    # AI-11: AI listicle/structured content
    (1, "Effective time management is a critical skill that can significantly enhance "
        "productivity and reduce stress. Setting clear, achievable goals provides "
        "direction and motivation for daily activities. Prioritizing tasks based on "
        "urgency and importance helps individuals allocate their time and resources "
        "efficiently. Additionally, minimizing distractions and creating a conducive "
        "work environment are essential components of successful time management. "
        "It is also beneficial to incorporate regular breaks and self-care practices "
        "to maintain focus and prevent burnout. By implementing these strategies "
        "consistently, individuals can optimize their performance and achieve a "
        "healthier work-life balance."),

    # AI-12: AI creative writing attempt (still formulaic)
    (1, "The city skyline stretched endlessly against the horizon, its towering "
        "structures reflecting the golden hues of the setting sun. The bustling "
        "streets below were alive with the rhythm of daily life, as pedestrians "
        "navigated the intricate network of sidewalks and crossings. The aroma "
        "of freshly brewed coffee drifted from nearby cafes, mingling with the "
        "subtle fragrance of blooming flowers in window boxes. In this urban "
        "tapestry, every individual played a unique role, contributing to the "
        "vibrant mosaic that defined the city's character. It was a place where "
        "dreams converged and possibilities seemed limitless."),

    # AI-13: AI financial analysis
    (1, "Global financial markets have experienced significant volatility in recent "
        "years, driven by a confluence of macroeconomic factors. Interest rate "
        "adjustments by central banks, geopolitical tensions, and supply chain "
        "disruptions have collectively contributed to market uncertainty. Investors "
        "are increasingly diversifying their portfolios to mitigate risk and "
        "capitalize on emerging opportunities. The rise of cryptocurrency and "
        "decentralized finance has introduced new dimensions to the financial "
        "landscape. Analysts emphasize the importance of maintaining a long-term "
        "investment perspective and conducting thorough due diligence when navigating "
        "these complex market conditions."),

    # AI-14: AI environmental science
    (1, "Biodiversity conservation is a critical environmental priority that requires "
        "coordinated efforts at local, national, and international levels. The loss "
        "of habitat due to deforestation, urbanization, and agricultural expansion "
        "poses a significant threat to numerous plant and animal species. Protected "
        "areas and wildlife corridors serve as essential mechanisms for preserving "
        "ecological integrity and facilitating species migration. Furthermore, "
        "community-based conservation initiatives have demonstrated effectiveness "
        "in engaging local populations and promoting sustainable resource management. "
        "The integration of scientific research and indigenous knowledge can enhance "
        "conservation strategies and contribute to long-term environmental sustainability."),

    # AI-15: AI psychology/self-help
    (1, "Emotional intelligence encompasses the ability to recognize, understand, and "
        "manage one's own emotions while also being attuned to the emotions of others. "
        "Research has shown that individuals with high emotional intelligence tend to "
        "exhibit stronger interpersonal skills, better conflict resolution abilities, "
        "and greater overall life satisfaction. Developing emotional intelligence "
        "involves cultivating self-awareness, practicing empathy, and enhancing "
        "communication skills. Organizations increasingly recognize the value of "
        "emotional intelligence in leadership and team dynamics. By fostering "
        "emotional intelligence, individuals can improve both their personal "
        "relationships and professional performance."),

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # HUMAN-WRITTEN TEXTS (label=0)
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    # Human-01: Casual personal narrative
    (0, "I was walking to the store yesterday and bumped into an old friend. "
        "We hadn't talked in years - probably since high school? Anyway, she told me "
        "about her new job at some tech startup. Sounds cool but also kinda stressful. "
        "I grabbed some milk and headed home. The weather was nice, at least. "
        "My dog went crazy when I opened the door, like he always does. "
        "Made myself a sandwich and watched some TV. Nothing great was on though."),

    # Human-02: Informal opinion piece
    (0, "Honestly, I think people overthink social media way too much. Yeah it has "
        "problems - who doesn't know that by now? But I've reconnected with so many "
        "friends through Instagram and kept up with family on Facebook. My aunt posts "
        "the weirdest stuff sometimes lol. The trick is not spending 5 hours scrolling. "
        "Set a timer if you need to. Delete the apps you don't use. It's really not "
        "that deep."),

    # Human-03: Personal blog about cooking
    (0, "So I tried making sourdough for the first time last weekend and oh my god "
        "what a disaster. The starter looked fine - bubbly and everything - but I "
        "think I didn't let the dough rise long enough? It came out of the oven "
        "looking like a frisbee. My roommate laughed so hard she couldn't breathe. "
        "I'm gonna try again this weekend though. Found a YouTube video that explains "
        "the stretching and folding method better. Third time's the charm right?"),

    # Human-04: Forum post about a technical problem
    (0, "Has anyone else had issues with their printer randomly going offline? I've "
        "tried unplugging it, reinstalling the drivers, everything. It works fine for "
        "like 2 days then just... stops. The light blinks three times which apparently "
        "means something but the manual is useless. Thinking about just buying a new "
        "one at this point but that feels wasteful. HP LaserJet Pro if that matters."),

    # Human-05: Personal reflection
    (0, "Moving to a new city in your 30s is weird. You don't make friends the same "
        "way you did in college - you can't just leave your dorm door open and see who "
        "walks by. I joined a running group which helps, but it still feels forced "
        "sometimes. The other day someone invited me to a board game night and I almost "
        "said no because I was tired, but I went and actually had a great time. Small "
        "wins I guess."),

    # Human-06: Product review
    (0, "Bought these headphones on a whim and honestly? Best impulse purchase I've "
        "made in ages. The noise canceling is solid - not Bose level but pretty close "
        "for half the price. Battery lasts about 20 hours which is enough for my "
        "commute plus some. Only complaint is the ear cups get a bit warm after a "
        "couple hours but that might just be my big head. Would definitely recommend "
        "if you're looking for something under $100."),

    # Human-07: Sports commentary (casual)
    (0, "What a game last night! I haven't screamed at my TV like that in months. "
        "When Rodriguez hit that three-pointer with 4 seconds left I literally jumped "
        "off my couch. My neighbor probably thinks I'm insane. The refs were terrible "
        "though - that call in the third quarter was absolutely ridiculous and everyone "
        "knows it. Still, the team pulled through and that's what matters. Playoffs "
        "baby!"),

    # Human-08: Travel writing (personal)
    (0, "Thailand was nothing like I expected. Everyone told me it'd be super touristy "
        "but we rented a scooter and rode up into the mountains near Chiang Mai, and "
        "there were these tiny villages where nobody spoke English and the food was "
        "incredible. One lady made us this spicy green curry that literally made me "
        "sweat through my shirt. We stayed in a guesthouse for like $12 a night. The "
        "mattress was basically a board with a sheet on it but I didn't care because "
        "we'd been hiking all day and I was dead tired."),

    # Human-09: Parenting rant
    (0, "Nobody warns you about the homework situation in third grade. My kid came "
        "home with a project about the solar system and we were up until 10pm gluing "
        "styrofoam balls together. He wanted Saturn's rings to be accurate which meant "
        "cutting these tiny pieces of cardboard for like an hour. Then the cat knocked "
        "it over. I may have said a word I shouldn't have. The project is due tomorrow "
        "and I'm seriously considering calling in sick to help him rebuild it."),

    # Human-10: Philosophical musing (informal)
    (0, "You know what's absolutely wild? We're all just floating on a rock hurtling "
        "through space at thousands of miles per hour and most days I'm stressed about "
        "emails. Like, perspective check. I started taking walks without my phone "
        "recently and it's been kind of amazing. Just noticing things - the way light "
        "hits buildings at 5pm, birds arguing in trees, the old guy who always sits on "
        "that bench reading his newspaper. Tiny mundane beautiful things."),

    # Human-11: Work frustration
    (0, "Three meetings today that could have been emails. THREE. The first one lasted "
        "45 minutes and the only outcome was scheduling another meeting. I'm not even "
        "joking. Then my manager asked me to 'circle back' on something I already sent "
        "him twice. I found the email, forwarded it again, and cc'd his boss because "
        "honestly I'm done. This company runs on coffee and passive-aggressive Slack "
        "messages."),

    # Human-12: Recipe sharing (conversational)
    (0, "Ok here's my grandma's chili recipe that everyone always asks about. Start "
        "with a pound of ground beef - she used chuck but whatever's cheap works. "
        "Brown it with half an onion, couple cloves of garlic. Drain the grease (she "
        "never did but doctors and whatever). Then dump in two cans of kidney beans, "
        "a can of tomato sauce, tablespoon of chili powder, pinch of cumin. Let it "
        "simmer for like an hour. The secret is a square of dark chocolate at the end - "
        "sounds weird but trust me. Serve with crackers not that fancy bread stuff."),

    # Human-13: Gardening blog
    (0, "My tomato plants are finally producing after weeks of nothing. I was getting "
        "worried because my neighbor's looked amazing and mine were still just green "
        "leaves. Turns out I was overwatering - go figure. Cut back to twice a week "
        "and boom, little yellow flowers everywhere. Now there's about a dozen green "
        "tomatoes hanging there taunting me. The waiting game is the worst part. My "
        "basil is going crazy though so at least I'll have that for the caprese."),

    # Human-14: College student writing
    (0, "Finals week is going to destroy me. I have three exams in two days and a "
        "paper due Friday that I haven't started. The library is packed - literally "
        "had to sit on the floor yesterday because every table was taken. Running on "
        "Red Bull and sheer panic at this point. My study group fell apart because "
        "Jake and Maria had a fight about something stupid so now it's just me and "
        "Connor trying to figure out organic chemistry. We're so screwed."),

    # Human-15: Elder person reminiscing
    (0, "When I was growing up, we didn't have any of these gadgets. Saturday mornings "
        "meant cartoons on the one TV in the house - if your brother didn't hog it "
        "first. We'd ride our bikes to the creek and catch crawdads with our bare hands. "
        "Came home covered in mud and my mother would holler from the porch. Dinner was "
        "at six sharp, no arguments. I miss that simplicity sometimes, though I won't "
        "lie - I do love being able to video call my grandkids across the country."),
]


def run_benchmark():
    """Run the full benchmark and compute metrics."""
    print("=" * 72)
    print("  MULTI-DETECTOR ACCURACY BENCHMARK")
    print("  Using sklearn.metrics on labeled corpus")
    print("=" * 72)

    detector = MultiDetector()

    # Ground truth and predictions
    y_true = []      # actual labels (1=AI, 0=human)
    y_scores = []    # continuous AI probability [0-100]
    y_pred = []      # binary predictions (1=AI, 0=human)
    results = []     # full result objects

    total = len(BENCHMARK_CORPUS)
    print(f"\nRunning {total} samples through 22-engine detector...\n")

    t0 = time.time()
    for i, (label, text) in enumerate(BENCHMARK_CORPUS):
        result = detector.analyze(text)
        score = result["summary"]["overall_ai_score"]
        verdict = result["summary"]["overall_verdict"]

        y_true.append(label)
        y_scores.append(score / 100.0)  # normalize to [0, 1] for ROC AUC
        y_pred.append(1 if verdict in ("AI-Generated", "Likely AI") else 0)

        results.append({
            "index": i,
            "label": label,
            "score": score,
            "verdict": verdict,
            "correct": (label == 1 and verdict in ("AI-Generated", "Likely AI")) or
                       (label == 0 and verdict in ("Human-Written", "Mixed / Uncertain")),
            "text_preview": text[:80] + "...",
        })

        tag = "AI" if label == 1 else "HU"
        status = "✓" if results[-1]["correct"] else "✗"
        print(f"  [{status}] {i+1:2d}/{total} [{tag}] Score: {score:5.1f}% → {verdict}")

    elapsed = time.time() - t0

    y_true = np.array(y_true)
    y_scores = np.array(y_scores)
    y_pred = np.array(y_pred)

    # ── Core Metrics ──
    accuracy = accuracy_score(y_true, y_pred)
    precision = precision_score(y_true, y_pred, zero_division=0)
    recall = recall_score(y_true, y_pred, zero_division=0)
    f1 = f1_score(y_true, y_pred, zero_division=0)
    roc_auc = roc_auc_score(y_true, y_scores)

    # ── Confusion Matrix ──
    cm = confusion_matrix(y_true, y_pred)
    tn, fp, fn, tp = cm.ravel()

    # ── Score Statistics ──
    ai_scores = [r["score"] for r in results if r["label"] == 1]
    human_scores = [r["score"] for r in results if r["label"] == 0]

    print(f"\n{'='*72}")
    print(f"  RESULTS")
    print(f"{'='*72}")

    print(f"\n  ┌─────────────────────────────────────────────┐")
    print(f"  │  CLASSIFICATION METRICS                      │")
    print(f"  ├─────────────────────────────────────────────┤")
    print(f"  │  Accuracy     : {accuracy*100:6.1f}%                     │")
    print(f"  │  Precision    : {precision*100:6.1f}%                     │")
    print(f"  │  Recall       : {recall*100:6.1f}%                     │")
    print(f"  │  F1 Score     : {f1*100:6.1f}%                     │")
    print(f"  │  ROC AUC      : {roc_auc:.4f}                      │")
    print(f"  └─────────────────────────────────────────────┘")

    print(f"\n  ┌─────────────────────────────────────────────┐")
    print(f"  │  CONFUSION MATRIX                            │")
    print(f"  ├─────────────────────────────────────────────┤")
    print(f"  │              Predicted:  Human    AI         │")
    print(f"  │  Actual Human:          {tn:4d}    {fp:4d}         │")
    print(f"  │  Actual AI:             {fn:4d}    {tp:4d}         │")
    print(f"  ├─────────────────────────────────────────────┤")
    print(f"  │  True Positives  (AI→AI)   : {tp:3d}              │")
    print(f"  │  True Negatives  (Hu→Hu)   : {tn:3d}              │")
    print(f"  │  False Positives (Hu→AI)   : {fp:3d}              │")
    print(f"  │  False Negatives (AI→Hu)   : {fn:3d}              │")
    print(f"  └─────────────────────────────────────────────┘")

    print(f"\n  ┌─────────────────────────────────────────────┐")
    print(f"  │  SCORE DISTRIBUTION                          │")
    print(f"  ├─────────────────────────────────────────────┤")
    print(f"  │  AI texts     (n={len(ai_scores):2d}):                    │")
    print(f"  │    Mean  : {np.mean(ai_scores):6.1f}%                    │")
    print(f"  │    Median: {np.median(ai_scores):6.1f}%                    │")
    print(f"  │    Min   : {np.min(ai_scores):6.1f}%                    │")
    print(f"  │    Max   : {np.max(ai_scores):6.1f}%                    │")
    print(f"  │    Std   : {np.std(ai_scores):6.1f}%                    │")
    print(f"  │                                             │")
    print(f"  │  Human texts  (n={len(human_scores):2d}):                    │")
    print(f"  │    Mean  : {np.mean(human_scores):6.1f}%                    │")
    print(f"  │    Median: {np.median(human_scores):6.1f}%                    │")
    print(f"  │    Min   : {np.min(human_scores):6.1f}%                    │")
    print(f"  │    Max   : {np.max(human_scores):6.1f}%                    │")
    print(f"  │    Std   : {np.std(human_scores):6.1f}%                    │")
    print(f"  │                                             │")
    print(f"  │  Separation   : {np.mean(ai_scores)-np.mean(human_scores):6.1f} pts              │")
    print(f"  └─────────────────────────────────────────────┘")

    # ── Optimal Threshold Analysis ──
    fpr, tpr, thresholds = roc_curve(y_true, y_scores)
    # Youden's J statistic: optimal point on ROC curve
    j_scores = tpr - fpr
    best_idx = np.argmax(j_scores)
    best_threshold = thresholds[best_idx] * 100  # convert back to %

    print(f"\n  ┌─────────────────────────────────────────────┐")
    print(f"  │  OPTIMAL THRESHOLD (Youden's J)              │")
    print(f"  ├─────────────────────────────────────────────┤")
    print(f"  │  Best threshold : {best_threshold:5.1f}%                   │")
    print(f"  │  TPR at best    : {tpr[best_idx]*100:5.1f}%                   │")
    print(f"  │  FPR at best    : {fpr[best_idx]*100:5.1f}%                   │")
    print(f"  │  J statistic    : {j_scores[best_idx]:.4f}                    │")
    print(f"  └─────────────────────────────────────────────┘")

    # ── Threshold sweep ──
    print(f"\n  THRESHOLD SWEEP:")
    print(f"  {'Threshold':>10s}  {'Accuracy':>8s}  {'Precision':>9s}  {'Recall':>6s}  {'F1':>6s}")
    print(f"  {'─'*10}  {'─'*8}  {'─'*9}  {'─'*6}  {'─'*6}")
    for thr in [30, 35, 40, 45, 50, 55, 60, 65, 70]:
        t_pred = (y_scores * 100 >= thr).astype(int)
        t_acc = accuracy_score(y_true, t_pred)
        t_prec = precision_score(y_true, t_pred, zero_division=0)
        t_rec = recall_score(y_true, t_pred, zero_division=0)
        t_f1 = f1_score(y_true, t_pred, zero_division=0)
        marker = " ◄" if abs(thr - best_threshold) < 5 else ""
        print(f"  {thr:>9d}%  {t_acc*100:7.1f}%  {t_prec*100:8.1f}%  {t_rec*100:5.1f}%  {t_f1*100:5.1f}%{marker}")

    # ── Error Analysis ──
    errors = [r for r in results if not r["correct"]]
    if errors:
        print(f"\n  ERROR ANALYSIS ({len(errors)} misclassifications):")
        print(f"  {'─'*68}")
        for e in errors:
            actual = "AI" if e["label"] == 1 else "Human"
            print(f"  [{actual:5s}] Score: {e['score']:5.1f}% → {e['verdict']}")
            print(f"         {e['text_preview']}")
    else:
        print(f"\n  PERFECT CLASSIFICATION — No errors!")

    print(f"\n  ┌─────────────────────────────────────────────┐")
    print(f"  │  Runtime: {elapsed:.2f}s for {total} samples             │")
    print(f"  │  Engine:  22 detectors, 20 signals           │")
    print(f"  └─────────────────────────────────────────────┘")

    return {
        "accuracy": accuracy,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "roc_auc": roc_auc,
        "confusion_matrix": cm,
        "ai_mean": np.mean(ai_scores),
        "human_mean": np.mean(human_scores),
        "best_threshold": best_threshold,
    }


if __name__ == "__main__":
    run_benchmark()
