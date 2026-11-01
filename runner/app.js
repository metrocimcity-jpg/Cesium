import { findSample, samples } from "./gallery.js";

const listEl = document.getElementById("sample-list");
const searchEl = document.getElementById("sample-search");
const countEl = document.getElementById("sample-count");
const frameEl = document.getElementById("sample-frame");
const titleEl = document.getElementById("sample-title");
const descEl = document.getElementById("sample-description");
const sidebarEl = document.getElementById("sidebar");
const toggleEl = document.getElementById("sidebar-toggle");

const DEFAULT_SLUG = "hello-world";

function currentSlug() {
  const hash = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
  return hash || DEFAULT_SLUG;
}

function renderList(filter = "") {
  const query = filter.trim().toLowerCase();
  const visible = samples.filter((sample) => {
    if (!query) return true;
    return (
      sample.title.toLowerCase().includes(query) ||
      sample.slug.toLowerCase().includes(query) ||
      sample.labels.some((label) => label.toLowerCase().includes(query)) ||
      sample.description.toLowerCase().includes(query)
    );
  });

  countEl.textContent = `${visible.length} of ${samples.length}`;
  const active = currentSlug();
  listEl.replaceChildren(
    ...visible.map((sample) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "sample-item";
      button.dataset.slug = sample.slug;
      button.setAttribute("aria-current", sample.slug === active ? "true" : "false");

      const img = document.createElement("img");
      img.src = sample.thumbnail;
      img.alt = "";
      img.loading = "lazy";
      img.width = 72;
      img.height = 48;

      const meta = document.createElement("span");
      meta.className = "sample-item-meta";

      const name = document.createElement("span");
      name.className = "sample-item-title";
      name.textContent = sample.title || sample.slug;

      const labels = document.createElement("span");
      labels.className = "sample-item-labels";
      labels.textContent = sample.labels.slice(0, 2).join(" · ");

      meta.append(name, labels);
      button.append(img, meta);
      button.addEventListener("click", () => loadSample(sample.slug));
      return button;
    }),
  );
}

function loadSample(slug) {
  const sample = findSample(slug) ?? findSample(DEFAULT_SLUG);
  if (!sample) return;

  if (location.hash !== `#/${sample.slug}`) {
    history.pushState({ slug: sample.slug }, "", `#/${sample.slug}`);
  }

  titleEl.textContent = sample.title;
  descEl.textContent = sample.description;
  document.title = `${sample.title} · MetroCIM`;
  frameEl.src = `/viewer.html?sample=${encodeURIComponent(sample.slug)}`;

  for (const item of listEl.querySelectorAll(".sample-item")) {
    item.setAttribute(
      "aria-current",
      item.dataset.slug === sample.slug ? "true" : "false",
    );
  }

  const active = listEl.querySelector(`[data-slug="${sample.slug}"]`);
  active?.scrollIntoView({ block: "nearest" });
}

searchEl.addEventListener("input", () => renderList(searchEl.value));
toggleEl.addEventListener("click", () => {
  sidebarEl.classList.toggle("collapsed");
  toggleEl.setAttribute(
    "aria-expanded",
    sidebarEl.classList.contains("collapsed") ? "false" : "true",
  );
});
window.addEventListener("popstate", () => {
  renderList(searchEl.value);
  loadSample(currentSlug());
});

renderList();
loadSample(currentSlug());
