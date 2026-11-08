const storageKey = "bebold-landing-preview-v1";
const sampleText =
  "Some ideas deserve your full attention. A small change in the way you read can make room for everything that comes next.";
const readingSample = document.querySelector("#reading-sample");
const readingToggle = document.querySelector("#reading-toggle");

// Keep the demonstration readable without JavaScript; add emphasis with text nodes.
readingSample.replaceChildren(
  ...sampleText.split(/(\s+)/).map((word) => {
    if (!word.trim()) return document.createTextNode(word);
    const part = document.createElement("span");
    const anchor = document.createElement("strong");
    const length = Math.max(
      1,
      Math.ceil(word.replace(/[^a-z]/gi, "").length * 0.45),
    );
    anchor.textContent = word.slice(0, length);
    part.append(anchor, document.createTextNode(word.slice(length)));
    return part;
  }),
);

readingToggle.addEventListener("click", () => {
  const enabled = readingToggle.getAttribute("aria-checked") !== "true";
  readingToggle.setAttribute("aria-checked", String(enabled));
  readingSample.classList.toggle("no-emphasis", !enabled);
  document.querySelector("#reading-state").textContent =
    `BeBold ${enabled ? "on" : "off"}`;
});

const video = document.querySelector("#brand-film");
const filmCover = document.querySelector("#play-film");
filmCover.hidden = false;
video.inert = true;
filmCover.addEventListener("click", async () => {
  filmCover.hidden = true;
  video.inert = false;
  try {
    await video.play();
    video.focus();
  } catch {
    // Native controls remain usable if a browser blocks scripted playback.
    announce("Use the video controls to start the film.");
    video.focus();
  }
});
video.addEventListener("ended", () => {
  filmCover.hidden = false;
  const wasFocused = document.activeElement === video;
  video.inert = true;
  if (wasFocused) filmCover.focus();
});
video.addEventListener("error", () =>
  announce(
    "The film could not load. You can open it from the link in the player.",
  ),
);

const scene = document.querySelector("#reading-scene");
const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
if (window.matchMedia("(pointer: fine)").matches) {
  scene.addEventListener("pointermove", (event) => {
    if (motionQuery.matches) return;
    const bounds = scene.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    scene.style.transform = `perspective(1100px) rotateY(${x * 6}deg) rotateX(${-y * 4}deg)`;
  });
  scene.addEventListener("pointerleave", () => {
    scene.style.transform = "";
  });
}

let toastTimer;
function announce(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 4000);
}

const titles = {
  architecture: "A softer kind of structure.",
  studio: "Make room for a little wild.",
  attention: "Attention is a beginning.",
};
const ids = Object.keys(titles);
let state = { saved: [...ids], notes: {} };
try {
  const previous = JSON.parse(localStorage.getItem(storageKey));
  if (previous && typeof previous === "object" && !Array.isArray(previous)) {
    if (Array.isArray(previous.saved))
      state.saved = ids.filter((id) => previous.saved.includes(id));
    for (const id of ids) {
      if (Array.isArray(previous.notes?.[id])) {
        state.notes[id] = previous.notes[id]
          .filter((note) => typeof note === "string" && note.trim())
          .slice(-10)
          .map((note) => note.slice(0, 280));
      }
    }
  }
} catch {
  // A blocked store or malformed preview data must never break the page.
}

function persist() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    /* The prototype continues to work for the current visit. */
  }
}

function updateSaved() {
  document.querySelector("#saved-count").textContent = String(
    state.saved.length,
  );
  for (const card of document.querySelectorAll(".idea-card")) {
    const button = card.querySelector(".bookmark-button");
    const saved = state.saved.includes(card.dataset.item);
    button.setAttribute("aria-pressed", String(saved));
    button.setAttribute(
      "aria-label",
      `${saved ? "Unsave" : "Save"} ${titles[card.dataset.item].replace(/\.$/, "")}`,
    );
    button.classList.toggle("is-saved", saved);
  }
}

