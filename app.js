// "Who's That Pokémon?" — uses the PokéSprite sprite set + data file.
// Sprites:  https://msikma.github.io/pokesprite/pokemon-gen8/regular/<slug>.png
// Dex data: https://raw.githubusercontent.com/msikma/pokesprite/master/data/pokemon.json

const DATA_URL = "https://raw.githubusercontent.com/msikma/pokesprite/master/data/pokemon.json";
const SPRITE_BASE = "https://msikma.github.io/pokesprite/pokemon-gen8/regular/";

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
let lastSlug = null;
let roundOver = true;
let streak = 0;
let best = readBest();

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
async function loadPokedex() {
  const res = await fetch(DATA_URL);
  if (!res.ok) throw new Error("Could not load Pokédex data");
  const data = await res.json();

  pokedex = Object.values(data)
    .filter(p => p["gen-8"] && p["gen-8"].forms && p["gen-8"].forms["$"]) // has a gen 8 base-form sprite
    .map(p => {
      const name = p.name.eng;
      const slug = p.slug.eng;
      return { name, slug, answers: new Set([normalize(name), normalize(slug)]) };
    });

  if (!pokedex.length) throw new Error("Pokédex is empty");
}

// ---------- game flow ----------
function pickRandom() {
  let pick;
  do {
    pick = pokedex[Math.floor(Math.random() * pokedex.length)];
  } while (pokedex.length > 1 && pick.slug === lastSlug);
  return pick;
}

function startRound() {
  current = pickRandom();
  lastSlug = current.slug;
  roundOver = false;

  els.wrap.classList.remove("revealed");
  els.wrap.classList.add("loading");
  els.input.value = "";
  setMessage("Loading sprite...");
  setPlaying(false);
  els.form.hidden = false;       // keep layout stable while loading
  els.againBtn.hidden = true;

  els.sprite.onload = () => {
    els.wrap.classList.remove("loading");
    setPlaying(true);
    setMessage("Who's that Pokémon?");
    els.input.focus();
  };
  els.sprite.onerror = () => {
    // Some sprite might be missing — just try another one.
    startRound();
  };
  els.sprite.src = SPRITE_BASE + current.slug + ".png";
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

els.againBtn.addEventListener("click", startRound);

// ---------- boot ----------
(async function init() {
  setPlaying(false);
  els.form.hidden = false;
  els.againBtn.hidden = true;
  try {
    await loadPokedex();
    startRound();
  } catch (err) {
    console.error(err);
    setMessage("Couldn't load the Pokédex. Check your connection and refresh.", "lose");
  }
})();
