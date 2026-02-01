const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();

// ---- MIDDLEWARE ----
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---- ACCOUNTS DIR (ABSOLUTE, SAFE) ----
const ACCOUNTS_DIR = path.join(__dirname, "accounts");

if (!fs.existsSync(ACCOUNTS_DIR)) {
  fs.mkdirSync(ACCOUNTS_DIR, { recursive: true });
  console.log("✅ Created /accounts directory at:", ACCOUNTS_DIR);
}

// ---- UTILS ----
function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function generateSystemKey() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

function parseAccount(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const obj = {};
  raw.split("\n").forEach(line => {
    const [k, v] = line.split("=");
    obj[k] = v;
  });
  obj.metals = JSON.parse(obj.metals || "{}");
  obj.items = JSON.parse(obj.items || "[]");
  obj.cash = Number(obj.cash || 0);
  return obj;
}

function writeAccount(filePath, data) {
  const content = [
    `username=${data.username}`,
    `passwordHash=${data.passwordHash}`,
    `systemKey=${data.systemKey}`,
    `cash=${data.cash}`,
    `metals=${JSON.stringify(data.metals)}`,
    `items=${JSON.stringify(data.items)}`,
    `created=${data.created}`,
    `lastUpdated=${new Date().toISOString()}`
  ].join("\n");

  fs.writeFileSync(filePath, content, "utf8");
}


// ---- CREATE ACCOUNT ----
app.post("/api/create-account", (req, res) => {
  console.log("📥 Create account request:", req.body);

  const { username, password } = req.body;

  if (!username || !password) {
    console.log("❌ Missing fields");
    return res.status(400).json({ error: "Missing username or password" });
  }

  const accountFile = path.join(ACCOUNTS_DIR, `${username}.txt`);

  if (fs.existsSync(accountFile)) {
    console.log("❌ Account already exists:", username);
    return res.status(409).json({ error: "Account already exists" });
  }

  const accountData = [
    `username=${username}`,
    `passwordHash=${hashPassword(password)}`,
    `systemKey=${generateSystemKey()}`,
    `balance=1000`,
    `inventory=[]`,
    `created=${new Date().toISOString()}`
  ].join("\n");

  try {
    fs.writeFileSync(accountFile, accountData, "utf8");
    console.log("✅ Account file created:", accountFile);
    res.json({ success: true });
  } catch (err) {
    console.error("🔥 FILE WRITE FAILED:", err);
    res.status(500).json({ error: "Failed to create account file" });
  }
});

// ---- LOGIN ----
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  const accountFile = path.join(ACCOUNTS_DIR, `${username}.txt`);

  if (!fs.existsSync(accountFile)) {
    return res.status(404).json({ error: "Account not found" });
  }

  const raw = fs.readFileSync(accountFile, "utf8");
  const data = Object.fromEntries(raw.split("\n").map(l => l.split("=")));

  if (data.passwordHash !== hashPassword(password)) {
    return res.status(401).json({ error: "Invalid password" });
  }

  res.json({
    username: data.username,
    balance: Number(data.balance),
    inventory: JSON.parse(data.inventory),
    systemKey: data.systemKey
  });
});

// ---- SAVE GAME STATE ----
app.post("/api/save", (req, res) => {
  const { username, balance, inventory } = req.body;
  const accountFile = path.join(ACCOUNTS_DIR, `${username}.txt`);

  if (!fs.existsSync(accountFile)) {
    return res.status(404).json({ error: "Account not found" });
  }

  let content = fs.readFileSync(accountFile, "utf8");
  content = content.replace(/balance=.*/g, `balance=${balance}`);
  content = content.replace(/inventory=.*/g, `inventory=${JSON.stringify(inventory)}`);

  fs.writeFileSync(accountFile, content, "utf8");
  res.json({ success: true });
});

app.post("/api/save-game", (req, res) => {
  const { username, cash, metals, items } = req.body;
  const file = path.join(ACCOUNTS_DIR, `${username}.txt`);

  if (!fs.existsSync(file)) return res.sendStatus(404);

  const acc = parseAccount(file);
  acc.cash = cash;
  acc.metals = metals;
  acc.items = items;

  writeAccount(file, acc);
  res.json({ success: true });
});

//--networth--
const ITEM_VALUES = {
  Bicycle: 300,
  Apartment: 120000,
  House: 250000,
  "BYD Electric Car": 38000,
  Garden: 6000,
  Dog: 1200,
  Cat: 800
};

function calculateNetWorth(acc, currentPrices) {
  let metalsValue = 0;
  Object.keys(acc.metals).forEach(m => {
    metalsValue += acc.metals[m] * (currentPrices[m] || 0);
  });

  let itemValue = acc.items.reduce((sum, i) => sum + (ITEM_VALUES[i] || 0), 0);

  return acc.cash + metalsValue + itemValue;
}

//--leaderboard--
let leaderboardCache = [];
let lastLeaderboardUpdate = 0;

function updateLeaderboard() {
  const files = fs.readdirSync(ACCOUNTS_DIR);
  leaderboardCache = files.map(f => {
    const acc = parseAccount(path.join(ACCOUNTS_DIR, f));
    return {
      username: acc.username,
      netWorth: calculateNetWorth(acc, CURRENT_PRICES)
    };
  }).sort((a,b)=>b.netWorth - a.netWorth);

  lastLeaderboardUpdate = Date.now();
  console.log("🏆 Leaderboard updated");
}

setInterval(updateLeaderboard, 30 * 60 * 1000);


// ---- START SERVER ----
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


