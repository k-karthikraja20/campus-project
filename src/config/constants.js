const ROLES = {
  ADMIN: "admin",
  SUPERVISOR: "supervisor",
  CANDIDATE: "candidate",
  STUDENT: "student",
};

const ELECTION_STATUS = {
  DRAFT: "draft",
  UPCOMING: "upcoming",
  ACTIVE: "active",
  CLOSED: "closed",
  PUBLISHED: "published",
  CANCELLED: "cancelled",
};

const APPLICATION_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
};

const SUPPORTED_SYMBOLS = [
  { name: "Book", code: "BOOK", icon: "📖", description: "Symbol of Knowledge & Wisdom" },
  { name: "Lamp", code: "LAMP", icon: "🪔", description: "Symbol of Guidance & Light" },
  { name: "Tree", code: "TREE", icon: "🌳", description: "Symbol of Growth & Unity" },
  { name: "Star", code: "STAR", icon: "⭐", description: "Symbol of Excellence & Hope" },
  { name: "Pen", code: "PEN", icon: "✒️", description: "Symbol of Truth & Voice" },
  { name: "Bicycle", code: "BICYCLE", icon: "🚲", description: "Symbol of Progress & Mobility" },
  { name: "Lotus", code: "LOTUS", icon: "🪷", description: "Symbol of Purity & Integrity" },
  { name: "Shield", code: "SHIELD", icon: "🛡️", description: "Symbol of Protection & Justice" },
  { name: "Globe", code: "GLOBE", icon: "🌐", description: "Symbol of Global Vision" },
  { name: "Bell", code: "BELL", icon: "🔔", description: "Symbol of Vigilance & Clarity" },
];

const DEFAULT_THRESHOLDS = {
  "Chairman": 90,
  "Vice Chairman": 80,
  "Secretary": 70,
  "Treasurer": 75,
  "Joint Secretary": 65,
};

module.exports = {
  ROLES,
  ELECTION_STATUS,
  APPLICATION_STATUS,
  SUPPORTED_SYMBOLS,
  DEFAULT_THRESHOLDS,
};
