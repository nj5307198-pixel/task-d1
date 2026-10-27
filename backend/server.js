require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const { admin, db } = require("./firebaseAdmin");

// Fail fast if required configuration is missing
if (!process.env.ELASTICEMAIL_API_KEY || !process.env.ELASTICEMAIL_FROM_EMAIL) {
  console.error("Missing ELASTICEMAIL_API_KEY or ELASTICEMAIL_FROM_EMAIL in .env");
  process.exit(1);
}
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error("Missing JWT_SECRET in .env (use at least 32 random characters)");
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "2h";
const SALT_ROUNDS = 10;

app.use(cors()); // allow the React frontend (Vite dev server) to call this API
app.use(express.json());

// Malformed JSON bodies -> 400 instead of a default HTML error page
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ message: "Request body must be valid JSON." });
  }
  return next(err);
});

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const usersCol = () => db.collection("users");

// Existing accounts (created before D1) have no plan field -> treat as free
const publicUser = (data) => ({
  name: data.name,
  email: data.email,
  plan: data.plan === "paid" ? "paid" : "free",
});

const signToken = (user) =>
  jwt.sign({ sub: user.email, name: user.name }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });

// Used so that "unknown email" and "wrong password" take similar time
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password-1", SALT_ROUNDS);

// Verifies "Authorization: Bearer <jwt>" and puts the email on req.userEmail
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ message: "You need to log in first." });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userEmail = payload.sub;
    return next();
  } catch {
    return res
      .status(401)
      .json({ message: "Your session has expired. Please log in again." });
  }
}

/* ------------------------------------------------------------------ */
/* Validation schemas (Zod)                                            */
/* ------------------------------------------------------------------ */

const emailField = z
  .string({ required_error: "Email is required.", invalid_type_error: "Email must be text." })
  .trim()
  .toLowerCase()
  .min(1, "Email is required.")
  .max(254, "Email is too long.")
  .email("Please provide a valid email address.");

const subscribeSchema = z.object({ email: emailField });

const registerSchema = z.object({
  name: z
    .string({ required_error: "Name is required." })
    .trim()
    .max(100, "Name is too long.")
    .refine((v) => v.split(/\s+/).filter(Boolean).length >= 2, "Enter your first and last name."),
  email: emailField,
  password: z
    .string({ required_error: "Password is required." })
    .min(8, "Use at least 8 characters.")
    .max(72, "Password must be 72 characters or fewer.") // bcrypt ignores bytes past 72
    .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "Include at least one letter and one number."),
});

const loginSchema = z.object({
  email: emailField,
  password: z.string({ required_error: "Password is required." }).min(1, "Password is required."),
});

// Luhn check: catches mistyped card numbers
function luhnValid(digits) {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

const paymentSchema = z.object({
  cardName: z
    .string({ required_error: "Name on card is required." })
    .trim()
    .min(2, "Enter the name on the card.")
    .max(100, "Name on card is too long."),
  cardNumber: z
    .string({ required_error: "Card number is required." })
    .transform((v) => v.replace(/[\s-]/g, ""))
    .refine((v) => /^\d{13,19}$/.test(v) && luhnValid(v), "Enter a valid card number."),
  expiry: z
    .string({ required_error: "Expiry date is required." })
    .trim()
    .refine((v) => {
      const m = /^(\d{2})\/(\d{2})$/.exec(v);
      if (!m) return false;
      const month = Number(m[1]);
      const year = 2000 + Number(m[2]);
      if (month < 1 || month > 12) return false;
      // valid through the last day of the expiry month
      return new Date(year, month, 1) > new Date();
    }, "Enter a valid expiry date (MM/YY) that hasn't passed."),
  cvc: z
    .string({ required_error: "CVC is required." })
    .trim()
    .regex(/^\d{3,4}$/, "Enter the 3 or 4 digit CVC."),
});


const MAX_TAGS = 3;

const tagsField = z
  .array(z.string().trim().min(1).max(20, "Each tag must be 20 characters or fewer."))
  .max(MAX_TAGS, `You can add up to ${MAX_TAGS} tags only.`)
  .default([])
  .refine(
    (tags) => new Set(tags.map((t) => t.toLowerCase())).size === tags.length,
    "Tags must be unique."
  );

const titleField = z
  .string({ required_error: "Please enter a title." })
  .trim()
  .min(5, "Title must be at least 5 characters.")
  .max(120, "Title must be 120 characters or fewer.");

const postSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("question"),
    title: titleField,
    description: z
      .string({ required_error: "Please describe your problem." })
      .trim()
      .min(20, "Please give a bit more detail (at least 20 characters).")
      .max(10000, "Description is too long."),
    tags: tagsField,
  }),
  z.object({
    type: z.literal("article"),
    title: titleField,
    abstract: z
      .string({ required_error: "Please enter an abstract." })
      .trim()
      .min(20, "Abstract must be at least 20 characters.")
      .max(500, "Abstract must be 500 characters or fewer."),
    articleText: z
      .string({ required_error: "Please enter your article text." })
      .trim()
      .min(50, "Article text must be at least 50 characters.")
      .max(50000, "Article text is too long."),
    tags: tagsField,
  }),
], { errorMap: () => ({ message: "Post type must be question or article." }) });

/* ------------------------------------------------------------------ */
/* Auth routes                                                         */
/* ------------------------------------------------------------------ */

