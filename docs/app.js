(() => {
  "use strict";

  const catalog = window.CODEX_RESOURCE_CATALOG;
  if (!catalog?.resources?.length) {
    document.getElementById("result-summary").textContent = "Catalog failed to load.";
    return;
  }

  const elements = {
    search: document.getElementById("search-input"),
    categories: document.getElementById("category-list"),
    risk: document.getElementById("risk-filter"),
    savedOnly: document.getElementById("saved-only"),
    savedCount: document.getElementById("saved-count"),
    sort: document.getElementById("sort-select"),
    grid: document.getElementById("resource-grid"),
    summary: document.getElementById("result-summary"),
    activeFilter: document.getElementById("active-filter"),
    empty: document.getElementById("empty-state"),
    clear: document.getElementById("clear-filters"),
    gridView: document.getElementById("grid-view"),
    listView: document.getElementById("list-view"),
    toast: document.getElementById("toast"),
    theme: document.getElementById("theme-toggle"),
  };

  const categoryById = new Map(catalog.categories.map((category) => [category.id, category]));
  const categoryOrder = new Map(catalog.categories.map((category, index) => [category.id, index]));
  const saved = new Set(readStorage("codex-workbench-saved", []));
  const params = new URLSearchParams(location.search);
  const validCategory = categoryById.has(params.get("category")) ? params.get("category") : "all";

  const state = {
    query: params.get("q") ?? "",
    category: validCategory,
    risk: ["standard", "review"].includes(params.get("risk")) ? params.get("risk") : "all",
    savedOnly: params.get("saved") === "1",
    sort: "featured",
    view: readStorage("codex-workbench-view", "grid"),
  };

  function readStorage(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage can be unavailable in hardened or file-based browser contexts.
    }
  }

  function normalize(value) {
    return String(value ?? "").toLocaleLowerCase().normalize("NFKD");
  }

  function searchText(resource) {
    return normalize([
      resource.name,
      resource.description,
      resource.kind,
      resource.category,
      categoryById.get(resource.category)?.label,
      ...resource.tags,
      resource.verification.repository,
    ].join(" "));
  }

  function getVisibleResources() {
    const terms = normalize(state.query).split(/\s+/).filter(Boolean);
    const resources = catalog.resources.filter((resource) => {
      if (state.category !== "all" && resource.category !== state.category) return false;
      if (state.risk !== "all" && resource.risk !== state.risk) return false;
      if (state.savedOnly && !saved.has(resource.id)) return false;
      const haystack = searchText(resource);
      return terms.every((term) => haystack.includes(term));
    });

    return resources.sort((a, b) => {
      if (state.sort === "az") return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
      if (state.sort === "recent") {
        const dateDelta = String(b.verification.lastPush ?? "").localeCompare(String(a.verification.lastPush ?? ""));
        return dateDelta || a.name.localeCompare(b.name, "en", { sensitivity: "base" });
      }
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      if (a.category === "official" && b.category !== "official") return -1;
      if (b.category === "official" && a.category !== "official") return 1;
      const categoryDelta = categoryOrder.get(a.category) - categoryOrder.get(b.category);
      return categoryDelta || a.name.localeCompare(b.name, "en", { sensitivity: "base" });
    });
  }

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function renderCategories() {
    const fragment = document.createDocumentFragment();
    const definitions = [{ id: "all", label: "All resources" }, ...catalog.categories];
    for (const category of definitions) {
      const count = category.id === "all"
        ? catalog.resources.length
        : catalog.resources.filter((resource) => resource.category === category.id).length;
      const button = make("button", `category-button${state.category === category.id ? " active" : ""}`);
      button.type = "button";
      button.dataset.category = category.id;
      button.setAttribute("aria-pressed", String(state.category === category.id));
      button.append(make("span", "", category.label), make("output", "", String(count)));
      button.addEventListener("click", () => {
        state.category = category.id;
        render();
      });
      fragment.append(button);
    }
    elements.categories.replaceChildren(fragment);
  }

  function renderCard(resource) {
    const card = make("article", `resource-card ${resource.risk}`);
    const top = make("div", "card-top");
    const badges = make("div", "badge-row");
    const category = categoryById.get(resource.category);
    badges.append(make("span", `badge${resource.category === "official" ? " official" : ""}`, category.label));
    if (resource.risk === "review") badges.append(make("span", "badge risk", "Review"));

    const save = make("button", `save-button${saved.has(resource.id) ? " saved" : ""}`, saved.has(resource.id) ? "◆" : "◇");
    save.type = "button";
    save.title = saved.has(resource.id) ? "Remove from saved" : "Save resource";
    save.setAttribute("aria-label", save.title);
    save.addEventListener("click", () => toggleSaved(resource.id));
    top.append(badges, save);

    const heading = make("h3");
    const link = make("a", "", resource.name);
    link.href = resource.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    heading.append(link);

    const description = make("p", "", resource.description);
    const tags = make("div", "tag-list");
    for (const tag of resource.tags.slice(0, 4)) tags.append(make("span", "tag", tag));

    const footer = make("div", "card-footer");
    const verification = make("span", "verification");
    verification.title = `Checked ${resource.verification.checkedAt} via ${resource.verification.method}`;
    verification.append(make("i"), document.createTextNode(resource.verification.status === "official" ? "Official source" : `Checked ${resource.verification.checkedAt}`));

    const actions = make("div", "card-actions");
    const copy = make("button", "", "⧉");
    copy.type = "button";
    copy.title = "Copy link";
    copy.setAttribute("aria-label", `Copy link to ${resource.name}`);
    copy.addEventListener("click", () => copyLink(resource.url));
    const open = make("a", "", "↗");
    open.href = resource.url;
    open.target = "_blank";
    open.rel = "noreferrer";
    open.title = "Open resource";
    open.setAttribute("aria-label", `Open ${resource.name}`);
    actions.append(copy, open);
    footer.append(verification, actions);

    card.append(top, heading, description, tags, footer);
    return card;
  }

  function updateUrl() {
    const next = new URLSearchParams();
    if (state.query) next.set("q", state.query);
    if (state.category !== "all") next.set("category", state.category);
    if (state.risk !== "all") next.set("risk", state.risk);
    if (state.savedOnly) next.set("saved", "1");
    const query = next.toString();
    history.replaceState(null, "", `${location.pathname}${query ? `?${query}` : ""}${location.hash}`);
  }

  function render() {
    renderCategories();
    const resources = getVisibleResources();
    const fragment = document.createDocumentFragment();
    for (const resource of resources) fragment.append(renderCard(resource));
    elements.grid.replaceChildren(fragment);
    elements.grid.setAttribute("aria-busy", "false");
    elements.grid.classList.toggle("list-view", state.view === "list");
    elements.empty.hidden = resources.length > 0;
    elements.grid.hidden = resources.length === 0;
    elements.summary.textContent = `${resources.length} of ${catalog.resources.length} resources`;
    elements.savedCount.textContent = String(saved.size);
    elements.search.value = state.query;
    elements.risk.value = state.risk;
    elements.savedOnly.checked = state.savedOnly;
    elements.sort.value = state.sort;
    elements.gridView.classList.toggle("active", state.view === "grid");
    elements.listView.classList.toggle("active", state.view === "list");
    elements.gridView.setAttribute("aria-pressed", String(state.view === "grid"));
    elements.listView.setAttribute("aria-pressed", String(state.view === "list"));

    const filters = [];
    if (state.query) filters.push(`search “${state.query}”`);
    if (state.category !== "all") filters.push(categoryById.get(state.category).label);
    if (state.risk !== "all") filters.push(state.risk === "review" ? "extra review advised" : "standard review");
    if (state.savedOnly) filters.push("saved only");
    elements.activeFilter.hidden = filters.length === 0;
    elements.activeFilter.replaceChildren(document.createTextNode("Active: "), make("strong", "", filters.join(" · ")));
    updateUrl();
  }

  function resetFilters() {
    state.query = "";
    state.category = "all";
    state.risk = "all";
    state.savedOnly = false;
    render();
  }

  function toggleSaved(id) {
    if (saved.has(id)) saved.delete(id);
    else saved.add(id);
    writeStorage("codex-workbench-saved", [...saved]);
    showToast(saved.has(id) ? "Saved to your workbench" : "Removed from saved");
    render();
  }

  async function copyLink(url) {
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link copied");
    } catch {
      const input = document.createElement("textarea");
      input.value = url;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.append(input);
      input.select();
      document.execCommand("copy");
      input.remove();
      showToast("Link copied");
    }
  }

  let toastTimer;
  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 1800);
  }

  function setView(view) {
    state.view = view;
    writeStorage("codex-workbench-view", view);
    render();
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.querySelector(".theme-icon").textContent = theme === "dark" ? "☼" : "☾";
    writeStorage("codex-workbench-theme", theme);
  }

  elements.search.addEventListener("input", (event) => {
    state.query = event.target.value;
    render();
  });
  elements.risk.addEventListener("change", (event) => {
    state.risk = event.target.value;
    render();
  });
  elements.savedOnly.addEventListener("change", (event) => {
    state.savedOnly = event.target.checked;
    render();
  });
  elements.sort.addEventListener("change", (event) => {
    state.sort = event.target.value;
    render();
  });
  elements.clear.addEventListener("click", resetFilters);
  elements.empty.querySelector("button").addEventListener("click", resetFilters);
  elements.gridView.addEventListener("click", () => setView("grid"));
  elements.listView.addEventListener("click", () => setView("list"));
  elements.theme.addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
  document.getElementById("show-review-risk").addEventListener("click", () => {
    state.risk = "review";
    document.getElementById("catalog").scrollIntoView({ behavior: "smooth" });
    render();
  });
  for (const button of document.querySelectorAll("[data-quick-query]")) {
    button.addEventListener("click", () => {
      state.query = button.dataset.quickQuery;
      elements.search.focus();
      render();
    });
  }
  document.addEventListener("keydown", (event) => {
    const editable = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
    if (event.key === "/" && !editable) {
      event.preventDefault();
      elements.search.focus();
    } else if (event.key === "Escape" && document.activeElement === elements.search) {
      state.query = "";
      elements.search.blur();
      render();
    }
  });

  document.getElementById("resource-count").textContent = String(catalog.resources.length);
  document.getElementById("category-count").textContent = String(catalog.categories.length);
  document.getElementById("official-count").textContent = String(catalog.resources.filter((resource) => resource.category === "official").length);
  document.getElementById("verified-count").textContent = String(catalog.resources.filter((resource) => resource.verification.status).length);
  document.getElementById("last-check").textContent = catalog.updatedAt;
  document.getElementById("last-check").dateTime = catalog.updatedAt;

  const preferredTheme = readStorage("codex-workbench-theme", matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  setTheme(preferredTheme);
  render();
})();
