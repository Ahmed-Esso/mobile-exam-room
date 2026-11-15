import { Question, SampleExamPack } from '@/types/exam';
import { parseMarkdownQuestions } from './markdown-parser';

export const SAMPLE_EXAM_PACKS: SampleExamPack[] = [
  {
    id: 'fullstack-react',
    title: 'React, Next.js & TypeScript Arena',
    subtitle: 'Hooks, closures, async event loop & modern web architecture',
    category: 'Software Engineering',
    icon: '⚡',
    questionCount: 5,
    estimatedMinutes: 4,
    markdown: `### 1. What gets logged when the user clicks the button 3 times rapidly in this React component?
\`\`\`tsx
const [count, setCount] = useState(0);
function handleClick() {
  setCount(count + 1);
  setCount(count + 1);
}
\`\`\`
- A) 6
- B) 3
- C) 2
- D) 1
**Answer:** B
**Explanation:** Because \`setCount(count + 1)\` reads the same render snapshot of \`count\` twice per click, each click only increments \`count\` by **1** (not 2). Clicking 3 times results in **3**. To increment twice per click, pass an updater function: \`setCount(c => c + 1)\`.

---

### 2. In JavaScript's Event Loop, in what order do these logs appear?
\`\`\`js
console.log('1');
setTimeout(() => console.log('2'), 0);
Promise.resolve().then(() => console.log('3'));
console.log('4');
\`\`\`
- A) 1, 2, 3, 4
- B) 1, 4, 2, 3
- C) 1, 4, 3, 2
- D) 1, 3, 4, 2
**Answer:** C
**Explanation:** Synchronous code runs first (\`1\`, then \`4\`). Next, the **Microtask Queue** (Promises: \`3\`) drains completely before the **Macrotask Queue** (\`setTimeout\`: \`2\`) executes.

---

### 3. Which HTTP status code specifically indicates that a user is being rate-limited?
- A) 401 Unauthorized
- B) 403 Forbidden
- C) 422 Unprocessable Entity
- D) 429 Too Many Requests
**Answer:** D
**Explanation:** **429 Too Many Requests** is the standard HTTP status code returned when a client exceeds the allowed request quota in a time window, often paired with a \`Retry-After\` header.

---

### 4. In TypeScript, what is the key difference between \`unknown\` and \`any\`?
- A) \`unknown\` requires type narrowing before you can call methods or access properties on it
- B) \`unknown\` can only hold primitive values, while \`any\` holds objects
- C) \`any\` is checked at compile time, while \`unknown\` is checked at runtime
- D) There is no difference; \`unknown\` is just an alias for \`any\`
**Answer:** A
**Explanation:** \`unknown\` is the **type-safe counterpart** to \`any\`. Anything can be assigned to \`unknown\`, but TypeScript prevents you from performing operations on it until you narrow its type (e.g., with \`typeof\`, \`instanceof\`, or a type guard).

---

### 5. Why does a database index speed up \`SELECT\` queries on a column, and what is its main trade-off?
- A) It compresses rows in memory; trade-off is lower query accuracy
- B) It maintains a B-Tree/hash structure for O(log n) lookups; trade-off is extra storage and slower \`INSERT\`/\`UPDATE\` writes
- C) It caches queries in the browser; trade-off is stale data
- D) It converts SQL tables into NoSQL documents; trade-off is losing foreign keys
**Answer:** B
**Explanation:** An index maintains a sorted **B-Tree** (or hash) pointer structure so the engine avoids full O(n) table scans. However, every \`INSERT\`, \`UPDATE\`, or \`DELETE\` must also update the index, adding write overhead.`,
  },
  {
    id: 'ai-tech-trivia',
    title: 'AI, LLMs & System Design Showdown',
    subtitle: 'Transformers, RAG, attention mechanisms & distributed systems',
    category: 'AI & Systems',
    icon: '🧠',
    questionCount: 5,
    estimatedMinutes: 4,
    markdown: `### 1. Why does the standard Self-Attention mechanism in Transformers scale quadratically O(N²) with sequence length N?
- A) Every token computes attention scores against every other token in the sequence
- B) The vocabulary size doubles with every layer
- C) Backpropagation runs twice per token
- D) Tokenizers split every word into N² sub-words
**Answer:** A
**Explanation:** In self-attention, computing the attention matrix $QK^T$ pairs every query token ($N$) with every key token ($N$), producing an **$N \\times N$** matrix per attention head.

---

### 2. What happens when you set an LLM's sampling \`temperature\` close to 0?
- A) The model generates wild, creative, and unpredictable tokens
- B) The model becomes nearly deterministic, almost always picking the highest-probability next token (greedy decoding)
- C) The context window shrinks to save GPU memory
- D) The model stops using its system prompt
**Answer:** B
**Explanation:** Lowering \`temperature\` sharpens the softmax probability distribution over the next token, making the highest-logit token dominate—ideal for coding, math, and structured extraction.

---

### 3. In a RAG (Retrieval-Augmented Generation) pipeline, why do we use Cosine Similarity on vector embeddings?
- A) To encrypt user prompts before sending them to the LLM
- B) To measure semantic closeness between the query vector and document chunk vectors in high-dimensional space
- C) To count the exact number of matching keywords
- D) To compress JSON payloads over HTTP/2
**Answer:** B
**Explanation:** Embedding models map text with similar meaning to nearby directions in vector space. **Cosine similarity** measures the angle between vectors, capturing semantic similarity even when exact words differ.

---

### 4. According to the CAP Theorem, during a network partition (P) in a distributed database, what two properties must you choose between?
- A) Caching and Persistence
- B) Concurrency and Parallelism
- C) Consistency and Availability
- D) Compression and Authentication
**Answer:** C
**Explanation:** When a **Partition (P)** occurs between nodes, a distributed store must choose between **Consistency (C)** (rejecting writes/reads that cannot be guaranteed up-to-date) or **Availability (A)** (serving potentially stale data).

---

### 5. What problem does Consistent Hashing solve in distributed caches and load balancers?
- A) Adding or removing a server node only remaps ~1/N of the keys instead of reshuffling almost every key
- B) It hashes passwords using salted SHA-256
- C) It guarantees zero hash collisions across infinite inputs
- D) It automatically compresses images on CDNs
**Answer:** A
**Explanation:** With naive \`hash(key) % N\`, changing $N$ invalidates nearly all cached keys (causing a cache stampede). **Consistent Hashing** places servers and keys on a virtual ring so only **$O(K/N)$** keys move when a node joins or leaves.`,
  },
  {
    id: 'med-science-sprint',
    title: 'High-Yield Science & Bio Sprint',
    subtitle: 'Fast-paced physiology, pharmacology, genetics & physics',
    category: 'Science & Pre-Med',
    icon: '🧬',
    questionCount: 5,
    estimatedMinutes: 4,
    markdown: `### 1. Which cardiac pacemaker normally sets the fastest intrinsic depolarization rate (60–100 bpm) in a healthy heart?
- A) Atrioventricular (AV) node
- B) Bundle of His
- C) Sinoatrial (SA) node
- D) Purkinje fibers
**Answer:** C
**Explanation:** The **SA node** in the right atrium has the fastest spontaneous phase-4 depolarization (60–100 bpm), overriding slower latent pacemakers like the AV node (40–60 bpm) and Purkinje fibers (20–40 bpm).

---

### 2. Why is O-negative (O−) blood considered the universal red blood cell donor in emergency transfusions?
- A) Its plasma contains no antibodies at all
- B) Its red blood cells lack A, B, and Rh(D) surface antigens, so recipient antibodies won't attack them
- C) It carries 3x more hemoglobin than AB+ blood
- D) Its white blood cells destroy recipient pathogens
**Answer:** B
**Explanation:** Packed **O− red blood cells** lack A, B, and Rh(D) antigens on their cell membrane, preventing acute hemolytic transfusion reactions triggered by the recipient's anti-A, anti-B, or anti-D antibodies.

---

### 3. Which organelle contains its own circular DNA and is inherited almost exclusively down the maternal line in humans?
- A) Golgi apparatus
- B) Endoplasmic reticulum
- C) Mitochondrion
- D) Lysosome
**Answer:** C
**Explanation:** **Mitochondria** evolved via endosymbiosis and retain their own circular **mtDNA** (37 genes). Because sperm mitochondria are degraded after fertilization, human mtDNA is inherited maternally.

---

### 4. In pharmacology, what is a Competitive Antagonist's effect on an agonist's dose-response curve?
- A) Shifts the curve to the right (increases EC50) without reducing maximal efficacy (Emax)
- B) Shifts the curve to the left and doubles Emax
- C) Lowers Emax without changing EC50
- D) Permanently destroys the receptor via covalent bonding
**Answer:** A
**Explanation:** A **reversible competitive antagonist** competes with the agonist for the same orthosteric binding site. Adding enough agonist overcomes the blockade, so **Emax is unchanged** while apparent potency decreases (**EC50 increases**, shifting the curve right).

---

### 5. Why do astronauts aboard the International Space Station (ISS) experience weightlessness?
- A) There is zero Earth gravity at 400 km altitude
- B) The Moon's gravity cancels out Earth's gravity at that exact height
- C) Both the station and the astronauts are in continuous free-fall around the Earth at orbital velocity
- D) Cabin air pressure pushes them upward
**Answer:** C
**Explanation:** At 400 km altitude, Earth's gravity is still **~88% as strong** as on the surface! Astronauts float because the ISS is traveling sideways at ~28,000 km/h in **continuous free-fall** around Earth's curvature.`,
  },
];

export const DEFAULT_SAMPLE_PACK = SAMPLE_EXAM_PACKS[0];

export const DEFAULT_QUESTIONS: Question[] = parseMarkdownQuestions(
  DEFAULT_SAMPLE_PACK.markdown
).questions;
