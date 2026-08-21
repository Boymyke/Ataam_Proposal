import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

const CSV_KEY = "vault.csv";
const STORE_NAME = "ferrn-private-archive";
const COOKIE_NAME = "ferrn_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

const HEADERS = [
  "type",
  "id",
  "title",
  "url",
  "category",
  "description",
  "year",
  "image",
  "featured",
  "password_hash",
];

function json(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

function parseBody(event) {
  try {
    return JSON.parse(event.body || "{}");
  } catch {
    return {};
  }
}

function csvEscape(value = "") {
  const stringValue = String(value ?? "");

  return /[",\n\r]/.test(stringValue)
    ? `"${stringValue.replace(/"/g, '""')}"`
    : stringValue;
}

function toCSV(rows) {
  return [
    HEADERS.join(","),
    ...rows.map((row) =>
      HEADERS.map((header) => csvEscape(row[header] ?? "")).join(","),
    ),
  ].join("\n");
}

function parseCSV(text = "") {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const character = text[i];

    if (quoted) {
      if (character === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else {
      if (character === '"') {
        quoted = true;
      } else if (character === ",") {
        row.push(field);
        field = "";
      } else if (character === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (character !== "\r") {
        field += character;
      }
    }
  }

  row.push(field);

  if (row.some((value) => value !== "")) {
    rows.push(row);
  }

  if (!rows.length) {
    return [];
  }

  const headers = rows.shift();

  return rows.map((columns) =>
    Object.fromEntries(
      headers.map((header, index) => [header, columns[index] ?? ""]),
    ),
  );
}

function scryptHash(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);

  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function verifyPassword(password, storedHash) {
  try {
    const [kind, saltHex, hashHex] = String(storedHash).split("$");

    if (kind !== "scrypt" || !saltHex || !hashHex) {
      return false;
    }

    const actual = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), 64);

    const expected = Buffer.from(hashHex, "hex");

    return (
      actual.length === expected.length &&
      crypto.timingSafeEqual(actual, expected)
    );
  } catch {
    return false;
  }
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function sign(value) {
  const secret = process.env.SESSION_SECRET;

  if (!secret) {
    throw new Error("SESSION_SECRET is not configured.");
  }

  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function makeToken(passwordHash) {
  const payload = base64url(
    JSON.stringify({
      exp: Date.now() + SESSION_TTL_SECONDS * 1000,
      v: crypto
        .createHash("sha256")
        .update(passwordHash)
        .digest("hex")
        .slice(0, 20),
    }),
  );

  return `${payload}.${sign(payload)}`;
}

function readCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const index = item.indexOf("=");

        return index < 0
          ? [item, ""]
          : [item.slice(0, index), decodeURIComponent(item.slice(index + 1))];
      }),
  );
}

function validToken(token, passwordHash) {
  try {
    const [payload, signature] = String(token || "").split(".");

    if (!payload || !signature) {
      return false;
    }

    const expectedSignature = sign(payload);

    const receivedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (
      receivedBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
    ) {
      return false;
    }

    const data = JSON.parse(Buffer.from(payload, "base64url").toString());

    const version = crypto
      .createHash("sha256")
      .update(passwordHash)
      .digest("hex")
      .slice(0, 20);

    return data.exp > Date.now() && data.v === version;
  } catch {
    return false;
  }
}

function cookie(token, maxAge = SESSION_TTL_SECONDS) {
  return [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    `Max-Age=${maxAge}`,
  ].join("; ");
}

/*
|--------------------------------------------------------------------------
| NETLIFY BLOBS STORE
|--------------------------------------------------------------------------
|
| This is the important part.
|
| Your local Netlify environment was not automatically providing the
| Netlify Blobs configuration, so we provide siteID + token manually.
|
*/

function getVaultStore() {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;

  if (!siteID) {
    throw new Error("NETLIFY_SITE_ID is not configured.");
  }

  if (!token) {
    throw new Error("NETLIFY_AUTH_TOKEN is not configured.");
  }

  return getStore(STORE_NAME, {
    siteID,
    token,
  });
}

async function getRows() {
  const store = getVaultStore();

  let text = await store.get(CSV_KEY, {
    type: "text",
  });

  if (!text) {
    const initialPassword = process.env.INITIAL_VAULT_PASSWORD;

    if (!initialPassword) {
      throw new Error("INITIAL_VAULT_PASSWORD is not configured.");
    }

    const rows = [
      {
        type: "settings",
        id: "auth",
        title: "",
        url: "",
        category: "",
        description: "",
        year: "",
        image: "",
        featured: "",
        password_hash: scryptHash(initialPassword),
      },
    ];

    text = toCSV(rows);

    await store.set(CSV_KEY, text, {
      metadata: {
        contentType: "text/csv",
      },
    });
  }

  return parseCSV(text);
}

async function saveRows(rows) {
  const store = getVaultStore();

  await store.set(CSV_KEY, toCSV(rows), {
    metadata: {
      contentType: "text/csv",
    },
  });
}

function getAuthRow(rows) {
  return rows.find((row) => row.type === "settings" && row.id === "auth");
}

function isAuthed(event, rows) {
  const auth = getAuthRow(rows);

  if (!auth) {
    return false;
  }

  const cookieHeader = event.headers.cookie || event.headers.Cookie || "";

  const cookies = readCookies(cookieHeader);

  return validToken(cookies[COOKIE_NAME], auth.password_hash);
}

