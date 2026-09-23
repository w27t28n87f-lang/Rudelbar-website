const OWNER = "w27t28n87f-lang";
const REPO = "Rudelbar-website";
const BRANCH = "main";

const ALLOWED_ORIGINS = [
  "https://rudelbar.de",
  "https://www.rudelbar.de"
];

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const corsOrigin = ALLOWED_ORIGINS.includes(origin)
      ? origin
      : ALLOWED_ORIGINS[0];

    const corsHeaders = {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
      "Access-Control-Allow-Headers": "Content-Type, X-Rudelbar-Key",
      "Vary": "Origin"
    };

    // Browser-CORS-Anfrage
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    // Kleiner Funktionstest
    if (request.method === "GET") {
      return json(
        {
          ok: true,
          service: "Rudelbar Teamfoto API",
          status: "bereit"
        },
        200,
        corsHeaders
      );
    }

    if (request.method !== "POST") {
      return json(
        { ok: false, error: "Methode nicht erlaubt." },
        405,
        corsHeaders
      );
    }

    // Nur rudelbar.de darf Browser-Anfragen senden
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      return json(
        { ok: false, error: "Origin nicht erlaubt." },
        403,
        corsHeaders
      );
    }

    // Admin-Schlüssel prüfen
    const adminKey = request.headers.get("X-Rudelbar-Key");

    if (!adminKey || adminKey !== env.ADMIN_KEY) {
      return json(
        { ok: false, error: "Admin-Schlüssel ist falsch." },
        401,
        corsHeaders
      );
    }

    if (!env.GITHUB_TOKEN) {
      return json(
        { ok: false, error: "GITHUB_TOKEN fehlt im Worker." },
        500,
        corsHeaders
      );
    }

    try {
      const body = await request.json();

      const memberName = String(body.memberName || "").trim();
      const imageData = String(body.image || "");

      if (!memberName) {
        throw new Error("Kein Teammitglied angegeben.");
      }

      if (!imageData.startsWith("data:image/jpeg;base64,")) {
        throw new Error("Das Bild muss als JPEG übertragen werden.");
      }

      const base64 = imageData.split(",")[1];

      // Schutz vor versehentlich riesigen Uploads
      if (!base64 || base64.length > 8_000_000) {
        throw new Error("Bild ist zu groß.");
      }

      const slug = slugify(memberName);
      const timestamp = Date.now();

      // Neue Datei pro Änderung verhindert Cache-Probleme.
      const imagePath =
        `images/team/${slug}-${timestamp}.jpg`;

      // 1. Bild zu GitHub schreiben
      await githubPutFile(
        imagePath,
        base64,
        `Teamfoto aktualisiert: ${memberName}`,
        env.GITHUB_TOKEN
      );

      // 2. Aktuelle site.json laden
      const siteFile = await githubGetFile(
        "site.json",
        env.GITHUB_TOKEN
      );

      const siteText = decodeBase64Utf8(siteFile.content);
      const site = JSON.parse(siteText);

      if (!Array.isArray(site.team)) {
        throw new Error(
          "In site.json wurde kein Team-Array gefunden."
        );
      }

      // Teammitglied suchen
      const memberIndex = site.team.findIndex((member) => {
        return String(member.name || "")
          .trim()
          .toLowerCase() === memberName.toLowerCase();
      });

      if (memberIndex === -1) {
        throw new Error(
          `Teammitglied "${memberName}" wurde in site.json nicht gefunden.`
        );
      }

      // Bildpfad aktualisieren
      site.team[memberIndex].image = imagePath;

      const newSiteJson =
        JSON.stringify(site, null, 2) + "\n";

      const encodedSiteJson =
        encodeBase64Utf8(newSiteJson);

      // 3. site.json aktualisieren
      await githubPutFile(
        "site.json",
        encodedSiteJson,
        `Teamfoto-Verknüpfung aktualisiert: ${memberName}`,
        env.GITHUB_TOKEN,
        siteFile.sha
      );

      return json(
        {
          ok: true,
          message: "Teamfoto erfolgreich gespeichert.",
          member: memberName,
          image: imagePath
        },
        200,
        corsHeaders
      );

    } catch (error) {
      console.error(error);

      return json(
        {
          ok: false,
          error: error.message || "Unbekannter Fehler."
        },
        500,
        corsHeaders
      );
    }
  }
};


// --------------------------------------------------
// GitHub
// --------------------------------------------------

async function githubGetFile(path, token) {
  const url =
    `https://api.github.com/repos/${OWNER}/${REPO}` +
    `/contents/${encodePath(path)}?ref=${BRANCH}`;

  const response = await fetch(url, {
    headers: githubHeaders(token)
  });

  if (!response.ok) {
    const text = await response.text();

    throw new Error(
      `GitHub konnte ${path} nicht laden ` +
      `(${response.status}): ${text}`
    );
  }

  return await response.json();
}


async function githubPutFile(
  path,
  content,
  message,
  token,
  sha = null
) {
  const url =
    `https://api.github.com/repos/${OWNER}/${REPO}` +
    `/contents/${encodePath(path)}`;

  const payload = {
    message,
    content,
    branch: BRANCH
  };

  if (sha) {
    payload.sha = sha;
  }

  const response = await fetch(url, {
    method: "PUT",
    headers: githubHeaders(token),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();

    throw new Error(
      `GitHub konnte ${path} nicht speichern ` +
      `(${response.status}): ${text}`
    );
  }

  return await response.json();
}


function githubHeaders(token) {
  return {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Rudelbar-Teamfoto-Worker"
  };
}


// --------------------------------------------------
// Hilfsfunktionen
// --------------------------------------------------

function encodePath(path) {
  return path
    .split("/")
    .map(encodeURIComponent)
    .join("/");
}


function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "teammitglied";
}


function decodeBase64Utf8(base64) {
  const cleaned = base64.replace(/\n/g, "");
  const binary = atob(cleaned);

  const bytes = Uint8Array.from(
    binary,
    char => char.charCodeAt(0)
  );

  return new TextDecoder().decode(bytes);
}


function encodeBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text);

  let binary = "";

  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}


function json(data, status, corsHeaders) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    }
  );
}