function showNotes(card) {
  const container = card.querySelector(".user-notes");
  container.replaceChildren();
  for (const note of state.notes[card.dataset.item] ?? []) {
    const row = document.createElement("div");
    row.className = "idea-note";
    const avatar = document.createElement("span");
    avatar.className = "note-avatar";
    avatar.textContent = "Y";
    const text = document.createElement("p");
    text.textContent = note;
    row.append(avatar, text);
    container.append(row);
  }
}

for (const card of document.querySelectorAll(".idea-card")) {
  const id = card.dataset.item;
  card.querySelector(".bookmark-button").addEventListener("click", () => {
    const wasSaved = state.saved.includes(id);
    state.saved = wasSaved
      ? state.saved.filter((saved) => saved !== id)
      : [...state.saved, id];
    updateSaved();
    persist();
    announce(
      wasSaved
        ? "Removed from your saved preview. Tap the bookmark to keep it again."
        : "Saved in this browser’s preview.",
    );
  });
  card.querySelector(".comment-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = event.currentTarget.elements.note;
    const value = input.value.trim();
    if (!value) {
      input.focus();
      return;
    }
    state.notes[id] = [...(state.notes[id] ?? []), value.slice(0, 280)].slice(
      -10,
    );
    persist();
    showNotes(card);
    input.value = "";
    input.focus();
    announce("A thought kept for later. Saved only in this browser.");
  });
  showNotes(card);
}
updateSaved();

for (const filter of document.querySelectorAll("[data-filter]")) {
  filter.addEventListener("click", () => {
    for (const button of document.querySelectorAll("[data-filter]")) {
      const selected = button === filter;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", String(selected));
    }
    for (const card of document.querySelectorAll(".idea-card")) {
      card.hidden =
        filter.dataset.filter !== "all" &&
        card.dataset.category !== filter.dataset.filter;
    }
    document.querySelector(".collection-scroll").scrollTop = 0;
  });
}

// Curated examples demonstrate the proposed product, without making an AI request.
const connections = {
  architecture: {
    work: "That archway you saved could inspire a softer visual direction for your next project. Start with warm neutrals, simple shapes, and a little more space.",
    project:
      "A personal website, a sketchbook, a room of your own: try borrowing this archway’s simple curves and warm palette. Your saved studio image shares the same quiet feeling.",
    life: "There’s something calming about a little open space. This image and your saved studio could be a starting point for clearing a corner at home—just for you.",
  },
  studio: {
    work: "Your studio image and the archway share natural textures and breathing room. Together, they could become the beginning of a moodboard for a warmer, calmer project.",
    project:
      "This could be the first page of a small creative ritual: a notebook, something growing, and ten minutes with an idea. Pair it with the thought you saved about paying attention.",
    life: "A branch, a clear surface, a moment of sunlight. Try one small change to your morning space. You don’t need a whole new routine to make a little room.",
  },
  attention: {
    work: "Before the next brief, revisit the images you saved. The archway and the studio both make space for a single idea. Could that be a useful starting point for your work?",
    project:
      "Open a blank page and write down what caught your attention in each saved image. You already have the beginnings of a theme: warmth, space, and room to think.",
    life: "What’s one small thing you noticed today? Keep a sentence or an image beside this thought. Over time, you might see what keeps drawing you back.",
  },
};
let selectedIdea = "architecture";
const contextSelect = document.querySelector("#connection-context");
function showConnection() {
  document.querySelector("#connection-result").textContent =
    connections[selectedIdea][contextSelect.value];
  document.querySelector("#connection-source").textContent =
    `Connected to “${titles[selectedIdea]}”`;
}
contextSelect.addEventListener("change", showConnection);
for (const button of document.querySelectorAll("[data-connect]")) {
  button.addEventListener("click", () => {
    selectedIdea = button.dataset.connect;
    showConnection();
    const panel = document.querySelector("#connection-panel");
    panel.scrollIntoView({
      behavior: motionQuery.matches ? "instant" : "smooth",
      block: "nearest",
    });
    panel.focus({ preventScroll: true });
  });
}
