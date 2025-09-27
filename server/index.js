import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import fs from "fs";

dotenv.config();

const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  PORT = 4000,
  STORAGE_BUCKET = "posts",
  MAX_UPLOAD_BYTES = 10 * 1024 * 1024,
  CORS_ORIGINS = "http://localhost:3000"
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing Supabase config in .env");
  process.exit(1);
}

// Supabase client with service role for server operations
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const app = express();
app.use(express.json());
app.use(cors({ origin: CORS_ORIGINS.split(",") }));

// Multer memory storage so we can forward file to Supabase
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: parseInt(MAX_UPLOAD_BYTES, 10) }
});

// Health
app.get("/health", (_req, res) => res.json({ ok: true }));

// Public posts (paginated)
app.get("/api/posts", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "20", 10), 100);
    const offset = parseInt(req.query.offset || "0", 10);

    const { data, error } = await supabase
      .from("posts")
      .select("id, title, story, location, image_url, created_at, author_display_name, author_id")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    res.json({ posts: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch posts" });
  }
});

// Create post: requires user to be authenticated client-side with Supabase and send their access token
app.post("/api/posts", upload.single("image"), async (req, res) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "Missing auth token" });

    // verify token using Supabase (anon key client can decode)
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const resp = await client.auth.getUser(token);
    if (!resp || !resp.data || !resp.data.user) return res.status(401).json({ error: "Invalid token" });
    const user = resp.data.user;

    const title = (req.body.title || "").trim();
    const story = (req.body.story || "").trim();
    const location = (req.body.location || "").trim();
    const displayName = (req.body.displayName || user.user_metadata?.full_name || user.email?.split("@")[0] || "Anonymous").slice(0, 120);

    if (!title || !story) return res.status(400).json({ error: "Title and story required" });

    let image_url = null;
    if (req.file) {
      const ext = path.extname(req.file.originalname) || ".jpg";
      const filename = `post_${Date.now()}_${Math.random().toString(36).slice(2, 9)}${ext}`;
      // upload to Supabase Storage using service role (server client)
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(filename, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
      if (uploadError) throw uploadError;

      // create public URL (if bucket is public) or signed URL
      const { publicURL } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filename);
      image_url = publicURL;
    }

    // Insert post record
    const { data, error } = await supabase.from("posts").insert([
      {
        author_id: user.id,
        author_display_name: displayName,
        title,
        story,
        location,
        image_url
      }
    ]).select().single();

    if (error) throw error;

    res.status(201).json({ post: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create post" });
  }
});

// Serve static frontend if built into server/public (optional)
const publicDir = path.join(process.cwd(), "public");
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get("*", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));
}

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));