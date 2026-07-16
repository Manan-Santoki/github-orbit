import type {
  CollectionSummary,
  GraphEdge,
  GraphNode,
  GraphPayload,
  Recommendation,
} from "./index";
import { explanationReasons, jaccard, scoreCandidate, type RankingFeatures } from "./ranking";

type DemoPerson = {
  login: string;
  name: string;
  bio: string;
  languages: string[];
  topics: string[];
  followers: number;
  following: number;
  cluster: string;
};

const people: DemoPerson[] = [
  {
    login: "you",
    name: "Alex Morgan",
    bio: "Building thoughtful developer tools.",
    languages: ["TypeScript", "Python"],
    topics: ["developer-tools", "ai", "open-source"],
    followers: 184,
    following: 96,
    cluster: "you",
  },
  {
    login: "maya-dev",
    name: "Maya Chen",
    bio: "Open-source maintainer. Design systems and compilers.",
    languages: ["TypeScript", "Rust"],
    topics: ["developer-tools", "design-systems", "compilers"],
    followers: 2410,
    following: 312,
    cluster: "tools",
  },
  {
    login: "rustacean-labs",
    name: "Noah Williams",
    bio: "Fast systems, kind communities.",
    languages: ["Rust", "C++"],
    topics: ["systems", "wasm", "open-source"],
    followers: 1380,
    following: 208,
    cluster: "systems",
  },
  {
    login: "pixelcraft",
    name: "Priya Shah",
    bio: "Making interfaces feel inevitable.",
    languages: ["TypeScript", "CSS"],
    topics: ["design-systems", "accessibility", "react"],
    followers: 934,
    following: 421,
    cluster: "design",
  },
  {
    login: "data-moss",
    name: "Jon Bell",
    bio: "Graph learning and small data.",
    languages: ["Python", "Julia"],
    topics: ["graphs", "machine-learning", "research"],
    followers: 692,
    following: 188,
    cluster: "ai",
  },
  {
    login: "shipshape",
    name: "Ana Torres",
    bio: "Shipping reliable cloud infrastructure.",
    languages: ["Go", "TypeScript"],
    topics: ["devops", "observability", "containers"],
    followers: 1204,
    following: 241,
    cluster: "infra",
  },
  {
    login: "lumen-ai",
    name: "Sam Okafor",
    bio: "Practical AI systems and evals.",
    languages: ["Python", "TypeScript"],
    topics: ["ai", "evals", "developer-tools"],
    followers: 3210,
    following: 502,
    cluster: "ai",
  },
  {
    login: "a11y-first",
    name: "Elena Rossi",
    bio: "Accessibility engineer and web platform contributor.",
    languages: ["JavaScript", "HTML"],
    topics: ["accessibility", "web-platform", "standards"],
    followers: 882,
    following: 377,
    cluster: "design",
  },
  {
    login: "terminal-garden",
    name: "Theo Martin",
    bio: "CLI tools, terminals, and developer happiness.",
    languages: ["Rust", "TypeScript"],
    topics: ["cli", "developer-tools", "terminal"],
    followers: 1770,
    following: 219,
    cluster: "tools",
  },
  {
    login: "openmaps",
    name: "Inez Park",
    bio: "Maps, civic data, and collaborative software.",
    languages: ["Python", "JavaScript"],
    topics: ["maps", "open-data", "community"],
    followers: 640,
    following: 513,
    cluster: "data",
  },
  {
    login: "cache-miss",
    name: "Omar Ali",
    bio: "Databases and distributed systems.",
    languages: ["Go", "Rust"],
    topics: ["databases", "distributed-systems", "performance"],
    followers: 2240,
    following: 174,
    cluster: "systems",
  },
  {
    login: "tiny-inference",
    name: "Keiko Tan",
    bio: "Efficient ML inference at the edge.",
    languages: ["Python", "C++"],
    topics: ["machine-learning", "inference", "edge"],
    followers: 1510,
    following: 332,
    cluster: "ai",
  },
  {
    login: "docs-are-code",
    name: "Morgan Lee",
    bio: "Documentation engineering and information architecture.",
    languages: ["TypeScript", "MDX"],
    topics: ["documentation", "developer-tools", "community"],
    followers: 515,
    following: 461,
    cluster: "tools",
  },
  {
    login: "queue-theory",
    name: "Fatima Noor",
    bio: "Event-driven systems and resilient workers.",
    languages: ["Go", "TypeScript"],
    topics: ["queues", "distributed-systems", "observability"],
    followers: 1020,
    following: 230,
    cluster: "infra",
  },
  {
    login: "local-first",
    name: "Ben Foster",
    bio: "Local-first software and humane collaboration.",
    languages: ["TypeScript", "Rust"],
    topics: ["local-first", "collaboration", "open-source"],
    followers: 2870,
    following: 391,
    cluster: "tools",
  },
  {
    login: "shader-soup",
    name: "Lia Gomez",
    bio: "Creative coding, WebGPU, and graphics tools.",
    languages: ["TypeScript", "C++"],
    topics: ["graphics", "webgpu", "creative-coding"],
    followers: 1180,
    following: 342,
    cluster: "design",
  },
  {
    login: "secure-by-default",
    name: "Amir Haddad",
    bio: "Application security without the fear tactics.",
    languages: ["Go", "Python"],
    topics: ["security", "devtools", "supply-chain"],
    followers: 1975,
    following: 288,
    cluster: "infra",
  },
  {
    login: "garden-state",
    name: "Zoe King",
    bio: "Community infrastructure and open-source governance.",
    languages: ["Python", "TypeScript"],
    topics: ["community", "governance", "open-source"],
    followers: 745,
    following: 608,
    cluster: "data",
  },
];

