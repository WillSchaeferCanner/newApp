// "Who's That Pokémon?" — uses the PokéSprite sprite set + data file.
// Sprites:  https://msikma.github.io/pokesprite/pokemon-gen8/regular/<slug>.png
// Dex data: https://raw.githubusercontent.com/msikma/pokesprite/master/data/pokemon.json
//
// v2: faster loading — the Pokédex list is cached in localStorage after the first
// visit, and the NEXT sprite is preloaded while you're guessing the current one.

const DATA_URL = "https://raw.githubusercontent.com/msikma/pokesprite/master/data/pokemon.json";
const SPRITE_BASE = "https://msikma.github.io/pokesprite/pokemon-gen8/regular/";
const CACHE_KEY = "pokeGuessDexV2";

const els = {
  wrap: document.getElementById("sprite-wrap"),
  sprite: document.getElementById("sprite"),
  form: document.getElementById("guess-form"),
  input: document.getElementById("guess"),
  guessBtn: document.getElementById("guess-btn"),
  giveUpBtn: document.getElementById("giveup-btn"),
  againBtn: document.getElementById("again-btn"),
  message: document.getElementById("message"),
  streak: document.getElementById("streak"),
  best: document.getElementById("best"),
};

let pokedex = [];      // [{ name, slug, answers: Set }]
let current = null;
let upcoming = null;   // next Pokémon, already preloading
let roundOver = true;
let streak = 0;
let best = readBest();
let failedLoads = 0;

els.best.textContent = best;

// ---------- helpers ----------
function normalize(str) {
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // strip accents (Flabébé -> flabebe)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");        // "Mr. Mime" -> "mrmime"
}

function readBest() {
  try { return parseInt(localStorage.getItem("pokeGuessBest"), 10) || 0; }
  catch { return 0; }
}
function saveBest(n) {
  try { localStorage.setItem("pokeGuessBest", String(n)); } catch { /* ignore */ }
}

function setMessage(text, kind = "") {
  els.message.textContent = text;
  els.message.className = kind;
}

function setPlaying(playing) {
  els.input.disabled = !playing;
  els.guessBtn.disabled = !playing;
  els.giveUpBtn.disabled = !playing;
  els.form.hidden = !playing;
  els.againBtn.hidden = playing;
}

// ---------- data ----------
function buildDex(pairs) {
  // pairs: [[name, slug], ...]
  pokedex = pairs.map(([name, slug]) => ({
    name,
    slug,
    answers: new Set([normalize(name), normalize(slug)]),
  }));
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const pairs = raw ? JSON.parse(raw) : null;
    return Array.isArray(pairs) && pairs.length ? pairs : null;
  } catch { return null; }
}

async function fetchPairs() {
  const res = await fetch(DATA_URL);
  if (!res.ok) throw new Error("Could not load Pokédex data");
  const data = await res.json();

  const pairs = Object.values(data)
    .filter(p => p["gen-8"] && p["gen-8"].forms && p["gen-8"].forms["$"]) // has a gen 8 base-form sprite
    .map(p => [p.name.eng, p.slug.eng]);

  if (!pairs.length) throw new Error("Pokédex is empty");
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(pairs)); } catch { /* ignore */ }
  return pairs;
}

// ---------- game flow ----------
function pickRandom(excludeSlugs = []) {
  let pick;
  do {
    pick = pokedex[Math.floor(Math.random() * pokedex.length)];
  } while (pokedex.length > 2 && excludeSlugs.includes(pick.slug));
  return pick;
}

function spriteUrl(p) {
  return SPRITE_BASE + p.slug + ".png";
}

// Download the next sprite in the background so "Play again" feels instant.
function preloadNext() {
  upcoming = pickRandom([current && current.slug]);
  const img = new Image();
  img.src = spriteUrl(upcoming);
}

function startRound() {
  current = upcoming || pickRandom([current && current.slug]);
  upcoming = null;
  roundOver = false;

  els.wrap.classList.remove("revealed");
  els.wrap.classList.add("loading");
  els.input.value = "";
  setMessage("Loading sprite...");
  setPlaying(false);
  els.form.hidden = false;       // keep layout stable while loading
  els.againBtn.hidden = true;

  els.sprite.onload = () => {
    failedLoads = 0;
    els.wrap.classList.remove("loading");
    setPlaying(true);
    setMessage("Who's that Pokémon?");
    els.input.focus();
    preloadNext();               // start fetching the next one right away
  };
  els.sprite.onerror = () => {
    // A sprite might be missing or the network hiccupped — try another, a few times.
    failedLoads += 1;
    if (failedLoads <= 5) {
      startRound();
    } else {
      failedLoads = 0;
      setMessage("Couldn't load a sprite. Check your connection and press Play again.", "lose");
      els.wrap.classList.remove("loading");
      setPlaying(false);
    }
  };
  els.sprite.src = spriteUrl(current);
}

function endRound(won) {
  roundOver = true;
  els.wrap.classList.add("revealed");
  setPlaying(false);

  if (won) {
    streak += 1;
    if (streak > best) {
      best = streak;
      saveBest(best);
    }
    setMessage(`You got it! It's ${current.name}!`, "win");
  } else {
    streak = 0;
    setMessage(`It was ${current.name}!`, "lose");
  }
  els.streak.textContent = streak;
  els.best.textContent = best;
  els.againBtn.focus();
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (roundOver || !current) return;

  const guess = normalize(els.input.value);
  if (!guess) return;

  if (current.answers.has(guess)) {
    endRound(true);
  } else {
    setMessage("Not quite — try again!", "lose");
    els.input.classList.remove("shake");
    void els.input.offsetWidth;          // restart animation
    els.input.classList.add("shake");
    els.input.select();
  }
});

els.giveUpBtn.addEventListener("click", () => {
  if (!roundOver) endRound(false);
});

els.againBtn.addEventListener("click", () => {
  failedLoads = 0;
  startRound();
});

// ---------- boot ----------
(async function init() {
  setPlaying(false);
  els.form.hidden = false;
  els.againBtn.hidden = true;

  const cached = readCache();
  try {
    if (cached) {
      // Start immediately from the cache, then quietly refresh it for next time.
      buildDex(cached);
      startRound();
      fetchPairs().catch(() => {});
    } else {
      buildDex(await fetchPairs());
      startRound();
    }
  } catch (err) {
    console.error(err);
    setMessage("Couldn't load the Pokédex. Check your connection and refresh.", "lose");
  }
})();