function sanitizeItem(raw) {
  const type = raw.type === "proposal" ? "proposal" : "website";

  let url = "";
  let image = "";

  try {
    const parsedURL = new URL(String(raw.url || ""));

    if (["http:", "https:"].includes(parsedURL.protocol)) {
      url = parsedURL.href;
    }
  } catch {}

  if (!url) {
    throw new Error("Enter a valid http(s) project URL.");
  }

  if (raw.image) {
    try {
      const parsedImageURL = new URL(String(raw.image));

      if (["http:", "https:"].includes(parsedImageURL.protocol)) {
        image = parsedImageURL.href;
      }
    } catch {}
  }

  const title = String(raw.title || "")
    .trim()
    .slice(0, 120);

  if (!title) {
    throw new Error("Project title is required.");
  }

  return {
    type,

    id: String(raw.id || crypto.randomUUID())
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 80),

    title,

    url,

    category: String(raw.category || "")
      .trim()
      .slice(0, 80),

    description: String(raw.description || "")
      .trim()
      .slice(0, 300),

    year: String(raw.year || "")
      .trim()
      .slice(0, 4),

    image,

    featured: String(Boolean(raw.featured)),
  };
}

export const handler = async (event) => {
  try {
    const op = event.queryStringParameters?.op || "";

    const rows = await getRows();

    const auth = getAuthRow(rows);

    if (!auth) {
      return json(500, {
        error: "Archive authentication record is missing.",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | LOGIN
    |--------------------------------------------------------------------------
    */

    if (op === "login" && event.httpMethod === "POST") {
      const { password } = parseBody(event);

      if (!verifyPassword(String(password || ""), auth.password_hash)) {
        return json(401, {
          error: "Access denied.",
        });
      }

      const token = makeToken(auth.password_hash);

      return json(
        200,
        {
          ok: true,
        },
        {
          "Set-Cookie": cookie(token),
        },
      );
    }

    /*
    |--------------------------------------------------------------------------
    | LOGOUT
    |--------------------------------------------------------------------------
    */

    if (op === "logout" && event.httpMethod === "POST") {
      return json(
        200,
        {
          ok: true,
        },
        {
          "Set-Cookie": cookie("", 0),
        },
      );
    }

    /*
    |--------------------------------------------------------------------------
    | SESSION CHECK
    |--------------------------------------------------------------------------
    */

    if (op === "session") {
      return isAuthed(event, rows)
        ? json(200, {
            ok: true,
          })
        : json(401, {
            error: "Not authorized.",
          });
    }

    /*
    |--------------------------------------------------------------------------
    | PROTECT EVERYTHING BELOW
    |--------------------------------------------------------------------------
    */

    if (!isAuthed(event, rows)) {
      return json(401, {
        error: "Not authorized.",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | GET PROJECTS
    |--------------------------------------------------------------------------
    */

    if (op === "items" && event.httpMethod === "GET") {
      const items = rows
        .filter((row) => row.type === "website" || row.type === "proposal")
        .map(({ password_hash, ...row }) => row);

      return json(200, {
        items,
      });
    }

    /*
    |--------------------------------------------------------------------------
    | ADD / UPDATE PROJECT
    |--------------------------------------------------------------------------
    */

    if (op === "item" && event.httpMethod === "POST") {
      const item = sanitizeItem(parseBody(event));

      const index = rows.findIndex(
        (row) =>
          row.id === item.id &&
          (row.type === "website" || row.type === "proposal"),
      );

      if (index >= 0) {
        rows[index] = {
          ...rows[index],
          ...item,
          password_hash: "",
        };
      } else {
        rows.push({
          ...item,
          password_hash: "",
        });
      }

      await saveRows(rows);

      return json(200, {
        ok: true,
        item,
      });
    }

    /*
    |--------------------------------------------------------------------------
    | DELETE PROJECT
    |--------------------------------------------------------------------------
    */

    if (op === "item" && event.httpMethod === "DELETE") {
      const { id } = parseBody(event);

      const index = rows.findIndex(
        (row) =>
          row.id === String(id) &&
          (row.type === "website" || row.type === "proposal"),
      );

      if (index < 0) {
        return json(404, {
          error: "Archive entry not found.",
        });
      }

      rows.splice(index, 1);

      await saveRows(rows);

      return json(200, {
        ok: true,
      });
    }

    /*
    |--------------------------------------------------------------------------
    | CHANGE PASSWORD
    |--------------------------------------------------------------------------
    */

    if (op === "password" && event.httpMethod === "POST") {
      const { currentPassword, newPassword } = parseBody(event);

      if (!verifyPassword(String(currentPassword || ""), auth.password_hash)) {
        return json(401, {
          error: "Current password is incorrect.",
        });
      }

      if (String(newPassword || "").length < 8) {
        return json(400, {
          error: "New password must be at least 8 characters.",
        });
      }

      auth.password_hash = scryptHash(String(newPassword));

      await saveRows(rows);

      return json(
        200,
        {
          ok: true,
        },
        {
          "Set-Cookie": cookie("", 0),
        },
      );
    }

    return json(404, {
      error: "Unknown archive operation.",
    });
  } catch (error) {
    console.error("Vault function error:", error);

    return json(500, {
      error: error?.message || "Server error.",
    });
  }
};
