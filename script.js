let SITE = null;

const getValue = (object, path) =>
  path.split(".").reduce((value, key) => value?.[key], object);
function normalizeMediaPath(value) {
  // Pages CMS normally stores image fields as strings. Some versions/configs
  // can return a small object, so accept both forms.
  if (value && typeof value === "object") {
    value = value.src || value.path || value.url || value.value || "";
  }
  if (!value || typeof value !== "string") return "";

  let path = value.trim().replace(/\\/g, "/");
  if (!path) return "";
  if (/^(https?:|data:|blob:)/i.test(path)) return path;

  // Remove CMS/GitHub-style prefixes, but keep the image inside /images.
  path = path.replace(/^\.\//, "");
  path = path.replace(/^\/+/, "");

  const imagesIndex = path.toLowerCase().indexOf("images/");
  if (imagesIndex >= 0) path = path.slice(imagesIndex);
  else path = `images/${path.split("/").pop()}`;

  // Resolve relative to the current GitHub Pages site root. This works both
  // on <user>.github.io/<repo>/ and on a later custom domain.
  return new URL(path, document.baseURI).href;
}

async function loadSite() {
  const response = await fetch(`site.json?v=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error("site.json konnte nicht geladen werden.");
  SITE = await response.json();

  document.querySelectorAll("[data-content]").forEach(element => {
    const value = getValue(SITE, element.dataset.content);
    if (value !== undefined && value !== null) element.textContent = value;
  });

  document.querySelectorAll("[data-section]").forEach(element => {
    const visible = SITE.visibility?.[element.dataset.section] !== false;
    element.hidden = !visible;
  });

  document.querySelectorAll("[data-section-link]").forEach(element => {
    const visible = SITE.visibility?.[element.dataset.sectionLink] !== false;
    element.hidden = !visible;
  });

  renderServices();
  renderTeam();
  renderMobileImage();
}

function renderServices() {
  const container = document.getElementById("serviceCards");
  if (!container) return;
  container.innerHTML = "";

  (SITE.services?.items || []).forEach((item, index) => {
    const article = document.createElement("article");
    article.className = "card";

    const number = document.createElement("span");
    number.className = "card-number";
    number.textContent = String(index + 1).padStart(2, "0");

    const title = document.createElement("h3");
    title.textContent = item.title || "";

    const text = document.createElement("p");
    text.textContent = item.text || "";

    article.append(number, title, text);
    container.appendChild(article);
  });
}

function renderTeam() {
  const container = document.getElementById("teamGrid");
  if (!container) return;
  container.innerHTML = "";

  (SITE.team?.members || []).forEach(member => {
    const card = document.createElement("article");
    card.className = "team-card";

    const media = document.createElement("div");
    media.className = "team-photo";

    if (member.image) {
      const img = document.createElement("img");
      img.src = normalizeMediaPath(member.image);
      img.alt = member.name ? `Foto von ${member.name}` : "Rudelbar Teammitglied";
      img.loading = "lazy";
      media.appendChild(img);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "team-placeholder";
      placeholder.textContent = "🐺";
      media.appendChild(placeholder);
    }

    const body = document.createElement("div");
    body.className = "team-body";

    const name = document.createElement("h3");
    name.textContent = member.name || "Teammitglied";

    const role = document.createElement("p");
    role.className = "team-role";
    role.textContent = member.role || "";

    const description = document.createElement("p");
    description.className = "team-description";
    description.textContent = member.description || "";

    body.append(name, role, description);
    card.append(media, body);
    container.appendChild(card);
  });
}

function renderMobileImage() {
  const visual = document.getElementById("mobileVisual");
  const placeholder = document.getElementById("mobilePlaceholder");
  const image = normalizeMediaPath(SITE.mobile?.image);

  if (!visual) return;
  visual.querySelector(".cms-mobile-image")?.remove();

  if (!image) {
    visual.classList.remove("has-cms-image");
    return;
  }

  const img = document.createElement("img");
  img.className = "cms-mobile-image";
  img.src = image;
  img.alt = SITE.mobile?.imageAlt || "Rudelbar";
  img.loading = "lazy";

  img.addEventListener("load", () => {
    visual.classList.add("has-cms-image");
  });
  img.addEventListener("error", () => {
    visual.classList.remove("has-cms-image");
    console.error("Rudelbar: Bild konnte nicht geladen werden:", image);
  });

  visual.prepend(img);
  if (placeholder) placeholder.textContent = SITE.mobile?.imageAlt || "";
}

const menuButton = document.querySelector(".menu-toggle");
const nav = document.querySelector(".main-nav");

menuButton?.addEventListener("click", () => {
  const open = nav.classList.toggle("open");
  menuButton.setAttribute("aria-expanded", String(open));
});

document.querySelectorAll(".main-nav a").forEach(link => {
  link.addEventListener("click", () => {
    nav.classList.remove("open");
    menuButton?.setAttribute("aria-expanded", "false");
  });
});

document.getElementById("year").textContent = new Date().getFullYear();

document.getElementById("eventForm")?.addEventListener("submit", event => {
  event.preventDefault();

  const data = new FormData(event.currentTarget);
  const name = data.get("name") || "";
  const subject = encodeURIComponent(`Eventanfrage Rudelbar – ${name}`);
  const body = encodeURIComponent(
`Moin Rudelbar,

ich möchte ein Event anfragen.

Name: ${name}
E-Mail: ${data.get("email") || ""}
Telefon: ${data.get("telefon") || "-"}
Datum: ${data.get("datum") || "-"}
Veranstaltungsort: ${data.get("ort") || "-"}
Gästezahl: ${data.get("gaeste") || "-"}

Nachricht:
${data.get("nachricht") || ""}

Viele Grüße
${name}`
  );

  const rudelbarEmail = SITE?.brand?.email || "";
  if (!rudelbarEmail || rudelbarEmail.includes("DEINE-EMAIL")) {
    alert("Bitte zuerst die Rudelbar-E-Mail-Adresse in der Website-Verwaltung eintragen.");
    return;
  }

  window.location.href = `mailto:${rudelbarEmail}?subject=${subject}&body=${body}`;
});

loadSite().catch(error => {
  console.error(error);
  document.body.insertAdjacentHTML(
    "afterbegin",
    '<div style="position:fixed;z-index:9999;bottom:12px;left:12px;right:12px;padding:12px;background:#8b0000;color:white;text-align:center">Website-Inhalte konnten nicht geladen werden.</div>'
  );
});