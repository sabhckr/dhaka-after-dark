/**
 * Original fictional street copy. Not OSM. Not real businesses, films, or parties.
 * Every string is checked against a denylist of real political identities.
 */

export const USER_MEME = "ইচ্ছা মতো চা খান, ইচ্ছা মতো থাপ্পড় খান";

const BANNED = [
  "আওয়ামী",
  "আওয়ামী",
  "awami",
  "বিএনপি",
  "বি.এন.পি",
  "bnp",
  "জাতীয় পার্টি",
  "জাতীয় পার্টি",
  "jatiya party",
  "জামায়াত",
  "জামায়াত",
  "jamaat",
  "হাসিনা",
  "hasina",
  "খালেদা",
  "khaleda",
  "এরশাদ",
  "erashad",
  "তারেক রহমান",
  "tarique",
  "শেখ মুজিব",
  "মুজিবুর",
  "mujib",
  "নিজামী",
  "nizami",
  "হেফাজত",
  "hefazat",
  "নৌকা প্রতীক",
  "ধানের শীষ",
];

/** Returns the matched denylist term, or null if the line is safe to print. */
export function forbiddenPolitical(text: string): string | null {
  const n = text.toLowerCase();
  for (const term of BANNED) {
    if (n.includes(term.toLowerCase())) return term;
  }
  return null;
}

export type PosterKind = "meme" | "movie" | "politics" | "shop";

export type PosterSpec = {
  id: string;
  kind: PosterKind;
  /** Wide tea-stall banners vs tall paper posters. */
  layout: "banner" | "poster";
  title: string;
  sub?: string;
  lines?: string[];
  /** Paint palette key. */
  tone: "pink" | "cyan" | "amber" | "paper" | "indigo" | "rust";
  glow: boolean;
};

