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

const form = document.getElementById("eventForm");

form?.addEventListener("submit", (event) => {
  event.preventDefault();

  const data = new FormData(form);
  const name = data.get("name") || "";
  const telefon = data.get("telefon") || "-";
  const email = data.get("email") || "";
  const datum = data.get("datum") || "-";
  const gaeste = data.get("gaeste") || "-";
  const ort = data.get("ort") || "-";
  const nachricht = data.get("nachricht") || "";

  const subject = encodeURIComponent(`Eventanfrage Rudelbar – ${name}`);
  const body = encodeURIComponent(
`Moin Rudelbar,

ich möchte ein Event anfragen.

Name: ${name}
E-Mail: ${email}
Telefon: ${telefon}
Datum: ${datum}
Veranstaltungsort: ${ort}
Gästezahl: ${gaeste}

Nachricht:
${nachricht}

Viele Grüße
${name}`
  );

  /*
    WICHTIG:
    Vor Veröffentlichung hier eure echte Rudelbar-E-Mail-Adresse eintragen.
  */
  const rudelbarEmail = "DEINE-EMAIL@RUDELBAR.DE";

  window.location.href = `mailto:${rudelbarEmail}?subject=${subject}&body=${body}`;
});
