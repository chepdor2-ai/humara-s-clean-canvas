# Humara Canvas – The Stealth AI Humanization Engine

Humara Canvas is the industry's most advanced, multi-tiered text humanization and anti-detection pipeline. Designed to effortlessly evade contemporary AI forensic detectors (Turnitin, ZeroGPT, Pangram, Originality AI), Humara Canvas implements parallel architectures bridging deterministic heuristic cleansing with highly-tuned Large Language Model (LLM) semantic restructuring.

---

## 🚀 Engine Architecture & Flow

Humara Canvas does not rely on a single humanizer method. Instead, it utilizes over **20 independent engines** tailored to specific workloads, detection environments, and formatting requirements. They are broken down into three main categories:

### 1. Deterministic Non-LLM Engines (The Nuru Pipeline)
These engines do not use LLMs for transformation. They are immune to systemic LLM hallucination and ensure absolute semantic persistence.

*   **Nuru 2.0 (`nuru_v2`)**: The flagship non-LLM iterative polisher. Driven entirely by curated typescript dictionaries. Nuru natively enforces a minimum 10-pass iteration loop. Each pass restructures phrases, forces grammatical variation, and limits overlap. After the loops, it leverages an independent 6-phase heuristic detector cleanse targeted mathematically at:
    *   **ZeroGPT:** Transition stripping and reduction of uniform structure.
    *   **Surfer SEO:** Robotic factual list disruption.
    *   **Originality AI:** Adjective-noun predictability subversion.
    *   **GPTZero:** Mathematical burstiness/variance augmentation.
    *   **Pangram:** Punctuation rhythm and deep-structural watermark disruption.
    *   **Turnitin:** Academic transitional fluff elimination.
*   **Nuru 1.0 (`nuru`)**: Legacy, lightweight dictionary-swap iteration model. Faster, but lacks the rigorous 10-loop heuristics.

### 2. LLM Native Core Restructurers
These models employ custom system-prompted foundation models, PyTorch deployments, or specialized T5 integrations to intrinsically shift probabilities from AI to Human.

*   **Humara V3.3 / Humara 2.4 (`humara_v3_3`)**: The heaviest, most aggressive semantic restructurer. Entirely rewrites tone, narrative pacing, and sentence flow to brute-force through strict detection.
*   **Easy / Humara 2.2 (`easy`)**: A balanced standard restructurer focused on preserving general readability without completely destroying the initial formatting.
*   **Ozone / Humara 2.1 (`ozone`)**: An isolated, standalone engine. Ozone incorporates its *own* robust internal post-processing pipeline and fundamentally bypasses the global Universal Post-Processing layer for incredible speed advantages.
*   **Oxygen Core (`oxygen`)**: Fast, streamlined underlying restructuring logic.
*   **Oxygen Server Integrations (`oxygen3`, `oxygen_t5`)**: Bridges directly to local or externally hosted HuggingFace/PyTorch servers. Operates natively on sequence-to-sequence machine translation mapped dynamically (using `fast`, `turbo`, or `aggressive` inference layers).
*   **King & Apex (`king`, `apex`)**: High-availability remote server integrations for specific load-balanced processing queues.
*   **Dipper & Humarin (`dipper`, `humarin`)**: Specialized neural models focused heavily on aggressive synonym substitution and paraphrasing using raw tensor computation (frequently leveraging remote GPU architecture).
*   **Omega (`omega`)**: A specialized formatting preservation model highly capable of ensuring headers, quotes, and mathematical syntax remain perfectly intact during rewrites.

### 3. "Shadow" Ensembles & Orchestrators
Rather than running a single phase, these are complex *Orchestrators* that push text through sequential, multi-engine pipelines. 

*   **Ninja Series (`ninja_2`, `ninja_3`, `ninja_4`, `ninja_5`)**: Uniquely alters the authorial persona. Designed to strip the "student-academic" tone frequently flagged by Turnitin out of text. It implements a pre-2000s encyclopedic reference persona before layering the text through further Nuru-style pipeline reductions to ensure stealth.
*   **Ghost Pro Wiki / Ghost Trial (`ghost_pro_wiki`, `ghost_trial_2`)**: Radically enforces encyclopedic, stark, factual density. Ghost actively excises standard LLM adjectives ("vital", "crucial", "tapestry") leaving behind purely utilitarian, indistinguishable information blocks.
*   **Conscusion Series (`conscusion_1`, `conscusion_12`)**: Academic preservation logic blocks. Shifts syntactical order significantly while protecting crucial terminology.
*   **Humara V1.3 (`humara_v1_3`)**: The classical pipeline. Runs text through structured LLM formatting followed by custom validation phases specifically targeted at legacy AI detection software.

---

## 🛠 Project Structure

*   **/app/api:** Master API routing. Contains both batch processing (`/humanize`) and real-time Server-Sent Events (`/humanize-stream`) to pipe token-by-token transformation feeds securely to the client.
*   **/lib/engine:** The brain. Contains isolated modules for `stealth` (Nuru), `humara` configurations, shared orchestration templates, and detector emulation logic.
*   **/dictionaries:** Specialized arrays of complex phrases, AI-watermarks, and lexical heuristics completely isolated from LLM prompt-engineering.
*   **/scripts:** Rapid integration deployment pipelines and unit testing utilities.

## 💻 Getting Started

Ensure dependencies are installed via `npm` or `bun`:

```bash
# 1. Install packages
npm install
# or
bun install

# 2. Run the development server
npm run dev
# or
bun run dev
```

Navigate to [http://localhost:3000](http://localhost:3000) to interface with the web app. React Server Components and parallel layout systems map instantly as `app/page.tsx` is edited.

## 📦 Deployment Guides

Humara Canvas relies natively on Vercel deployment infrastructure for the frontend UI.
A continuous integration pipeline exists connecting directly to the `main` branch. See standard internal documentation for setting up the external AWS/HuggingFace container configurations for Oxygen, Dipper, and Humarin GPU acceleration backends.