// POST /register - validate, hash the password, store the user in Firestore
app.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0].message });
  }
  const { name, email, password } = parsed.data;

  try {
    const ref = usersCol().doc(email); // email as doc id => no duplicate accounts
    if ((await ref.get()).exists) {
      return res
        .status(409)
        .json({ code: "EMAIL_EXISTS", message: "An account with this email already exists." });
    }
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    await ref.set({
      name,
      email,
      passwordHash,
      plan: "free",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return res.status(201).json({ message: "Account created." });
  } catch (error) {
    console.error("Register failed:", error.message);
    return res.status(500).json({ message: "Could not create your account. Please try again." });
  }
});

// POST /login - check credentials, return a signed JWT
app.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0].message });
  }
  const { email, password } = parsed.data;

  try {
    const snap = await usersCol().doc(email).get();
    const user = snap.exists ? snap.data() : null;
    const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);

    if (!user || !ok) {
      return res
        .status(401)
        .json({ code: "INVALID_CREDENTIALS", message: "Incorrect email or password." });
    }
    return res.status(200).json({ token: signToken(user), user: publicUser(user) });
  } catch (error) {
    console.error("Login failed:", error.message);
    return res.status(500).json({ message: "Could not log you in. Please try again." });
  }
});

// GET /me - the logged-in user's current details (plan is read fresh from Firestore)
app.get("/me", requireAuth, async (req, res) => {
  try {
    const snap = await usersCol().doc(req.userEmail).get();
    if (!snap.exists) {
      return res.status(401).json({ message: "Account not found. Please log in again." });
    }
    return res.status(200).json({ user: publicUser(snap.data()) });
  } catch (error) {
    console.error("/me failed:", error.message);
    return res.status(500).json({ message: "Could not load your account." });
  }
});

/* ------------------------------------------------------------------ */
/* Subscription                                                        */
/* ------------------------------------------------------------------ */

// POST /upgrade - validate payment details, then set plan to "paid" in Firestore.
// Card details are only validated; they are never stored or logged.
app.post("/upgrade", requireAuth, async (req, res) => {
  const parsed = paymentSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0].message });
  }

  try {
    const ref = usersCol().doc(req.userEmail);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(401).json({ message: "Account not found. Please log in again." });
    }
    if (snap.data().plan === "paid") {
      return res.status(409).json({ message: "You're already on the Paid plan." });
    }

    await ref.update({
      plan: "paid",
      upgradedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const updated = await ref.get();
    return res.status(200).json({
      message: "Upgrade complete. Welcome to the Paid plan!",
      user: publicUser(updated.data()),
    });
  } catch (error) {
    console.error("Upgrade failed:", error.message);
    return res.status(500).json({ message: "Could not upgrade your plan. Please try again." });
  }
});

/* ------------------------------------------------------------------ */
/* Posts                                                               */
/* ------------------------------------------------------------------ */

// POST /posts - save a question or article to Firestore (login required)
app.post("/posts", requireAuth, async (req, res) => {
  const parsed = postSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0].message });
  }

  try {
    const userSnap = await usersCol().doc(req.userEmail).get();
    if (!userSnap.exists) {
      return res.status(401).json({ message: "Account not found. Please log in again." });
    }

    const ref = await db.collection("posts").add({
      ...parsed.data,
      authorEmail: req.userEmail,
      authorName: userSnap.data().name,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return res.status(201).json({ message: "Post saved.", id: ref.id });
  } catch (error) {
    console.error("Save post failed:", error.message);
    return res.status(500).json({ message: "Could not save your post. Please try again." });
  }
});

/* ------------------------------------------------------------------ */
/* Newsletter (Task P5)                                                */
/* ------------------------------------------------------------------ */

const ELASTIC_EMAIL_API_URL = "https://api.elasticemail.com/v4/emails/transactional";
const subscribers = [];

// POST /subscribe - send a welcome email, then add the subscriber
app.post("/subscribe", async (req, res) => {
  const parsed = subscribeSchema.safeParse(req.body ?? {});

  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0].message });
  }

  const { email } = parsed.data;

  if (subscribers.includes(email)) {
    return res.status(200).json({ message: "You're already subscribed!" });
  }

  try {
    const response = await fetch(ELASTIC_EMAIL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ElasticEmail-ApiKey": process.env.ELASTICEMAIL_API_KEY,
      },
      body: JSON.stringify({
        Recipients: { To: [email] },
        Content: {
          From: process.env.ELASTICEMAIL_FROM_EMAIL,
          Subject: "Welcome to DEV@Deakin!",
          Body: [
            {
              ContentType: "HTML",
              Content:
                "<strong>Thanks for subscribing to the DEV@Deakin Daily Insider newsletter!</strong>",
            },
          ],
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Elastic Email error:", response.status, data);
      return res
        .status(502)
        .json({ message: "We couldn't send the welcome email. Please try again." });
    }

    subscribers.push(email);
    console.log(`Email sent to ${email} - Status: ${response.status}, MessageID: ${data.MessageID}`);

    return res.status(200).json({
      message: "Subscribed! A welcome email is on its way.",
      messageId: data.MessageID,
    });
  } catch (error) {
    console.error("Elastic Email request failed:", error.message);
    return res
      .status(502)
      .json({ message: "We couldn't send the welcome email. Please try again." });
  }
});

// GET /subscribers - helper route to verify the mailing list while testing
app.get("/subscribers", (req, res) => {
  res.status(200).json({ count: subscribers.length, subscribers });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});