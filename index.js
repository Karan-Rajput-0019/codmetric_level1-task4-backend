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

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const app = express();
app.use(express.json());

// ✅ Temporarily allow all origins
app.use(cors());

app.use(express.urlencoded({ extended: true }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: parseInt(MAX_UPLOAD_BYTES, 10) }
});

// Health check
app.get("/health", (_req, res) => res.json({ ok: true }));

// ✅ New sign-in route
app.post("/api/signin", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "Invalid email" });
    }

    // You can add Supabase auth logic here if needed
    res.status(200).json({ message: "Sign-in successful", email });
  } catch (err) {
    console.error("Sign-in error:", err.message);
    res.status(500).json({ error: "Failed to sign in" });
  }
});

// Fetch posts (paginated)
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
    console.error("Error fetching posts:", err.message);
    res.status(500).json({ error: err.message || "Failed to fetch posts" });
  }
});

// Create post
app.post("/api/posts", upload.single("image"), async (req, res) => {
  try {
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "Missing auth token" });

    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false }
    });
    const { data: authData, error: authError } = await client.auth.getUser(token);
    if (authError || !authData?.user) return res.status(401).json({ error: "Invalid token" });

    const user = authData.user;
    const title = (req.body.title || "").trim();
    const story = (req.body.story || "").trim();
    const location = (req.body.location || "").trim();
    const displayName = (req.body.displayName || user.user_metadata?.full_name || user.email?.split("@")[0] || "Anonymous").slice(0, 120);

    if (!title || !story || title.length > 200 || story.length > 2000) {
      return res.status(400).json({ error: "Title and story are required and must be within limits." });
    }

    let image_url = null;
    if (req.file) {
      const ext = path.extname(req.file.originalname) || ".jpg";
      const filename = `post_${Date.now()}_${Math.random().toString(36).slice(2, 9)}${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(filename, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { publicURL } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filename);
      image_url = publicURL;
    }

    const { data: postData, error: insertError } = await supabase
      .from("posts")
      .insert([{
        author_id: user.id,
        author_display_name: displayName,
        title,
        story,
        location,
        image_url
      }])
      .select()
      .single();

    if (insertError) throw insertError;

    res.status(201).json({ post: postData });
  } catch (err) {
    console.error("Error creating post:", err.message);
    res.status(500).json({ error: err.message || "Failed to create post" });
  }
});

// Serve static frontend (optional)
const publicDir = path.join(process.cwd(), "public");
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get("*", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));
}

app.listen(PORT, () => console.log(`✅ Server listening on port ${PORT}`));