const GITHUB_OWNER = "w27t28n87f-lang";
const GITHUB_REPO = "Rudelbar-website";
const GITHUB_BRANCH = "main";

const ALLOWED_ORIGINS = [
  "https://rudelbar.de",
  "https://www.rudelbar.de"
];

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    const corsHeaders = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin)
        ? origin
        : "https://rudelbar.de",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Rudelbar-Key",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    if (request.method !== "POST") {
      return json(
        {
          ok: false,
          error: "Nur POST-Anfragen sind erlaubt."
        },
        405,
        corsHeaders
      );
    }

    if (!env.GITHUB_TOKEN) {
      return json(
        {
          ok: false,
          error: "GITHUB_TOKEN fehlt im Worker."
        },
        500,
        corsHeaders
      );
    }

    if (!env.ADMIN_KEY) {
      return json(
        {
          ok: false,
          error: "ADMIN_KEY fehlt im Worker."
        },
        500,
        corsHeaders
      );
    }

    const suppliedKey = request.headers.get("X-Rudelbar-Key") || "";

    if (suppliedKey !== env.ADMIN_KEY) {
      return json(
        {
          ok: false,
          error: "Falscher Admin-Schlüssel."
        },
        401,
        corsHeaders
      );
    }

    try {
      const body = await request.json();

      const memberName = String(body.memberName || "").trim();
      const imageBase64 = String(body.imageBase64 || "")
        .replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");

      if (!memberName) {
        throw new Error("Kein Teammitglied angegeben.");
      }

      if (!imageBase64) {
        throw new Error("Keine Bilddaten empfangen.");
      }

      // Sicherheitshalber keine riesigen Dateien an GitHub schicken.
      // Der Fotoeditor erzeugt ohnehin ein komprimiertes JPG.
      if (imageBase64.length > 8_000_000) {
        throw new Error("Das Bild ist zu groß.");
      }

      const slug = slugify(memberName);
      const timestamp = Date.now();

      // Bei jedem Speichern neuer Dateiname.
      // Dadurch zeigt GitHub Pages garantiert das neue Bild
      // und wir kämpfen nicht gegen den Browser-Cache.
      const imagePath =
        `images/team/${slug}-${timestamp}.jpg`;

      // ----------------------------------------------------------
      // 1. Neues Bild bei GitHub speichern
      // ----------------------------------------------------------

      await githubPut(
        imagePath,
        imageBase64,
        `Teamfoto aktualisiert: ${memberName}`,
        env.GITHUB_TOKEN
      );

      // ----------------------------------------------------------
      // 2. Aktuelle site.json laden
      // ----------------------------------------------------------

      const siteFile = await githubGet(
        "site.json",
        env.GITHUB_TOKEN
      );

      if (!siteFile || !siteFile.content || !siteFile.sha) {
        throw new Error("site.json konnte nicht von GitHub geladen werden.");
      }

      const siteText = decodeBase64Utf8(
        siteFile.content.replace(/\n/g, "")
      );

      const site = JSON.parse(siteText);

      // Tatsächliche Struktur der Rudelbar-site.json:
      // site.team.members
      if (!Array.isArray(site.team?.members)) {
        throw new Error(
          "In site.json wurden keine Teammitglieder gefunden."
        );
      }

      const memberIndex = site.team.members.findIndex(member =>
        String(member.name || "")
          .trim()
          .toLowerCase() === memberName.toLowerCase()
      );

      if (memberIndex === -1) {
        throw new Error(
          `Teammitglied "${memberName}" wurde in site.json nicht gefunden.`
        );
      }

      // Neues Bild eintragen.
      site.team.members[memberIndex].image =
        "/" + imagePath;

      // ----------------------------------------------------------
      // 3. site.json wieder speichern
      // ----------------------------------------------------------

      const newSiteText =
        JSON.stringify(site, null, 2) + "\n";

      const newSiteBase64 =
        encodeBase64Utf8(newSiteText);

      await githubPut(
        "site.json",
        newSiteBase64,
        `Website-Teamfoto aktualisiert: ${memberName}`,
        env.GITHUB_TOKEN,
        siteFile.sha
      );

      return json(
        {
          ok: true,
          member: memberName,
          image: "/" + imagePath,
          message:
            "Teamfoto wurde gespeichert und site.json aktualisiert."
        },
        200,
        corsHeaders
      );

    } catch (error) {
      console.error(error);

      return json(
        {
          ok: false,
          error:
            error?.message ||
            "Unbekannter Fehler beim Speichern."
        },
        500,
        corsHeaders
      );
    }
  }
};


// ================================================================
// GitHub
// ================================================================

async function githubGet(path, token) {
  const url =
    `https://api.github.com/repos/` +
    `${GITHUB_OWNER}/${GITHUB_REPO}/contents/` +
    `${encodePath(path)}?ref=${encodeURIComponent(GITHUB_BRANCH)}`;

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

  return response.json();
}


async function githubPut(
  path,
  base64Content,
  message,
  token,
  sha = null
) {
  const url =
    `https://api.github.com/repos/` +
    `${GITHUB_OWNER}/${GITHUB_REPO}/contents/` +
    encodePath(path);

  const payload = {
    message,
    content: base64Content,
    branch: GITHUB_BRANCH
  };

  if (sha) {
    payload.sha = sha;
  }

  const response = await fetch(url, {
    method: "PUT",

    headers: {
      ...githubHeaders(token),
      "Content-Type": "application/json"
    },

    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();

    throw new Error(
      `GitHub konnte ${path} nicht speichern ` +
      `(${response.status}): ${text}`
    );
  }

  return response.json();
}


function githubHeaders(token) {
  return {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Rudelbar-Teamfoto-Worker"
  };
}


// ================================================================
// Hilfsfunktionen
// ================================================================

function slugify(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "teamfoto";
}


function encodePath(path) {
  return path
    .split("/")
    .map(part => encodeURIComponent(part))
    .join("/");
}


function decodeBase64Utf8(base64) {
  const binary = atob(base64);

  const bytes = Uint8Array.from(
    binary,
    char => char.charCodeAt(0)
  );

  return new TextDecoder().decode(bytes);
}


function encodeBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text);

  let binary = "";

  const chunkSize = 0x8000;

  for (
    let i = 0;
    i < bytes.length;
    i += chunkSize
  ) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, i + chunkSize)
    );
  }

  return btoa(binary);
}


function json(data, status, corsHeaders) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        "Content-Type":
          "application/json; charset=utf-8",
        ...corsHeaders
      }
    }
  );
}