export const POSTER_SPECS: PosterSpec[] = [
  { id: "meme-slap", kind: "meme", layout: "banner", title: USER_MEME, sub: "কাল্পনিক চায়ের দোকান", tone: "pink", glow: true },
  { id: "meme-dukkho", kind: "meme", layout: "banner", title: "চা এমন, দুঃখও বলে—আরেক কাপ দে!", sub: "কাল্পনিক", tone: "amber", glow: true },
  { id: "meme-baki", kind: "meme", layout: "banner", title: "বাকি চাইলে আগে পুরোনো বাকি শোধ দেন।", sub: "কাল্পনিক", tone: "cyan", glow: true },
  { id: "meme-prem", kind: "meme", layout: "banner", title: "প্রেমে ব্যর্থ? চা আছে, বসেন।", sub: "কাল্পনিক", tone: "pink", glow: true },
  { id: "meme-thanda", kind: "meme", layout: "banner", title: "চা ঠান্ডা, কিন্তু আড্ডা গরম!", sub: "কাল্পনিক", tone: "amber", glow: true },
  { id: "meme-poster", kind: "meme", layout: "banner", title: "ভাই, পোস্টার পড়ার আগে চা খেয়ে যান।", sub: "কাল্পনিক", tone: "indigo", glow: true },
  { id: "meme-offer", kind: "meme", layout: "banner", title: "আজকের অফার: চা খাবেন, গল্প ফ্রি!", sub: "কাল্পনিক", tone: "cyan", glow: true },
  { id: "meme-jam", kind: "meme", layout: "banner", title: "সারাদিন জ্যাম, তবু আড্ডা থামবে না!", sub: "কাল্পনিক", tone: "pink", glow: true },
  { id: "meme-current", kind: "meme", layout: "banner", title: "বিদ্যুৎ গেলেও কেতলি চলে।", sub: "কাল্পনিক · কয়লার কথা ভুলে যান", tone: "amber", glow: true },
  { id: "meme-rain", kind: "meme", layout: "banner", title: "বৃষ্টি মানে ছাতা না, মানে আরেক কাপ।", sub: "কাল্পনিক", tone: "cyan", glow: true },
  { id: "meme-exam", kind: "meme", layout: "banner", title: "পরীক্ষা কাল, আজ রাতের চা ডাবল।", sub: "কাল্পনিক", tone: "indigo", glow: false },
  { id: "meme-rent", kind: "meme", layout: "banner", title: "ভাড়া বাড়লেও ছাদের আড্ডা ভাড়াহীন।", sub: "কাল্পনিক", tone: "paper", glow: false },
  { id: "meme-cricket", kind: "meme", layout: "banner", title: "উইকেট পড়ুক, চায়ের কাপ না।", sub: "কাল্পনিক", tone: "pink", glow: true },
  { id: "meme-signal", kind: "meme", layout: "banner", title: "সিগন্যাল লাল, চা গরম—দুটোই আটকায়।", sub: "কাল্পনিক", tone: "rust", glow: true },
  { id: "meme-charge", kind: "meme", layout: "banner", title: "মোবাইলের চার্জ শূন্য, গল্পের চার্জ ফুল।", sub: "কাল্পনিক", tone: "cyan", glow: true },
  { id: "meme-pothole", kind: "meme", layout: "banner", title: "রাস্তায় গর্ত, কাপে না।", sub: "কাল্পনিক", tone: "amber", glow: false },
  { id: "meme-horn", kind: "meme", layout: "banner", title: "ভাই, হর্ন বাজিয়ে চা আসে না।", sub: "কাল্পনিক", tone: "pink", glow: true },
  { id: "meme-shortcut", kind: "meme", layout: "banner", title: "এই গলি শর্টকাট, এই কাপ সান্ত্বনা।", sub: "কাল্পনিক", tone: "indigo", glow: false },
  { id: "meme-exam2", kind: "meme", layout: "banner", title: "পরীক্ষার খাতা ভুললেও কাপ ঠিক রাখুন।", sub: "কাল্পনিক", tone: "paper", glow: false },
  { id: "meme-cricket2", kind: "meme", layout: "banner", title: "ক্রিকেটে যাই হোক, কাপ জিতবে।", sub: "কাল্পনিক", tone: "pink", glow: true },
  { id: "meme-volt", kind: "meme", layout: "banner", title: "বিদ্যুৎ নেই, আড্ডার ভোল্ট আছে।", sub: "কাল্পনিক", tone: "cyan", glow: true },
  { id: "meme-rent2", kind: "meme", layout: "banner", title: "ভাড়া বাকি, চা-ও বাকি—একটা শোধ দিন।", sub: "কাল্পনিক", tone: "amber", glow: false },
  { id: "meme-cng", kind: "meme", layout: "banner", title: "সিএনজি দাঁড়ালে চা, না দাঁড়ালেও চা।", sub: "কাল্পনিক", tone: "rust", glow: true },
  { id: "meme-fuchka", kind: "meme", layout: "banner", title: "ফুচকা খাবেন, পানি কিন্তু নিজের।", sub: "কাল্পনিক", tone: "indigo", glow: false },

  { id: "shop-megh", kind: "shop", layout: "banner", title: "মেঘড্রপ চা", sub: "গরম, কষা, সস্তা · কাল্পনিক", tone: "amber", glow: true },
  { id: "shop-tin", kind: "shop", layout: "banner", title: "তিনতলা টেইলরস", sub: "প্যান্ট আজ, পায়জামা কাল · কাল্পনিক", tone: "cyan", glow: false },
  { id: "shop-rat", kind: "shop", layout: "banner", title: "রাতকালি মোবাইল", sub: "স্ক্রিন ভাঙলেও কথা শুনি · কাল্পনিক", tone: "pink", glow: true },
  { id: "shop-khata", kind: "shop", layout: "banner", title: "খাতাঘর কোচিং", sub: "অঙ্ক ভয় পায় এখানে · কাল্পনিক", tone: "paper", glow: false },
  { id: "shop-juta", kind: "shop", layout: "banner", title: "পেরেক ও পালিশ", sub: "জুতো, ব্যাগ, হাল ছাড়া · কাল্পনিক", tone: "rust", glow: false },
  { id: "shop-chhad", kind: "shop", layout: "banner", title: "ছাদের আসবাব", sub: "খাট আছে, ঘুম আলাদা · কাল্পনিক", tone: "indigo", glow: false },
  { id: "shop-chanachur", kind: "shop", layout: "banner", title: "ভাঙা সেতু চানাচুর", sub: "কাল্পনিক নাস্তা", tone: "amber", glow: true },
  { id: "shop-fan", kind: "shop", layout: "banner", title: "তারকাঠি ইলেকট্রিক", sub: "ফ্যান ঘোরে, বিলও · কাল্পনিক", tone: "cyan", glow: true },

  { id: "mov-rickshaw", kind: "movie", layout: "poster", title: "রাতের রিকশা", sub: "কাল্পনিক ছবি", lines: ["এক শহর", "এক যাত্রা"], tone: "indigo", glow: false },
  { id: "mov-motijheel", kind: "movie", layout: "poster", title: "মেঘের নিচে মতিঝিল", sub: "কাল্পনিক · প্রেম, বৃষ্টি, অফিস", lines: ["মেহনাজ রশীদ", "ইরফান বড়ুয়া"], tone: "pink", glow: false },
  { id: "mov-train", kind: "movie", layout: "poster", title: "নীল নগরের শেষ ট্রেন", sub: "কাল্পনিক ছবি", lines: ["নীলাঞ্জনা কর"], tone: "cyan", glow: false },
  { id: "mov-shadow", kind: "movie", layout: "poster", title: "গুলশানের ছায়া", sub: "কাল্পনিক", lines: ["ফারহান কিবরিয়া"], tone: "paper", glow: false },
  { id: "mov-sadar", kind: "movie", layout: "poster", title: "সদরঘাট ব্লুজ", sub: "কাল্পনিক", lines: ["রুবায়েত কাইয়ুম"], tone: "rust", glow: false },
  { id: "mov-song", kind: "movie", layout: "poster", title: "তিনতলার গান", sub: "কাল্পনিক", lines: ["ছাদের সিনেমা"], tone: "amber", glow: false },
  { id: "mov-neon", kind: "movie", layout: "poster", title: "কালি আর নিয়ন", sub: "কাল্পনিক", lines: ["রাতের প্রিন্ট"], tone: "pink", glow: true },
  { id: "mov-gun", kind: "movie", layout: "poster", title: "বর্ষার বন্দুক", sub: "কাল্পনিক অ্যাকশন", lines: ["গুলি না, বৃষ্টি"], tone: "indigo", glow: false },
  { id: "mov-bus", kind: "movie", layout: "poster", title: "লাল বাসের প্রেম", sub: "কাল্পনিক ছবি", lines: ["কাল্পনিক চরিত্র"], tone: "rust", glow: false },
  { id: "mov-roof", kind: "movie", layout: "poster", title: "ছাদের বৃষ্টি", sub: "কাল্পনিক ছবি", lines: ["এক রাত", "এক কাপ"], tone: "cyan", glow: false },

  { id: "pol-megh", kind: "politics", layout: "poster", title: "মেঘলা ওয়ার্ড ফোরাম", sub: "পুরোপুরি কাল্পনিক", lines: ["গর্ত কম,", "আড্ডা বেশি"], tone: "paper", glow: false },
  { id: "pol-bati", kind: "politics", layout: "poster", title: "রাতের বাতি সভা", sub: "পুরোপুরি কাল্পনিক", lines: ["বাতি রাখব,", "হর্ন কমাব"], tone: "indigo", glow: false },
  { id: "pol-cha", kind: "politics", layout: "poster", title: "চা-নাগরিক মঞ্চ", sub: "পুরোপুরি কাল্পনিক", lines: ["প্রতি কাপে", "একটা কথা"], tone: "amber", glow: false },
  { id: "pol-jam", kind: "politics", layout: "poster", title: "জ্যামমুক্ত কল্পনা", sub: "পুরোপুরি কাল্পনিক", lines: ["সিগন্যাল সবুজ,", "স্বপ্নও"], tone: "cyan", glow: false },
  { id: "pol-roof", kind: "politics", layout: "poster", title: "ছাদবাসী ইউনিয়ন", sub: "পুরোপুরি কাল্পনিক", lines: ["ট্যাংকি ভর্তি,", "মনও"], tone: "rust", glow: false },
  { id: "pol-river", kind: "politics", layout: "poster", title: "নদীপাড় নাটক সভা", sub: "পুরোপুরি কাল্পনিক", lines: ["পোস্টার ছাড়বে,", "নদী না"], tone: "paper", glow: false },
];

for (const spec of POSTER_SPECS) {
  const blob = [spec.title, spec.sub, ...(spec.lines ?? [])].join("\n");
  const hit = forbiddenPolitical(blob);
  if (hit) throw new Error(`Fictional poster ${spec.id} matched a real political term: ${hit}`);
}