const rawEdges: Array<[number, number]> = [
  [0, 1],
  [1, 0],
  [0, 2],
  [0, 3],
  [3, 0],
  [4, 0],
  [0, 5],
  [0, 6],
  [6, 0],
  [7, 0],
  [0, 8],
  [8, 0],
  [9, 0],
  [1, 8],
  [1, 12],
  [1, 14],
  [2, 10],
  [2, 11],
  [2, 14],
  [3, 7],
  [3, 15],
  [4, 6],
  [4, 9],
  [4, 11],
  [5, 10],
  [5, 13],
  [5, 16],
  [6, 11],
  [6, 13],
  [6, 17],
  [7, 3],
  [7, 12],
  [8, 1],
  [8, 14],
  [9, 17],
  [10, 2],
  [10, 13],
  [11, 4],
  [11, 6],
  [12, 1],
  [12, 7],
  [13, 5],
  [13, 10],
  [14, 1],
  [14, 8],
  [15, 3],
  [16, 5],
  [17, 6],
];

function avatar(login: string): string {
  return `https://github.com/identicons/${encodeURIComponent(login)}.png`;
}

export const demoEdges: GraphEdge[] = rawEdges.map(([source, target], index) => ({
  id: `edge-${index}`,
  source: `node-${source}`,
  target: `node-${target}`,
  kind: "follow",
  observedAt: new Date(Date.now() - index * 3_600_000).toISOString(),
}));

export const demoNodes: GraphNode[] = people.map((person, index) => {
  const fromViewer = rawEdges.some(([source, target]) => source === 0 && target === index);
  const toViewer = rawEdges.some(([source, target]) => source === index && target === 0);
  const relationship =
    index === 0
      ? "self"
      : fromViewer && toViewer
        ? "mutual"
        : fromViewer
          ? "following"
          : toViewer
            ? "follower"
            : "none";
  return {
    id: `node-${index}`,
    githubId: String(10_000 + index),
    login: person.login,
    name: person.name,
    bio: person.bio,
    avatarUrl: avatar(person.login),
    kind: index === 0 ? "viewer" : relationship === "none" ? "recommended" : "direct",
    relationship,
    clusterId: person.cluster,
    languages: person.languages,
    topics: person.topics,
    followers: person.followers,
    following: person.following,
    activityAt: new Date(Date.now() - index * 86_400_000).toISOString(),
    coverage: {
      followersLoaded: Math.min(person.followers, 100),
      followersTotal: person.followers,
      followingLoaded: Math.min(person.following, 100),
      followingTotal: person.following,
      truncated: person.followers > 100 || person.following > 100,
    },
  } satisfies GraphNode;
});

export const demoGraph: GraphPayload = {
  center: "node-0",
  nodes: demoNodes,
  edges: demoEdges,
  generatedAt: new Date().toISOString(),
  limits: { maxNodes: 5000, maxEdges: 20000 },
};

function commonNeighborCount(index: number): number {
  const viewerTargets = new Set(
    rawEdges.filter(([source]) => source === 0).map(([, target]) => target),
  );
  return rawEdges.filter(([source, target]) => source === index && viewerTargets.has(target))
    .length;
}

export const demoRecommendations: Recommendation[] = demoNodes
  .filter((node) => node.kind === "recommended")
  .map((candidate) => {
    const index = Number(candidate.id.replace("node-", ""));
    const mutualCount = commonNeighborCount(index);
    const sharedTopics = candidate.topics.filter((topic) => demoNodes[0]?.topics.includes(topic));
    const sharedLanguages = candidate.languages.filter((language) =>
      demoNodes[0]?.languages.includes(language),
    );
    const features: RankingFeatures = {
      pageRank: Math.min(1, 0.55 + mutualCount * 0.15),
      commonNeighbors: Math.min(1, mutualCount / 4),
      embeddingSimilarity: 0.62 + ((index * 7) % 25) / 100,
      topicSimilarity: jaccard(candidate.topics, demoNodes[0]?.topics ?? []),
      languageSimilarity: jaccard(candidate.languages, demoNodes[0]?.languages ?? []),
      activity: Math.max(0.45, 1 - index / 25),
      exploration: index % 2 === 0 ? 0.7 : 0.45,
    };
    const { score } = scoreCandidate(features);
    return {
      candidate: { ...candidate, score },
      score,
      rank: 0,
      reasons: explanationReasons(features, { mutualCount, sharedTopics, sharedLanguages }),
      sharedTopics,
      sharedLanguages,
    };
  })
  .sort((a, b) => b.score - a.score)
  .map((recommendation, index) => ({ ...recommendation, rank: index + 1 }));

export const demoCollections: CollectionSummary[] = [
  {
    id: "collection-tools",
    name: "Developer tools",
    description: "Maintainers building delightful tools.",
    memberCount: 5,
    updatedAt: new Date().toISOString(),
  },
  {
    id: "collection-ai",
    name: "Practical AI",
    description: "Evals, inference, and useful ML systems.",
    memberCount: 4,
    updatedAt: new Date(Date.now() - 86_400_000).toISOString(),
  },
  {
    id: "collection-collaborators",
    name: "Potential collaborators",
    description: "People to reach out to after exploring their work.",
    memberCount: 3,
    updatedAt: new Date(Date.now() - 172_800_000).toISOString(),
  },
];
